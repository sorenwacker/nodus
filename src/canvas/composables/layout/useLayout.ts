/**
 * Layout composable
 * Handles node layout algorithms and animations
 */
import { type Ref } from 'vue'
import { NODE_DEFAULTS } from '../../constants'
import { applyForceLayout, applyHierarchicalLayout, layoutRegistry } from '../../layout'
import { fastGridLayout, batchUpdatePositions } from '../../layout/fastGrid'
import type { LayoutNode as StrategyLayoutNode, LayoutEdge as StrategyLayoutEdge } from '../../layout/types'
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
import { tetrisGridLayout } from './useTetrisLayout'
import { canvasStorage } from '../../../lib/storage'

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

// Constant for frame virtual node prefix
const FRAME_PREFIX = '___FRAME___'

/**
 * Shared context for frame-aware layout algorithms
 */
interface FrameAwareLayoutContext {
  virtualNodes: Node[]
  allFrames: Frame[]
  frameNodes: Map<string, Node[]>
  frameId: string | null
  centerX: number
  centerY: number
  nodes: Node[]
  targetFrame: FrameRect | null
}

/**
 * Prepare layout data structures for frame-aware layouts (force, hierarchical)
 */
function prepareFrameAwareLayout(
  ctx: FrameAwareLayoutContext,
  edges: Edge[]
): {
  layoutNodes: Array<{ id: string; x: number; y: number; width: number; height: number }>
  layoutEdges: Array<{ source: string; target: string }>
  frameSnapshot: Map<string, { x: number; y: number }>
  nodeToFrameId: Map<string, string>
} {
  const { virtualNodes, allFrames, frameNodes, frameId } = ctx

  // Build layout nodes from virtualNodes
  const layoutNodes = virtualNodes.map(n => ({
    id: n.id,
    x: n.canvas_x,
    y: n.canvas_y,
    width: n.width || NODE_DEFAULTS.WIDTH,
    height: n.height || NODE_DEFAULTS.HEIGHT,
  }))

  const frameSnapshot = new Map<string, { x: number; y: number }>()
  const nodeToFrameId = new Map<string, string>()

  if (!frameId) {
    // Global layout: add frames as virtual nodes
    for (const frame of allFrames) {
      frameSnapshot.set(frame.id, { x: frame.canvas_x, y: frame.canvas_y })
      layoutNodes.push({
        id: FRAME_PREFIX + frame.id,
        x: frame.canvas_x + frame.width / 2,
        y: frame.canvas_y + frame.height / 2,
        width: frame.width,
        height: frame.height,
      })
    }

    // Map framed nodes to their frame
    for (const [fId, nodesInFrame] of frameNodes) {
      for (const node of nodesInFrame) {
        nodeToFrameId.set(node.id, fId)
      }
    }
  }

  // Build a set of all layout node IDs
  const layoutNodeIds = new Set(layoutNodes.map(n => n.id))

  // Build edges - remap framed nodes to their frame's virtual node
  const layoutEdges = edges
    .map(e => {
      if (!frameId) {
        const sourceFrameId = nodeToFrameId.get(e.source_node_id)
        const targetFrameId = nodeToFrameId.get(e.target_node_id)
        return {
          source: sourceFrameId ? FRAME_PREFIX + sourceFrameId : e.source_node_id,
          target: targetFrameId ? FRAME_PREFIX + targetFrameId : e.target_node_id,
        }
      }
      return {
        source: e.source_node_id,
        target: e.target_node_id,
      }
    })
    .filter(e => layoutNodeIds.has(e.source) && layoutNodeIds.has(e.target))
    .filter(e => e.source !== e.target)

  return { layoutNodes, layoutEdges, frameSnapshot, nodeToFrameId }
}

/**
 * Process layout results for frame-aware layouts
 * Handles frame movement and constraint application
 */
