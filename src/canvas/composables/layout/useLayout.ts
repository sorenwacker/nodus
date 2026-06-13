/**
 * Layout composable
 * Orchestrates node layout algorithms and animations
 */
import { type Ref } from 'vue'
import { NODE_DEFAULTS } from '../../constants'
import {
  pushNodesOutOfFrames,
  constrainNodesToFrame,
  type FrameRect,
  type NodeSize,
} from './useFrameCollision'
import {
  createLayoutAnimator,
  animateToPositions as animatePositions,
} from './useLayoutAnimation'
import { batchUpdatePositions } from '../../layout/fastGrid'
import { executeAutoLayout, type LayoutType } from './useAutoLayout'
import { computeRadialLayout } from './useRadialLayout'
import {
  getAvailableLayouts,
  executeStrategy as executeLayoutStrategy,
  fitToContent as fitViewportToContent,
} from './useLayoutStrategies'

interface Node {
  id: string
  canvas_x: number
  canvas_y: number
  width?: number
  height?: number
  frame_id?: string | null
}

interface Frame {
  id: string
  canvas_x: number
  canvas_y: number
  width: number
  height: number
  title?: string
}

interface Edge {
  id: string
  source_node_id: string
  target_node_id: string
}

interface Store {
  getNodes: () => Node[]
  getFilteredNodes: () => Node[]
  getFilteredEdges: () => Edge[]
  getFilteredFrames: () => Frame[]
  getSelectedNodeIds: () => string[]
  getNode: (id: string) => Node | undefined
  updateNodePosition: (id: string, x: number, y: number) => void
  updateFramePosition: (id: string, x: number, y: number) => void
  updateFrameSize: (id: string, width: number, height: number) => void
  layoutNodes: (nodeIds?: string[], options?: { centerX: number; centerY: number }) => Promise<void>
}

interface ViewState {
  scale: Ref<number>
  offsetX: Ref<number>
  offsetY: Ref<number>
  canvasRect: () => DOMRect | null
}

export interface UseLayoutOptions {
  store: Store
  viewState: ViewState
  pushUndo: () => void
}

