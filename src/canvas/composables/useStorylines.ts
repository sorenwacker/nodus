/**
 * Storylines composable
 *
 * Handles adding nodes to storylines, creating storylines from nodes,
 * and moving nodes between workspaces.
 */

import type { Ref } from 'vue'
import type { Storyline, Workspace, Node } from '../../types'

export interface UseStorylinesContext {
  store: {
    selectedNodeIds: string[]
    getNode: (id: string) => Node | undefined
    addNodeToStoryline: (storylineId: string, nodeId: string) => Promise<void>
    createStoryline: (title: string) => Promise<Storyline>
    moveNodesToWorkspace: (nodeIds: string[], workspaceId: string | null) => Promise<void>
    workspaces: Workspace[]
  }
  contextMenuNodeId: Ref<string | null>
  closeContextMenu: () => void
  showToast?: (message: string, type: 'error' | 'success' | 'info') => void
}

export interface UseStorylinesReturn {
  addNodeToStoryline: (storylineId: string) => Promise<void>
  createStorylineFromNode: () => Promise<void>
  moveNodesToWorkspace: (workspaceId: string | null) => Promise<void>
}

export function useStorylines(ctx: UseStorylinesContext): UseStorylinesReturn {
  const { store, contextMenuNodeId, closeContextMenu, showToast } = ctx

  /**
   * Get node IDs to operate on - selected nodes if multi-select includes context menu node,
   * otherwise just the context menu node
   */
  function getTargetNodeIds(): string[] {
    if (!contextMenuNodeId.value) return []

    const selectedIncludesContextNode =
      store.selectedNodeIds.length > 1 &&
      store.selectedNodeIds.includes(contextMenuNodeId.value)

    return selectedIncludesContextNode
      ? [...store.selectedNodeIds]
      : [contextMenuNodeId.value]
  }

  async function addNodeToStoryline(storylineId: string) {
    const nodeIds = getTargetNodeIds()
    if (nodeIds.length === 0) return

    try {
      for (const nodeId of nodeIds) {
        await store.addNodeToStoryline(storylineId, nodeId)
      }
      showToast?.(`Added ${nodeIds.length} node(s) to storyline`, 'success')
      closeContextMenu()
    } catch (e) {
      console.error('Failed to add nodes to storyline:', e)
      showToast?.(`Failed to add: ${e}`, 'error')
    }
  }

  async function createStorylineFromNode() {
    const nodeIds = getTargetNodeIds()
    if (nodeIds.length === 0) return

    const firstNode = store.getNode(nodeIds[0])
    if (!firstNode) return

    try {
      const title = nodeIds.length > 1
        ? `Story: ${nodeIds.length} nodes`
        : `Story: ${firstNode.title}`
      const storyline = await store.createStoryline(title)
      for (const nodeId of nodeIds) {
        await store.addNodeToStoryline(storyline.id, nodeId)
      }
      showToast?.(`Created storyline with ${nodeIds.length} node(s)`, 'success')
      closeContextMenu()
    } catch (e) {
      console.error('Failed to create storyline:', e)
      showToast?.(`Failed: ${e}`, 'error')
    }
  }

  async function moveNodesToWorkspace(workspaceId: string | null) {
    const nodeIds = getTargetNodeIds()
    if (nodeIds.length === 0) return

    try {
      await store.moveNodesToWorkspace(nodeIds, workspaceId)
      const targetName = workspaceId
        ? store.workspaces.find(w => w.id === workspaceId)?.name || 'workspace'
        : 'Default Workspace'
      showToast?.(`Moved ${nodeIds.length} node(s) to ${targetName}`, 'success')
      closeContextMenu()
    } catch (e) {
      console.error('Failed to move nodes:', e)
      showToast?.(`Failed: ${e}`, 'error')
    }
  }

  return {
    addNodeToStoryline,
    createStorylineFromNode,
    moveNodesToWorkspace,
  }
}
