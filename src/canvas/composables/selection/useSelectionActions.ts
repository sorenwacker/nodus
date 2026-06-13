/**
 * Selection actions composable
 *
 * Handles select all and delete selected operations.
 */
import type { ComputedRef } from 'vue'
import type { Node, Edge } from '../../../types'

/**
 * Context for selection actions
 */
export interface UseSelectionActionsContext {
  /** Store functions */
  store: {
    getNode: (id: string) => Node | undefined
    get selectedNodeIds(): string[]
    set selectedNodeIds(ids: string[])
    get filteredEdges(): Edge[]
    deleteNodes: (ids: string[]) => Promise<void>
  }
  /** Display nodes (respects neighborhood mode filtering) */
  displayNodes: ComputedRef<Array<{ id: string }>>
  /** Push deletion to undo stack */
  pushDeletionUndo: (node: Node, edges: Edge[]) => void
}

/**
 * Return type for useSelectionActions
 */
export interface UseSelectionActionsReturn {
  /** Select all visible nodes (respects neighborhood mode) */
  selectAllNodes: () => void
  /** Delete selected nodes (or specified node IDs) with undo support */
  deleteSelectedNodes: (nodeIds?: string[]) => Promise<void>
}

/**
 * Composable for selection actions
 *
 * Provides select all and delete selected functionality.
 */
export function useSelectionActions(ctx: UseSelectionActionsContext): UseSelectionActionsReturn {
  const { store, displayNodes, pushDeletionUndo } = ctx

  /**
   * Select all visible nodes (respects neighborhood mode)
   */
  function selectAllNodes() {
    const nodeIds = displayNodes.value.map(n => n.id)
    store.selectedNodeIds.splice(0, store.selectedNodeIds.length, ...nodeIds)
  }

  /**
   * Delete selected nodes (or specified node IDs) with undo support
   */
  async function deleteSelectedNodes(nodeIds?: string[]) {
    const ids = nodeIds ?? [...store.selectedNodeIds]
    if (ids.length === 0) return

    // Collect all nodes and edges for undo before deletion
    const undoData: Array<{ node: Node; edges: Edge[] }> = []
    for (const id of ids) {
      const node = store.getNode(id)
      if (node) {
        const connectedEdges = store.filteredEdges.filter(
          e => e.source_node_id === id || e.target_node_id === id
        )
        undoData.push({ node, edges: connectedEdges })
      }
    }

    // Push all to undo stack
    for (const { node, edges } of undoData) {
      pushDeletionUndo(node, edges)
    }

    // Batch delete all nodes at once
    await store.deleteNodes(ids)
  }

  return {
    selectAllNodes,
    deleteSelectedNodes,
  }
}
