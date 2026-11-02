/**
 * Color operations composable
 *
 * Handles color updates for selected nodes with undo support.
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
    updateNodeColor: (id: string, color: string | null) => void
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
}

/**
 * Composable for color operations
 *
 * Provides color update functions with undo support for selected nodes.
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

  return {
    updateSelectedNodesColor,
  }
}
