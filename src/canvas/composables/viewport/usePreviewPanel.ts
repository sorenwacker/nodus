/**
 * Preview panel composable
 * Handles the node preview panel shown when zoomed out
 */
import { ref, shallowRef, watch, nextTick, type Ref, type ComputedRef } from 'vue'
import type { Node } from '../../../types'

export interface UsePreviewPanelContext {
  selectedNodeIds: Ref<string[]>
  isSemanticZoomCollapsed: ComputedRef<boolean>
  contextMenuVisible: Ref<boolean>
  getNode: (id: string) => Node | undefined
  zoomToNode: (nodeId: string, targetScale?: number) => void
}

export interface UsePreviewPanelReturn {
  showPreviewPanel: Ref<boolean>
  previewNode: Ref<Node | undefined>
  closePreviewPanel: () => void
  zoomToPreviewNode: () => void
}

export function usePreviewPanel(ctx: UsePreviewPanelContext): UsePreviewPanelReturn {
  const { selectedNodeIds, isSemanticZoomCollapsed, contextMenuVisible, getNode, zoomToNode } = ctx

  const showPreviewPanel = ref(false)

  // Auto-show preview when single node selected while zoomed out
  // Auto-hide when no nodes selected or context menu is open
  watch(
    [selectedNodeIds, isSemanticZoomCollapsed, contextMenuVisible],
    ([ids, collapsed, menuVisible]) => {
      if (ids.length === 0 || menuVisible) {
        showPreviewPanel.value = false
      } else if (collapsed && ids.length === 1) {
        showPreviewPanel.value = true
      }
    },
    { immediate: true }
  )

  // Use shallowRef to avoid tracking internal node properties
  const previewNode = shallowRef<Node | undefined>(undefined)

  // Update preview node only when selection changes
  watch(
    () => selectedNodeIds.value[0],
    (nodeId) => {
      previewNode.value = nodeId ? getNode(nodeId) : undefined
    },
    { immediate: true }
  )

  function closePreviewPanel() {
    showPreviewPanel.value = false
  }

  function zoomToPreviewNode() {
    const nodeId = selectedNodeIds.value[0]
    if (!nodeId) return
    showPreviewPanel.value = false
    nextTick(() => {
      zoomToNode(nodeId, 1)
    })
  }

  return {
    showPreviewPanel,
    previewNode,
    closePreviewPanel,
    zoomToPreviewNode,
  }
}
