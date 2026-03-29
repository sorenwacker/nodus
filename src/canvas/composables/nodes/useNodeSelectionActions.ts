/**
 * Node selection actions composable
 *
 * Handles bulk operations on selected nodes
 */
import type { Ref, ComputedRef } from 'vue'
import type { Node, Edge } from '../../../types'
import { measureNodeContent } from '../../utils/nodeSizing'
import { NODE_DEFAULTS } from '../../constants'

export interface UseNodeSelectionActionsContext {
  displayNodes: ComputedRef<Node[]>
  selectedNodeIds: Ref<string[]>
  getNode: (id: string) => Node | undefined
  filteredEdges: ComputedRef<Edge[]>
  updateNode: (id: string, data: Partial<Node>) => Promise<void>
  deleteNodes: (ids: string[]) => Promise<void>
  pushDeletionUndo: (node: Node, edges: Edge[]) => void
  pushSizeUndo: (nodeId: string, oldWidth: number, oldHeight: number) => void
  editingNodeId: Ref<string | null>
  isSemanticZoomCollapsed: ComputedRef<boolean>
}

export function useNodeSelectionActions(ctx: UseNodeSelectionActionsContext) {
  const {
    displayNodes,
    selectedNodeIds,
    getNode,
    filteredEdges,
    updateNode,
    deleteNodes,
    pushDeletionUndo,
    pushSizeUndo,
    editingNodeId,
    isSemanticZoomCollapsed,
  } = ctx

  /**
   * Select all visible nodes
   */
  function selectAllNodes() {
    const nodeIds = displayNodes.value.map(n => n.id)
    selectedNodeIds.value.splice(0, selectedNodeIds.value.length, ...nodeIds)
  }

  /**
   * Delete all selected nodes
   */
  async function deleteSelectedNodes() {
    const ids = [...selectedNodeIds.value]
    if (ids.length === 0) return

    // Collect all nodes and edges for undo before deletion
    const undoData: Array<{ node: Node; edges: Edge[] }> = []
    for (const id of ids) {
      const node = getNode(id)
      if (node) {
        const connectedEdges = filteredEdges.value.filter(
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
    await deleteNodes(ids)
  }

  /**
   * Fit selected nodes to their content
   */
  async function fitSelectedNodes() {
    if (isSemanticZoomCollapsed.value) return

    const ids = selectedNodeIds.value.length > 0
      ? [...selectedNodeIds.value]
      : displayNodes.value.map(n => n.id)

    for (const id of ids) {
      if (editingNodeId.value === id) continue
      await fitNodeToContent(id)
    }
  }

  /**
   * Fit a single node to its content
   */
  async function fitNodeToContent(nodeId: string) {
    const node = getNode(nodeId)
    if (!node) return

    const measured = measureNodeContent(node.title, node.markdown_content || '')
    const minWidth = NODE_DEFAULTS.WIDTH
    const newWidth = Math.max(minWidth, measured.width)
    const newHeight = measured.height

    // Save undo state
    pushSizeUndo(nodeId, node.width || NODE_DEFAULTS.WIDTH, node.height || NODE_DEFAULTS.HEIGHT)

    await updateNode(nodeId, { width: newWidth, height: newHeight })
  }

  return {
    selectAllNodes,
    deleteSelectedNodes,
    fitSelectedNodes,
    fitNodeToContent,
  }
}
