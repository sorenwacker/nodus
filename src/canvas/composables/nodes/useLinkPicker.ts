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
    console.log('[LinkPicker] openLinkPicker called')
    console.log('[LinkPicker] contextMenuNodeId.value:', deps.contextMenuNodeId.value)
    linkPickerSourceNodeId.value = deps.contextMenuNodeId.value
    console.log('[LinkPicker] linkPickerSourceNodeId set to:', linkPickerSourceNodeId.value)
    showLinkPicker.value = true
    deps.closeContextMenu()
  }

  function closeLinkPicker() {
    showLinkPicker.value = false
    linkPickerSourceNodeId.value = null
  }

  async function linkToNode(targetNodeId: string) {
    console.log('[LinkPicker] linkToNode called with targetNodeId:', targetNodeId)
    console.log('[LinkPicker] linkPickerSourceNodeId.value:', linkPickerSourceNodeId.value)
    if (!linkPickerSourceNodeId.value) {
      console.warn('[LinkPicker] No source node ID, aborting')
      return
    }
    try {
      console.log('[LinkPicker] Creating edge from', linkPickerSourceNodeId.value, 'to', targetNodeId)
      await deps.createEdge(linkPickerSourceNodeId.value, targetNodeId)
      console.log('[LinkPicker] Edge created successfully')
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