function processFrameAwareLayoutResults(
  ctx: FrameAwareLayoutContext,
  positions: Map<string, { x: number; y: number }>,
  frameSnapshot: Map<string, { x: number; y: number }>,
  updateFramePosition: (id: string, x: number, y: number) => void,
  pushOutOfFrames: (targets: Map<string, { x: number; y: number }>, nodeSizes: Map<string, NodeSize>) => Map<string, { x: number; y: number }>
): Map<string, { x: number; y: number }> {
  const { virtualNodes, allFrames, frameNodes, frameId, nodes, targetFrame } = ctx

  // Build final targets map - exclude frame virtual nodes
  const nodeTargets = new Map<string, { x: number; y: number }>()
  for (const [id, pos] of positions) {
    if (!id.startsWith(FRAME_PREFIX)) {
      nodeTargets.set(id, pos)
    }
  }

  // For global layout, move frames and their contents together
  if (!frameId) {
    for (const frame of allFrames) {
      const virtualId = FRAME_PREFIX + frame.id
      const newPos = positions.get(virtualId)
      if (!newPos) continue

      const oldPos = frameSnapshot.get(frame.id)
      if (!oldPos) continue

      const oldCenterX = oldPos.x + frame.width / 2
      const oldCenterY = oldPos.y + frame.height / 2
      const deltaX = newPos.x - oldCenterX
      const deltaY = newPos.y - oldCenterY

      if (Math.abs(deltaX) < 1 && Math.abs(deltaY) < 1) continue

      updateFramePosition(frame.id, oldPos.x + deltaX, oldPos.y + deltaY)

      const nodesInFrame = frameNodes.get(frame.id) || []
      for (const node of nodesInFrame) {
        nodeTargets.set(node.id, {
          x: node.canvas_x + deltaX,
          y: node.canvas_y + deltaY,
        })
      }
    }
  }

  // Apply frame constraints
  if (frameId) {
    // Frame-scoped: constrain nodes to stay inside the frame
    return targetFrame
      ? constrainNodesToFrame(nodeTargets, new Map(nodes.map(n => [n.id, { width: n.width, height: n.height }])), targetFrame)
      : nodeTargets
  } else {
    // Global: push unframed nodes out of frames
    const unframedIds = new Set(virtualNodes.map(n => n.id))
    const unframedTargets = new Map<string, { x: number; y: number }>()
    const framedTargets = new Map<string, { x: number; y: number }>()

    for (const [id, pos] of nodeTargets) {
      if (unframedIds.has(id)) {
        unframedTargets.set(id, pos)
      } else {
        framedTargets.set(id, pos)
      }
    }

    const pushedUnframed = pushOutOfFrames(
      unframedTargets,
      new Map(nodes.map(n => [n.id, { width: n.width, height: n.height }]))
    )

    return new Map([...pushedUnframed, ...framedTargets])
  }
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
   * Constrain all nodes with frame_id to be positioned inside their assigned frames.
   * Called after layout to ensure framed nodes stay in bounds.
   */
  async function constrainFramedNodesToTheirFrames(): Promise<void> {
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

    // For each frame, constrain its assigned nodes
    const allUpdates = new Map<string, { x: number; y: number }>()

    for (const [frameId, nodes] of nodesByFrame) {
      const frame = frameMap.get(frameId)!
      const positions = new Map(nodes.map(n => [n.id, { x: n.canvas_x, y: n.canvas_y }]))
      const nodeMap = new Map(nodes.map(n => [n.id, { width: n.width, height: n.height }]))

      const constrained = constrainNodesToFrame(positions, nodeMap, frame)

      // Only include nodes that actually moved
      for (const [nodeId, pos] of constrained) {
        const node = nodes.find(n => n.id === nodeId)
        if (node && (Math.abs(node.canvas_x - pos.x) > 1 || Math.abs(node.canvas_y - pos.y) > 1)) {
          allUpdates.set(nodeId, pos)
        }
      }
    }

    // Apply all updates
    if (allUpdates.size > 0) {
      await batchUpdatePositions(allUpdates, store.updateNodePosition, 50)
    }
  }

  /**
   * Radial/concentric layout - places selected node at center with neighbors in rings
   * Only affects nodes in the same frame context as the center node:
   * - If center is in a frame, only nodes in that same frame are moved
   * - If center is NOT in a frame, only unframed nodes are moved (framed nodes are NEVER touched)
   */
  async function radialLayout(): Promise<void> {
    const selectedIds = store.getSelectedNodeIds()
    if (selectedIds.length !== 1) {
      return
    }

    const centerId = selectedIds[0]
    const centerNode = store.getNode(centerId)
    if (!centerNode) {
      return
    }

    // Get all nodes and edges
    const allNodes = store.getFilteredNodes()
    const allEdges = store.getFilteredEdges()

    // frame_id is the ONLY source of truth - no spatial fallback
    const getNodeFrameId = (node: Node): string | null => {
      return node.frame_id || null
    }

    // Determine center node's frame (frame_id only)
    const centerFrameId = getNodeFrameId(centerNode)
    const centerIsFramed = !!centerFrameId

    // Filter nodes to only those that should be laid out (frame_id only)
    const nodesToLayout = allNodes.filter(n => {
      const nodeFrameId = getNodeFrameId(n)
      if (centerIsFramed) {
        // Center is in a frame - only include nodes in the SAME frame
        return nodeFrameId === centerFrameId
      } else {
        // Center is NOT in a frame - NEVER move nodes that are in any frame
        return !nodeFrameId
      }
    })
    const nodeIdsToLayout = new Set(nodesToLayout.map(n => n.id))


    // Build adjacency map
    const adjacency = new Map<string, Set<string>>()
    for (const node of allNodes) {
      adjacency.set(node.id, new Set())
    }
    for (const edge of allEdges) {
      adjacency.get(edge.source_node_id)?.add(edge.target_node_id)
      adjacency.get(edge.target_node_id)?.add(edge.source_node_id)
    }

    // BFS to find all connected nodes and their depths, tracking parent for sorting
    const depths = new Map<string, number>()
    const parents = new Map<string, string>() // Track which node led to this one
    const queue: string[] = [centerId]
    depths.set(centerId, 0)

    while (queue.length > 0) {
      const nodeId = queue.shift()!
      const currentDepth = depths.get(nodeId)!
      const neighbors = adjacency.get(nodeId) || new Set()

      for (const neighborId of neighbors) {
        if (!depths.has(neighborId)) {
          depths.set(neighborId, currentDepth + 1)
          parents.set(neighborId, nodeId)
          queue.push(neighborId)
        }
      }
    }

    // Group nodes by depth level
    const levels = new Map<number, string[]>()
    let maxDepth = 0
    for (const [nodeId, depth] of depths) {
      if (!levels.has(depth)) {
        levels.set(depth, [])
      }
      levels.get(depth)!.push(nodeId)
      maxDepth = Math.max(maxDepth, depth)
    }

    // Find unconnected nodes that should be laid out (not reachable from center via BFS)
    // IMPORTANT: Only include nodes from nodesToLayout, not all nodes
    const unconnectedNodes = nodesToLayout.filter(n => !depths.has(n.id))
    if (unconnectedNodes.length > 0) {
      // Add them as an outer ring beyond maxDepth
      const outerDepth = maxDepth + 1
      levels.set(outerDepth, unconnectedNodes.map(n => n.id))
      for (const node of unconnectedNodes) {
        depths.set(node.id, outerDepth)
      }
      maxDepth = outerDepth
    }

    // Track angles assigned to each node for parent-based sorting
    const nodeAngles = new Map<string, number>()

    // Use center node's current position as layout center
    const centerX = centerNode.canvas_x + (centerNode.width || NODE_DEFAULTS.WIDTH) / 2
    const centerY = centerNode.canvas_y + (centerNode.height || NODE_DEFAULTS.HEIGHT) / 2

    pushUndo()
    stopAnimation()

    // Get radial style setting
    const radialStyle = canvasStorage.getRadialStyle()
    const isCompact = radialStyle === 'compact'

    // Calculate positions for each level
    const targets = new Map<string, { x: number; y: number }>()
    // Adjust ring distance based on style - compact has tighter rings with overlap allowed
    // Both baseRadius and minNodeSpacing scale with style to make difference visible even with many nodes
    const firstRingRadius = isCompact ? 300 : 400 // Minimum distance from center to first ring
    const baseRadius = isCompact ? 150 : 300 // Distance between subsequent rings
    const minNodeSpacing = isCompact ? 60 : 150 // Spacing between nodes on a ring (tighter packing)
    const maxRadius = 50000 // Cap radius for reasonable layout size
    const ringSpacing = isCompact ? 180 : 300 // Spacing between sub-rings when splitting large levels

    let lastUsedRadius = 0 // Track the actual radius used by the previous ring

    for (let depth = 0; depth <= maxDepth; depth++) {
      let nodesAtDepth = levels.get(depth) || []

      if (depth === 0) {
        // Center node stays in place
        targets.set(centerId, { x: centerNode.canvas_x, y: centerNode.canvas_y })
        nodeAngles.set(centerId, 0)
        continue
      }

      // Sort nodes by their parent's angle to keep related nodes together
      nodesAtDepth = [...nodesAtDepth].sort((a, b) => {
        const parentA = parents.get(a)
        const parentB = parents.get(b)
        const angleA = parentA ? (nodeAngles.get(parentA) ?? 0) : 0
        const angleB = parentB ? (nodeAngles.get(parentB) ?? 0) : 0
        return angleA - angleB
      })

      // Calculate base radius for this depth - ensure it's beyond the previous ring
      // First ring uses firstRingRadius, subsequent rings use baseRadius spacing
      const ringDistance = depth === 1 ? firstRingRadius : baseRadius
      const minRadius = lastUsedRadius + ringDistance
      const depthRadius = Math.max(depth === 1 ? firstRingRadius : depth * baseRadius, minRadius)

      // Calculate how many nodes can fit at the max radius
      const maxNodesPerRing = Math.floor((2 * Math.PI * maxRadius) / minNodeSpacing)
      const nodeCount = nodesAtDepth.length

      if (nodeCount > maxNodesPerRing) {
        // Split into multiple rings
        const numRings = Math.ceil(nodeCount / maxNodesPerRing)
        let nodeIndex = 0

        for (let ring = 0; ring < numRings; ring++) {
          const ringRadius = depthRadius + ring * ringSpacing
          const nodesInThisRing = Math.min(maxNodesPerRing, nodeCount - nodeIndex)
          const angleStep = (2 * Math.PI) / nodesInThisRing
          const startAngle = -Math.PI / 2 + (ring * 0.1) // Slight offset for each ring

          for (let i = 0; i < nodesInThisRing && nodeIndex < nodeCount; i++, nodeIndex++) {
            const nodeId = nodesAtDepth[nodeIndex]
            const node = allNodes.find(n => n.id === nodeId)
            if (!node) continue

            const angle = startAngle + i * angleStep
            nodeAngles.set(nodeId, angle)

            // Only move nodes that should be laid out (skip nodes in other frames)
            if (!nodeIdsToLayout.has(nodeId)) continue

            const x = centerX + Math.cos(angle) * ringRadius - (node.width || NODE_DEFAULTS.WIDTH) / 2
            const y = centerY + Math.sin(angle) * ringRadius - (node.height || NODE_DEFAULTS.HEIGHT) / 2

            targets.set(nodeId, { x: Math.round(x), y: Math.round(y) })
          }
        }
        // Track the outermost ring radius used
        lastUsedRadius = depthRadius + (numRings - 1) * ringSpacing
      } else {
        // Normal case - all nodes fit on one ring
        // Calculate if we need to expand the radius to fit all nodes
        const circumference = 2 * Math.PI * depthRadius
        const requiredCircumference = nodeCount * minNodeSpacing
        const adjustedRadius = requiredCircumference > circumference
          ? Math.min(requiredCircumference / (2 * Math.PI), maxRadius)
          : depthRadius

        // Track the radius used for this ring
        lastUsedRadius = adjustedRadius

        const angleStep = (2 * Math.PI) / nodeCount
        const startAngle = -Math.PI / 2 // Start from top

        for (let i = 0; i < nodeCount; i++) {
          const nodeId = nodesAtDepth[i]
          const node = allNodes.find(n => n.id === nodeId)
          if (!node) continue

          const angle = startAngle + i * angleStep
          nodeAngles.set(nodeId, angle)

          // Only move nodes that should be laid out (skip nodes in other frames)
          if (!nodeIdsToLayout.has(nodeId)) continue

          const x = centerX + Math.cos(angle) * adjustedRadius - (node.width || NODE_DEFAULTS.WIDTH) / 2
          const y = centerY + Math.sin(angle) * adjustedRadius - (node.height || NODE_DEFAULTS.HEIGHT) / 2

          targets.set(nodeId, { x: Math.round(x), y: Math.round(y) })
        }
      }
    }

    // Constrain to frame OR push out of frames
    const targetFrame = centerFrameId
      ? store.getFilteredFrames().find(f => f.id === centerFrameId)
      : undefined
    const finalTargets = applyFrameConstraints(targets, allNodes, targetFrame)

    // Animate to positions
    if (finalTargets.size > 200) {
      await batchUpdatePositions(finalTargets, store.updateNodePosition, 100)
    } else {
      animateToPositions(finalTargets, 600)
    }

    // Dispatch z-order event based on angles (angle increases clockwise from top)
    // Nodes with higher angles should render on top
    const angleOrder: Array<{ id: string; angle: number }> = []
    for (const [nodeId, angle] of nodeAngles) {
      angleOrder.push({ id: nodeId, angle })
    }
    // Sort by angle (ascending) so higher angles get higher z-index
    angleOrder.sort((a, b) => a.angle - b.angle)
    const zOrder = angleOrder.map(item => item.id)
    window.dispatchEvent(new CustomEvent('nodus-radial-z-order', { detail: zOrder }))
  }

  async function autoLayout(layout: 'grid' | 'horizontal' | 'vertical' | 'force' | 'hierarchical' | 'radial' = 'grid', frameId?: string) {
    // Prevent concurrent layout operations (rapid clicking)
    if (isLayoutInProgress) {
      console.debug('[Layout] Skipping - layout already in progress')
      return
    }
    isLayoutInProgress = true

    try {
      await _autoLayoutImpl(layout, frameId)
    } finally {
      isLayoutInProgress = false
    }
  }

  async function _autoLayoutImpl(layout: 'grid' | 'horizontal' | 'vertical' | 'force' | 'hierarchical' | 'radial' = 'grid', frameId?: string) {
    // Radial layout is handled separately (requires exactly one selected node)
    if (layout === 'radial') {
      await radialLayout()
      return
    }

    const selectedIds = store.getSelectedNodeIds()
    const allNodes = store.getFilteredNodes()
    const allFrames = store.getFilteredFrames()

    // If frameId is provided, only layout nodes inside that frame
    let nodes: Node[]
    let targetFrame: Frame | undefined

    if (frameId) {
      targetFrame = allFrames.find(f => f.id === frameId)
      if (!targetFrame) {
        return
      }

      // Only include nodes explicitly assigned to this frame via frame_id
      // Do NOT use visual overlap - that creates inconsistent state and breaks undo
      nodes = allNodes.filter(n => n.frame_id === frameId)
    } else {
      nodes = selectedIds.length > 0
        ? allNodes.filter(n => selectedIds.includes(n.id))
        : allNodes
    }

    if (nodes.length === 0) return

    // Thresholds for layout performance
    const FAST_GRID_THRESHOLD = 500  // Use fast grid algorithm above this
    const HUGE_THRESHOLD = 5000      // Warn but still try for huge graphs

    pushUndo()
    stopAnimation()

    // Fast path for grid layout with large node sets
    if (layout === 'grid' && nodes.length > FAST_GRID_THRESHOLD) {

      // Calculate center - use frame center if frame-scoped
      let centerX: number, centerY: number
      if (targetFrame) {
        centerX = targetFrame.canvas_x + targetFrame.width / 2
        centerY = targetFrame.canvas_y + targetFrame.height / 2
      } else {
        let sumX = 0, sumY = 0
        for (const node of nodes) {
          sumX += node.canvas_x
          sumY += node.canvas_y
        }
        centerX = sumX / nodes.length
        centerY = sumY / nodes.length
      }

      // Use optimized fast grid with typed arrays
      const fastNodes = nodes.map(n => ({
        id: n.id,
        width: n.width || NODE_DEFAULTS.WIDTH,
        height: n.height || NODE_DEFAULTS.HEIGHT,
      }))

      // Calculate appropriate gap for frame-scoped layouts
      let gap = 360
      if (targetFrame) {
        // Calculate gap to fit nodes within frame
        const padding = 30
        const availableWidth = targetFrame.width - 2 * padding
        const availableHeight = targetFrame.height - 2 * padding
        const avgWidth = fastNodes.reduce((s, n) => s + n.width, 0) / fastNodes.length
        const avgHeight = fastNodes.reduce((s, n) => s + n.height, 0) / fastNodes.length
        const cols = Math.ceil(Math.sqrt(nodes.length))
        const rows = Math.ceil(nodes.length / cols)
        // Gap that would fit nodes in available space
        const maxGapX = Math.max(8, (availableWidth - cols * avgWidth) / Math.max(1, cols - 1))
        const maxGapY = Math.max(8, (availableHeight - rows * avgHeight) / Math.max(1, rows - 1))
        gap = Math.min(maxGapX, maxGapY, 360) // Use smaller gap, capped at 360
      }

      const positions = fastGridLayout(fastNodes, {
        centerX,
        centerY,
        gap,
      })

      // Push nodes out of frames OR constrain to frame boundaries
      const finalPositions = applyFrameConstraints(positions, nodes, targetFrame)

      // Batch update positions to avoid blocking UI
      await batchUpdatePositions(finalPositions, store.updateNodePosition, 200)

      // After layout, ensure all framed nodes are inside their assigned frames
      await constrainFramedNodesToTheirFrames()
      return
    }

    // Warn for huge graphs but still allow force/hierarchical
    if (nodes.length > HUGE_THRESHOLD) {
      console.warn(`Very large graph (${nodes.length} nodes) - ${layout} layout may be slow`)
    }

    // Create frame map for lookups
    const frameMap = new Map(allFrames.map(f => [f.id, f]))

    // When frameId is provided, layout nodes inside that frame directly
    let virtualNodes: Node[]

    // Track which nodes belong to which frame
    const frameNodes = new Map<string, Node[]>() // frame_id -> nodes in that frame
    const unframedNodes: Node[] = []

    if (frameId) {
      // Layout nodes inside the selected frame
      virtualNodes = [...nodes]
    } else {
      // Group nodes by frame membership
      // Primary: use frame_id from database (authoritative)
      // Fallback: spatial check for nodes without frame_id (newly placed nodes)

      for (const node of nodes) {
        // frame_id is the ONLY source of truth for frame membership
        // NO spatial fallback - that creates non-deterministic behavior
        if (node.frame_id) {
          if (frameMap.has(node.frame_id)) {
            if (!frameNodes.has(node.frame_id)) {
              frameNodes.set(node.frame_id, [])
            }
            frameNodes.get(node.frame_id)!.push(node)
          }
          // Node with frame_id is always considered "framed" - skip layout
          continue
        }

        // No frame_id = unframed node = participates in layout
        unframedNodes.push(node)
      }
      // Only layout unframed nodes - nodes with frame_id stay fixed
      virtualNodes = [...unframedNodes]
    }

    // When no unframed nodes exist, lay out the FRAMES instead
    if (virtualNodes.length === 0 && frameNodes.size > 0) {
      // Create virtual nodes representing frames
      const frameVirtualNodes: Node[] = []
      for (const [fid] of frameNodes) {
        const frame = frameMap.get(fid)
        if (frame) {
          frameVirtualNodes.push({
            id: fid,
            canvas_x: frame.canvas_x,
            canvas_y: frame.canvas_y,
            width: frame.width,
            height: frame.height,
          })
        }
      }

      if (frameVirtualNodes.length > 0) {
        // Calculate center of frames
        let sumX = 0, sumY = 0
        for (const vn of frameVirtualNodes) {
          sumX += vn.canvas_x + (vn.width || 400) / 2
          sumY += vn.canvas_y + (vn.height || 300) / 2
        }
        const frameCenterX = sumX / frameVirtualNodes.length
        const frameCenterY = sumY / frameVirtualNodes.length

        // Apply grid layout to frames
        const frameGap = 40
        const edges = store.getFilteredEdges()
        const frameTargets = tetrisGridLayout(frameVirtualNodes, edges, 0, 0, frameGap)

        // Center the layout
        if (frameTargets.size > 0) {
          let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
          for (const vn of frameVirtualNodes) {
            const pos = frameTargets.get(vn.id)
            if (!pos) continue
            minX = Math.min(minX, pos.x)
            minY = Math.min(minY, pos.y)
            maxX = Math.max(maxX, pos.x + (vn.width || 400))
            maxY = Math.max(maxY, pos.y + (vn.height || 300))
          }
          const layoutCenterX = (minX + maxX) / 2
          const layoutCenterY = (minY + maxY) / 2
          const offsetX = frameCenterX - layoutCenterX
          const offsetY = frameCenterY - layoutCenterY

          // Move frames AND their nodes together (preserve relative positions)
          for (const [fid, pos] of frameTargets) {
            const frame = frameMap.get(fid)
            if (!frame) continue

            const newX = pos.x + offsetX
            const newY = pos.y + offsetY
            const deltaX = newX - frame.canvas_x
            const deltaY = newY - frame.canvas_y

            // Move the frame
            store.updateFramePosition(fid, newX, newY)

            // Move all nodes inside this frame by the same delta
            const nodesInThisFrame = frameNodes.get(fid) || []
            for (const node of nodesInThisFrame) {
              store.updateNodePosition(node.id, node.canvas_x + deltaX, node.canvas_y + deltaY)
            }
          }
        }
      }
      return
    }

    if (virtualNodes.length === 0) {
      return
    }

    // Calculate layout center
    let centerX: number, centerY: number
    if (targetFrame) {
      // Use frame center for frame-scoped layout
      centerX = targetFrame.canvas_x + targetFrame.width / 2
      centerY = targetFrame.canvas_y + targetFrame.height / 2
    } else {
      // Use nodes' center for global layout
      let sumX = 0, sumY = 0
      for (const node of virtualNodes) {
        sumX += node.canvas_x + (node.width || NODE_DEFAULTS.WIDTH) / 2
        sumY += node.canvas_y + (node.height || NODE_DEFAULTS.HEIGHT) / 2
      }
      centerX = sumX / virtualNodes.length
      centerY = sumY / virtualNodes.length
    }

    // Gap between nodes in grid layout
    const gridGap = 24 // Tight packing gap

    if (layout === 'force' || layout === 'hierarchical') {
      const edges = store.getFilteredEdges()

      // Use shared helpers for frame-aware layout preparation
      const ctx: FrameAwareLayoutContext = {
        virtualNodes,
        allFrames,
        frameNodes,
        frameId: frameId || null,
        centerX,
        centerY,
        nodes,
        targetFrame: targetFrame || null,
      }
      const { layoutNodes, layoutEdges, frameSnapshot } = prepareFrameAwareLayout(ctx, edges)

      // Execute the specific layout algorithm
      let positions: Map<string, { x: number; y: number }>

      if (layout === 'force') {
        // Scale iterations based on node count
        const n = layoutNodes.length
        const iterations = n > 2000 ? 30 : n > 1000 ? 50 : n > 500 ? 80 : n > 200 ? 100 : n > 100 ? 200 : 400
        positions = await applyForceLayout(layoutNodes, layoutEdges, {
          centerX,
          centerY,
          iterations,
        })
      } else {
        // For very large graphs, use simpler ranker
        const ranker = layoutNodes.length > 2000 ? 'longest-path' : 'network-simplex'

        // Use setTimeout to avoid blocking UI
        positions = await new Promise<Map<string, { x: number; y: number }>>((resolve) => {
          setTimeout(() => {
            const result = applyHierarchicalLayout(layoutNodes, layoutEdges, {
              direction: 'TB',
              nodeSpacingX: 150,
              nodeSpacingY: 360,
              centerX,
              centerY,
              ranker,
            })
            resolve(result)
          }, 10)
        })
      }

      // Use shared helper to process results (frame movement + constraints)
      const finalTargets = processFrameAwareLayoutResults(
        ctx,
        positions,
        frameSnapshot,
        store.updateFramePosition,
        pushOutOfFrames
      )

      // Apply positions with animation or batch update
      const animationDuration = layout === 'force' ? 800 : 600
      if (finalTargets.size > 500) {
        await batchUpdatePositions(finalTargets, store.updateNodePosition, 200)
        // After layout, ensure all framed nodes are inside their assigned frames
        await constrainFramedNodesToTheirFrames()
      } else {
        animateToPositions(finalTargets, animationDuration)
        // After layout, ensure all framed nodes are inside their assigned frames
        setTimeout(() => constrainFramedNodesToTheirFrames(), animationDuration + 100)
      }
      return
    }

    const targets = new Map<string, { x: number; y: number }>()

    if (layout === 'grid') {
      const edges = store.getFilteredEdges()
      // Pass frame width constraint for frame-scoped layouts
      const containerWidth = targetFrame ? targetFrame.width - 60 : undefined // 60 = 2 * padding
      const trialTargets = tetrisGridLayout(virtualNodes, edges, 0, 0, gridGap, containerWidth)

      if (trialTargets.size === 0) {
        console.warn('Grid layout: no positions generated')
        return
      }

      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
      for (const node of virtualNodes) {
        const pos = trialTargets.get(node.id)
        if (!pos) continue
        const w = node.width || NODE_DEFAULTS.WIDTH
        const h = node.height || NODE_DEFAULTS.HEIGHT
        minX = Math.min(minX, pos.x)
        minY = Math.min(minY, pos.y)
        maxX = Math.max(maxX, pos.x + w)
        maxY = Math.max(maxY, pos.y + h)
      }

      const layoutCenterX = (minX + maxX) / 2
      const layoutCenterY = (minY + maxY) / 2
      const offsetX = centerX - layoutCenterX
      const offsetY = centerY - layoutCenterY

      for (const [id, pos] of trialTargets) {
        targets.set(id, { x: pos.x + offsetX, y: pos.y + offsetY })
      }
    } else if (layout === 'horizontal') {
      const sorted = [...virtualNodes].sort((a, b) => (b.height || NODE_DEFAULTS.HEIGHT) - (a.height || NODE_DEFAULTS.HEIGHT))
      const totalWidth = sorted.reduce((sum, n) => sum + (n.width || NODE_DEFAULTS.WIDTH) + gridGap, -gridGap)
      let x = centerX - totalWidth / 2
      const maxHeight = Math.max(...sorted.map(n => n.height || NODE_DEFAULTS.HEIGHT))

      for (const node of sorted) {
        const h = node.height || NODE_DEFAULTS.HEIGHT
        targets.set(node.id, { x, y: centerY - maxHeight / 2 + (maxHeight - h) / 2 })
        x += (node.width || NODE_DEFAULTS.WIDTH) + gridGap
      }
    } else if (layout === 'vertical') {
      const sorted = [...virtualNodes].sort((a, b) => (b.width || NODE_DEFAULTS.WIDTH) - (a.width || NODE_DEFAULTS.WIDTH))
      const totalHeight = sorted.reduce((sum, n) => sum + (n.height || NODE_DEFAULTS.HEIGHT) + gridGap, -gridGap)
      let y = centerY - totalHeight / 2
      const maxWidth = Math.max(...sorted.map(n => n.width || NODE_DEFAULTS.WIDTH))

      for (const node of sorted) {
        const w = node.width || NODE_DEFAULTS.WIDTH
        targets.set(node.id, { x: centerX - maxWidth / 2 + (maxWidth - w) / 2, y })
        y += (node.height || NODE_DEFAULTS.HEIGHT) + gridGap
      }
    }

    // Push nodes out of frames OR constrain to frame boundaries
    const finalTargets = applyFrameConstraints(targets, nodes, targetFrame)

    animateToPositions(finalTargets, 500)

    // After layout, ensure all framed nodes are inside their assigned frames
    // Use setTimeout to let animation complete first
    setTimeout(() => constrainFramedNodesToTheirFrames(), 600)
  }

  function fitToContent() {
    const nodes = store.getFilteredNodes()
    if (nodes.length === 0) return

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const node of nodes) {
      minX = Math.min(minX, node.canvas_x)
      minY = Math.min(minY, node.canvas_y)
      maxX = Math.max(maxX, node.canvas_x + (node.width || NODE_DEFAULTS.WIDTH))
      maxY = Math.max(maxY, node.canvas_y + (node.height || NODE_DEFAULTS.HEIGHT))
    }

    const rect = viewState.canvasRect()
    if (!rect) return

    const padding = 50
    const contentWidth = maxX - minX + padding * 2
    const contentHeight = maxY - minY + padding * 2

    const scaleX = rect.width / contentWidth
    const scaleY = rect.height / contentHeight
    // Minimum scale of 0.01 to keep nodes visible, max of 1 to not zoom in beyond 100%
    viewState.scale.value = Math.max(0.01, Math.min(scaleX, scaleY, 1))

    viewState.offsetX.value = (rect.width - contentWidth * viewState.scale.value) / 2 - minX * viewState.scale.value + padding * viewState.scale.value
    viewState.offsetY.value = (rect.height - contentHeight * viewState.scale.value) / 2 - minY * viewState.scale.value + padding * viewState.scale.value
  }

  /**
   * Get available layout strategies from the registry
   */
  function getAvailableLayouts(): string[] {
    return layoutRegistry.names()
  }

  /**
   * Execute a registered layout strategy by name
   * This is an alternative to autoLayout that uses the strategy pattern
   */
  async function executeStrategy(
    strategyName: string,
    options?: { animate?: boolean; duration?: number }
  ): Promise<void> {
    const strategy = layoutRegistry.get(strategyName)
    if (!strategy) {
      console.warn(`Layout strategy '${strategyName}' not found, falling back to autoLayout`)
      // Fallback to autoLayout for unregistered strategies
      const layoutMap: Record<string, 'grid' | 'force' | 'hierarchical'> = {
        grid: 'grid',
        force: 'force',
        hierarchical: 'hierarchical',
      }
      if (layoutMap[strategyName]) {
        await autoLayout(layoutMap[strategyName])
      }
      return
    }

    const selectedIds = store.getSelectedNodeIds()
    const allNodes = store.getFilteredNodes()

    // frame_id is the ONLY source of truth
    const isNodeInAnyFrame = (node: Node): boolean => !!node.frame_id

    // Filter nodes: selected ones, excluding those in frames
    const candidateNodes = selectedIds.length > 0
      ? allNodes.filter(n => selectedIds.includes(n.id))
      : allNodes
    const nodes = candidateNodes.filter(n => !isNodeInAnyFrame(n))

    if (nodes.length === 0) return

    pushUndo()
    stopAnimation()

    // Calculate center
    let sumX = 0, sumY = 0
    for (const node of nodes) {
      sumX += node.canvas_x + (node.width || NODE_DEFAULTS.WIDTH) / 2
      sumY += node.canvas_y + (node.height || NODE_DEFAULTS.HEIGHT) / 2
    }
    const centerX = sumX / nodes.length
    const centerY = sumY / nodes.length

    // Prepare nodes and edges for strategy
    const layoutNodes: StrategyLayoutNode[] = nodes.map(n => ({
      id: n.id,
      x: n.canvas_x,
      y: n.canvas_y,
      width: n.width || NODE_DEFAULTS.WIDTH,
      height: n.height || NODE_DEFAULTS.HEIGHT,
    }))

    const edges = store.getFilteredEdges()
    const nodeIdSet = new Set(nodes.map(n => n.id))
    const layoutEdges: StrategyLayoutEdge[] = edges
      .filter(e => nodeIdSet.has(e.source_node_id) && nodeIdSet.has(e.target_node_id))
      .map(e => ({
        source: e.source_node_id,
        target: e.target_node_id,
      }))

    // Execute strategy
    const calculatedPositions = await strategy.calculate(layoutNodes, layoutEdges, {
      centerX,
      centerY,
    })

    // Post-process: push nodes out of frames
    const positions = applyFrameConstraints(calculatedPositions, nodes)

    // Apply positions
    const animate = options?.animate !== false
    const duration = options?.duration ?? 500

    if (animate && nodes.length <= 500) {
      animateToPositions(positions, duration)
    } else {
      await batchUpdatePositions(positions, store.updateNodePosition, 200)
    }
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
