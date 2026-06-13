/**
 * Color operations composable
 *
 * Handles color updates for selected nodes and frames with undo support.
 */
import type { Node } from '../../../types'

/**
 * Context for color operations
 */
export interface UseColorOperationsContext {
  /** Store functions */
  store: {
    getNode: (id: string) => Node | undefined
    get selectedNodeIds(): string[]
    get selectedFrameId(): string | null
    updateNodeColor: (id: string, color: string | null) => void
    updateFrameColor: (id: string, color: string | null) => void
  }
  /** Push color change to undo stack */
  pushColorUndo: (oldColors: Map<string, string | null>) => void
}

/**
 * Return type for useColorOperations
 */
export interface UseColorOperationsReturn {
  /** Update color for all selected nodes with undo support */
  updateSelectedNodesColor: (color: string | null) => void
  /** Update color for selected frame */
  updateSelectedFrameColor: (color: string | null) => void
}

/**
 * Composable for color operations
 *
 * Provides color update functions with undo support for selected nodes and frames.
 */
export function useColorOperations(ctx: UseColorOperationsContext): UseColorOperationsReturn {
  const { store, pushColorUndo } = ctx

  /**
   * Update color for all selected nodes with undo support
   */
  function updateSelectedNodesColor(color: string | null) {
    // Capture old colors for undo
    const oldColors = new Map<string, string | null>()
    for (const nodeId of store.selectedNodeIds) {
      const node = store.getNode(nodeId)
      if (node) {
        oldColors.set(nodeId, node.color_theme ?? null)
      }
    }
    pushColorUndo(oldColors)

    // Apply color to all selected nodes
    for (const nodeId of store.selectedNodeIds) {
      store.updateNodeColor(nodeId, color)
    }
  }

  /**
   * Update color for selected frame
   */
  function updateSelectedFrameColor(color: string | null) {
    if (store.selectedFrameId) {
      store.updateFrameColor(store.selectedFrameId, color)
    }
  }

  return {
    updateSelectedNodesColor,
    updateSelectedFrameColor,
  }
}
