import { ref, type Ref } from 'vue'

export interface LinkPickerDeps {
  contextMenuNodeId: Ref<string | null>
  closeContextMenu: () => void
  createEdge: (sourceId: string, targetId: string) => Promise<unknown>
}

/**
 * Composable for the link picker modal
 * Handles creating links from context menu
 */
export function useLinkPicker(deps: LinkPickerDeps) {
  const showLinkPicker = ref(false)
  const linkPickerSourceNodeId = ref<string | null>(null)

  function openLinkPicker() {
    linkPickerSourceNodeId.value = deps.contextMenuNodeId.value
    showLinkPicker.value = true
    deps.closeContextMenu()
  }

  function closeLinkPicker() {
    showLinkPicker.value = false
    linkPickerSourceNodeId.value = null
  }

  async function linkToNode(targetNodeId: string) {
    if (!linkPickerSourceNodeId.value) {
      return
    }
    try {
      await deps.createEdge(linkPickerSourceNodeId.value, targetNodeId)
    } catch (e) {
      console.error('[LinkPicker] Failed to create edge:', e)
    }
    closeLinkPicker()
  }

  return {
    showLinkPicker,
    linkPickerSourceNodeId,
    openLinkPicker,
    closeLinkPicker,
    linkToNode,
  }
}
