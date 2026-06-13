/**
 * Frame fitting composable
 *
 * Handles fitting frames to their contents (nodes inside them).
 */
import type { Node, Frame } from '../../../types'
import { NODE_DEFAULTS } from '../../constants'

/**
 * Context for frame fitting operations
 */
export interface UseFrameFittingContext {
  /** Store functions */
  store: {
    get frames(): Frame[]
    get filteredNodes(): Node[]
    get selectedFrameId(): string | null
    updateFramePosition: (id: string, x: number, y: number) => void
    updateFrameSize: (id: string, w: number, h: number) => void
  }
}

/**
 * Return type for useFrameFitting
 */
export interface UseFrameFittingReturn {
  /** Fit selected frame to snugly wrap its contents */
  fitSelectedFrameToContents: () => void
}

/**
 * Composable for frame fitting operations
 *
 * Provides functions to fit frames to their contained nodes.
 */
export function useFrameFitting(ctx: UseFrameFittingContext): UseFrameFittingReturn {
  const { store } = ctx

  /**
   * Fit selected frame to snugly wrap its contents
   */
  function fitSelectedFrameToContents() {
    const frameId = store.selectedFrameId
    if (!frameId) return

    const frame = store.frames.find(f => f.id === frameId)
    if (!frame) return

    // Get nodes assigned to this frame
    const nodesInFrame = store.filteredNodes.filter(n => n.frame_id === frameId)
    if (nodesInFrame.length === 0) return

    // Calculate bounding box of nodes
    const padding = 30
    const titleHeight = 40

    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity

    for (const node of nodesInFrame) {
      const nodeWidth = node.width || NODE_DEFAULTS.WIDTH
      const nodeHeight = node.height || NODE_DEFAULTS.HEIGHT
      minX = Math.min(minX, node.canvas_x)
      minY = Math.min(minY, node.canvas_y)
      maxX = Math.max(maxX, node.canvas_x + nodeWidth)
      maxY = Math.max(maxY, node.canvas_y + nodeHeight)
    }

    // Calculate new frame dimensions
    const newX = minX - padding
    const newY = minY - padding - titleHeight
    const newWidth = maxX - minX + padding * 2
    const newHeight = maxY - minY + padding * 2 + titleHeight

    // Update frame position and size
    store.updateFramePosition(frameId, newX, newY)
    store.updateFrameSize(frameId, newWidth, newHeight)
  }

  return {
    fitSelectedFrameToContents,
  }
}
