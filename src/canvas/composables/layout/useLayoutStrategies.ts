/**
 * Layout strategy pattern utilities
 * Provides access to registered layout strategies and viewport fitting
 */
import { type Ref } from 'vue'
import { NODE_DEFAULTS } from '../../constants'
import { layoutRegistry } from '../../layout'
import { batchUpdatePositions } from '../../layout/fastGrid'
import type { LayoutNode as StrategyLayoutNode, LayoutEdge as StrategyLayoutEdge } from '../../layout/types'

export interface Node {
  id: string
  canvas_x: number
  canvas_y: number
  width?: number
  height?: number
  frame_id?: string | null
}

export interface Edge {
  id: string
  source_node_id: string
  target_node_id: string
}

export interface ViewState {
  scale: Ref<number>
  offsetX: Ref<number>
  offsetY: Ref<number>
  canvasRect: () => DOMRect | null
}

export interface LayoutStrategyStore {
  getFilteredNodes: () => Node[]
  getFilteredEdges: () => Edge[]
  getSelectedNodeIds: () => string[]
  updateNodePosition: (id: string, x: number, y: number) => void
}


/**
 * Which nodes a layout moves, and which frames must be re-fitted afterwards.
 *
 * A selection is an instruction: every selected node takes part, including
 * nodes that belong to a frame. The node keeps its frame and the frame is
 * re-fitted around its contents afterwards, so nothing escapes its frame and
 * nothing is silently left behind (PRODUCT_DESIGN.md > Layout of a selection).
 *
 * With no selection the whole graph is laid out and frame contents are left to
 * the frame-aware path.
 */
export function selectionForLayout(
  allNodes: Node[],
  selectedIds: string[]
): { nodes: Node[]; affectedFrameIds: Set<string> } {
  if (selectedIds.length === 0) {
    return { nodes: allNodes.filter(n => !n.frame_id), affectedFrameIds: new Set() }
  }

  const selected = new Set(selectedIds)
  const nodes = allNodes.filter(n => selected.has(n.id))
  const affectedFrameIds = new Set(
    nodes.map(n => n.frame_id).filter((id): id is string => !!id)
  )
  return { nodes, affectedFrameIds }
}

export interface LayoutStrategyOptions {
  /** Re-fit frames around their contents after nodes inside them have moved */
  expandFramesToFitNodes?: () => Promise<void>
  store: LayoutStrategyStore
  viewState: ViewState
  pushUndo: () => void
  stopAnimation: () => void
  animateToPositions: (targets: Map<string, { x: number; y: number }>, duration?: number) => void
  applyFrameConstraints: (
    positions: Map<string, { x: number; y: number }>,
    nodes: Node[]
  ) => Map<string, { x: number; y: number }>
}

/**
 * Get available layout strategies from the registry
 */
export function getAvailableLayouts(): string[] {
  return layoutRegistry.names()
}

/**
 * Fit viewport to show all content
 */
export function fitToContent(
  store: LayoutStrategyStore,
  viewState: ViewState
): void {
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
 * Execute a registered layout strategy by name
 * This is an alternative to autoLayout that uses the strategy pattern
 */
export async function executeStrategy(
  strategyName: string,
  options: LayoutStrategyOptions,
  executeOptions?: { animate?: boolean; duration?: number }
): Promise<void> {
  const { store, pushUndo, stopAnimation, animateToPositions, applyFrameConstraints } = options

  const strategy = layoutRegistry.get(strategyName)
  if (!strategy) {
    console.warn(`Layout strategy '${strategyName}' not found`)
    return
  }

  const selectedIds = store.getSelectedNodeIds()
  const allNodes = store.getFilteredNodes()

  const { nodes, affectedFrameIds } = selectionForLayout(allNodes, selectedIds)

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
  const animate = executeOptions?.animate !== false
  const duration = executeOptions?.duration ?? 500

  if (animate && nodes.length <= 500) {
    animateToPositions(positions, duration)
  } else {
    await batchUpdatePositions(positions, store.updateNodePosition, 200)
  }

  // Frames follow the nodes that moved inside them, so a selected node keeps
  // its frame instead of escaping it
  if (affectedFrameIds.size > 0) {
    await options.expandFramesToFitNodes?.()
  }
}
