/**
 * Context menu composable
 * Handles right-click context menu for nodes
 */
import { ref, computed } from 'vue'
import type { Storyline } from '../../../types'

export interface ContextMenuDeps {
  getSelectedNodeIds: () => string[]
  addNodeToStoryline: (storylineId: string, nodeId: string) => Promise<void>
  createStoryline: (title: string) => Promise<Storyline>
  moveNodesToWorkspace: (nodeIds: string[], workspaceId: string | null) => Promise<void>
}

export function useContextMenu(deps: ContextMenuDeps) {
  const visible = ref(false)
  const position = ref({ x: 0, y: 0 })
  const nodeId = ref<string | null>(null)
  const storylineSubmenu = ref(false)
  const workspaceSubmenu = ref(false)

  /**
   * Get the nodes that will be affected by context menu actions.
   * If multiple nodes are selected and the context menu node is among them,
   * all selected nodes are affected. Otherwise, only the context menu node.
   */
  const affectedNodeIds = computed(() => {
    if (!nodeId.value) return []
    const selectedIds = deps.getSelectedNodeIds()
    if (selectedIds.length > 1 && selectedIds.includes(nodeId.value)) {
      return selectedIds
    }
    return [nodeId.value]
  })

  /**
   * Count of nodes affected by context menu actions
   */
  const nodeCount = computed(() => affectedNodeIds.value.length)

  /**
   * Open context menu at the given position for the given node
   */
  function open(e: MouseEvent, targetNodeId: string) {
    nodeId.value = targetNodeId
    position.value = { x: e.clientX, y: e.clientY }
    visible.value = true
    storylineSubmenu.value = false
    workspaceSubmenu.value = false
  }

  /**
   * Close context menu and reset state
   */
  function close() {
    visible.value = false
    storylineSubmenu.value = false
    workspaceSubmenu.value = false
    nodeId.value = null
  }

  /**
   * Add affected nodes to a storyline
   */
  async function addToStoryline(storylineId: string): Promise<void> {
    for (const id of affectedNodeIds.value) {
      await deps.addNodeToStoryline(storylineId, id)
    }
    close()
  }

  /**
   * Create a new storyline from affected nodes
   */
  async function createStorylineFromNodes(): Promise<void> {
    if (affectedNodeIds.value.length === 0) return

    const storyline = await deps.createStoryline('New Storyline')

    for (const id of affectedNodeIds.value) {
      await deps.addNodeToStoryline(storyline.id, id)
    }
    close()
  }

  /**
   * Move affected nodes to a workspace
   */
  async function moveToWorkspace(workspaceId: string | null): Promise<void> {
    if (affectedNodeIds.value.length === 0) return
    await deps.moveNodesToWorkspace(affectedNodeIds.value, workspaceId)
    close()
  }

  return {
    // State
    visible,
    position,
    nodeId,
    storylineSubmenu,
    workspaceSubmenu,

    // Computed
    affectedNodeIds,
    nodeCount,

    // Methods
    open,
    close,
    addToStoryline,
    createStorylineFromNodes,
    moveToWorkspace,
  }
}
