/**
 * Preview panel composable
 * Handles the node preview panel shown when zoomed out
 */
import { ref, watch, nextTick, type Ref, type ComputedRef } from 'vue'
import type { Node } from '../../../types'

export interface UsePreviewPanelContext {
  selectedNodeIds: Ref<string[]>
  isSemanticZoomCollapsed: ComputedRef<boolean>
  getNode: (id: string) => Node | undefined
  zoomToNode: (nodeId: string, targetScale?: number) => void
}

export interface UsePreviewPanelReturn {
  showPreviewPanel: Ref<boolean>
  previewNode: ComputedRef<Node | undefined>
  closePreviewPanel: () => void
  zoomToPreviewNode: () => void
}

export function usePreviewPanel(ctx: UsePreviewPanelContext): UsePreviewPanelReturn {
  const { selectedNodeIds, isSemanticZoomCollapsed, getNode, zoomToNode } = ctx

  const showPreviewPanel = ref(false)

  // Auto-show preview when single node selected while zoomed out
  // Auto-hide when no nodes selected
  watch(
    [selectedNodeIds, isSemanticZoomCollapsed],
    ([ids, collapsed]) => {
      if (ids.length === 0) {
        showPreviewPanel.value = false
      } else if (collapsed && ids.length === 1) {
        showPreviewPanel.value = true
      }
    },
    { immediate: true }
  )

  const previewNode = {
    get value() {
      const nodeId = selectedNodeIds.value[0]
      return nodeId ? getNode(nodeId) : undefined
    },
  } as ComputedRef<Node | undefined>

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