export function useLayout(options: UseLayoutOptions) {
  const { store, viewState, pushUndo } = options

  // Animation state
  const animationState = createLayoutAnimator()

  // Flag to prevent concurrent layout operations (rapid clicking)
  let isLayoutInProgress = false

  function stopAnimation() {
    animationState.stop()
  }

  function animateToPositions(targets: Map<string, { x: number; y: number }>, duration = 400) {
    animatePositions(
      targets,
      (id: string) => {
        const node = store.getNodes().find(n => n.id === id)
        return node ? { x: node.canvas_x, y: node.canvas_y } : null
      },
      store.updateNodePosition,
      animationState,
      duration
    )
  }

  // Helper to get frames for collision detection
  function getFramesForCollision(): FrameRect[] {
    return store.getFilteredFrames()
  }

  // Wrapper for pushNodesOutOfFrames that gets frames from store
  function pushOutOfFrames(
    positions: Map<string, { x: number; y: number }>,
    nodeMap: Map<string, NodeSize>
  ): Map<string, { x: number; y: number }> {
    return pushNodesOutOfFrames(positions, nodeMap, getFramesForCollision())
  }

  /**
   * Apply frame constraints to positions - either constrain within a frame or push out of all frames
   */
  function applyFrameConstraints(
    positions: Map<string, { x: number; y: number }>,
    nodes: Node[],
    targetFrame?: Frame
  ): Map<string, { x: number; y: number }> {
    const nodeMap = new Map(nodes.map(n => [n.id, { width: n.width, height: n.height }]))
    return targetFrame
      ? constrainNodesToFrame(positions, nodeMap, targetFrame)
      : pushOutOfFrames(positions, nodeMap)
  }

  /**
   * Expand frames to fit their assigned nodes after layout.
   * Called after layout to ensure frames contain all their nodes.
   */
  async function expandFramesToFitNodes(): Promise<void> {
    const allNodes = store.getFilteredNodes()
    const allFrames = store.getFilteredFrames()
    const frameMap = new Map(allFrames.map(f => [f.id, f]))

    // Group nodes by their frame_id
    const nodesByFrame = new Map<string, Node[]>()
    for (const node of allNodes) {
      if (node.frame_id && frameMap.has(node.frame_id)) {
        if (!nodesByFrame.has(node.frame_id)) {
          nodesByFrame.set(node.frame_id, [])
        }
        nodesByFrame.get(node.frame_id)!.push(node)
      }
    }

    const padding = 30

    // For each frame, expand it to fit all its nodes
    for (const [frameId, nodes] of nodesByFrame) {
      const frame = frameMap.get(frameId)!

      // Calculate bounding box of all nodes in this frame
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
      for (const node of nodes) {
        const nodeWidth = node.width || NODE_DEFAULTS.WIDTH
        const nodeHeight = node.height || NODE_DEFAULTS.HEIGHT
        minX = Math.min(minX, node.canvas_x)
        minY = Math.min(minY, node.canvas_y)
        maxX = Math.max(maxX, node.canvas_x + nodeWidth)
        maxY = Math.max(maxY, node.canvas_y + nodeHeight)
      }

      if (!Number.isFinite(minX)) continue

      // Calculate required frame bounds with padding
      const requiredLeft = minX - padding
      const requiredTop = minY - padding
      const requiredRight = maxX + padding
      const requiredBottom = maxY + padding

      // Expand frame if needed (never shrink)
      let newFrameX = frame.canvas_x
      let newFrameY = frame.canvas_y
      let newFrameWidth = frame.width
      let newFrameHeight = frame.height

      // Expand left
      if (requiredLeft < frame.canvas_x) {
        const expandBy = frame.canvas_x - requiredLeft
        newFrameX = requiredLeft
        newFrameWidth += expandBy
      }

      // Expand top
      if (requiredTop < frame.canvas_y) {
        const expandBy = frame.canvas_y - requiredTop
        newFrameY = requiredTop
        newFrameHeight += expandBy
      }

      // Expand right
      const currentRight = newFrameX + newFrameWidth
      if (requiredRight > currentRight) {
        newFrameWidth = requiredRight - newFrameX
      }

      // Expand bottom
      const currentBottom = newFrameY + newFrameHeight
      if (requiredBottom > currentBottom) {
        newFrameHeight = requiredBottom - newFrameY
      }

      // Apply frame changes
      const posChanged = newFrameX !== frame.canvas_x || newFrameY !== frame.canvas_y
      const sizeChanged = newFrameWidth !== frame.width || newFrameHeight !== frame.height

      if (posChanged) {
        store.updateFramePosition(frameId, newFrameX, newFrameY)
      }
      if (sizeChanged) {
        store.updateFrameSize(frameId, newFrameWidth, newFrameHeight)
      }
    }
  }

  /**
   * Radial/concentric layout - places selected node at center with neighbors in rings
   */
  async function radialLayout(): Promise<void> {
    const result = computeRadialLayout({
      getSelectedNodeIds: store.getSelectedNodeIds,
      getNode: store.getNode,
      getFilteredNodes: store.getFilteredNodes,
      getFilteredEdges: store.getFilteredEdges,
      getFilteredFrames: store.getFilteredFrames,
      applyFrameConstraints,
    })

    if (!result) return

    pushUndo()
    stopAnimation()

    const { targets, zOrder } = result

    // Animate to positions
    if (targets.size > 200) {
      await batchUpdatePositions(targets, store.updateNodePosition, 100)
    } else {
      animateToPositions(targets, 600)
    }

    // Dispatch z-order event
    window.dispatchEvent(new CustomEvent('nodus-radial-z-order', { detail: zOrder }))
  }

  async function autoLayout(layout: LayoutType = 'grid', frameId?: string) {
    // Prevent concurrent layout operations (rapid clicking)
    if (isLayoutInProgress) {
      console.debug('[Layout] Skipping - layout already in progress')
      return
    }
    isLayoutInProgress = true

    try {
      // Radial layout is handled separately
      if (layout === 'radial') {
        await radialLayout()
        return
      }

      pushUndo()
      stopAnimation()

      await executeAutoLayout(layout, frameId, {
        store,
        animateToPositions,
        applyFrameConstraints,
        pushOutOfFrames,
        expandFramesToFitNodes,
      })
    } finally {
      isLayoutInProgress = false
    }
  }

  function fitToContent() {
    fitViewportToContent(store, viewState)
  }

  /**
   * Execute a registered layout strategy by name
   */
  async function executeStrategy(
    strategyName: string,
    options?: { animate?: boolean; duration?: number }
  ): Promise<void> {
    await executeLayoutStrategy(strategyName, {
      store,
      viewState,
      pushUndo,
      stopAnimation,
      animateToPositions,
      applyFrameConstraints,
    }, options)
  }

  return {
    stopAnimation,
    animateToPositions,
    autoLayout,
    radialLayout,
    fitToContent,
    // Strategy pattern methods
    getAvailableLayouts,
    executeStrategy,
  }
}
