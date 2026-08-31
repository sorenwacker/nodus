/**
 * Fitting the viewport to the content on the canvas.
 */
import { type Ref } from 'vue'
import { NODE_DEFAULTS } from '../../constants'
import { ZOOM_LIMITS } from '../../constants'

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
  // Capped at 1 so fitting never zooms in beyond 100%. The floor is the
  // shared one, low enough that a fit is not silently cut short: the old 0.01
  // clamp left a 69,000px layout showing 65,000 - the whole graph minus a
  // slice nobody could scroll to, since zooming out further was also clamped.
  viewState.scale.value = Math.max(ZOOM_LIMITS.MIN, Math.min(scaleX, scaleY, 1))

  viewState.offsetX.value = (rect.width - contentWidth * viewState.scale.value) / 2 - minX * viewState.scale.value + padding * viewState.scale.value
  viewState.offsetY.value = (rect.height - contentHeight * viewState.scale.value) / 2 - minY * viewState.scale.value + padding * viewState.scale.value
}
