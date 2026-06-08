/**
 * useStorylineDropTarget - Composable for handling drag-drop onto storyline panel
 *
 * Tracks when nodes are being dragged over the panel and calculates
 * insertion positions based on Y coordinate.
 */
import { ref, onMounted, onUnmounted, type Ref, type ComponentPublicInstance } from 'vue'
import type { Node } from '../../../types'
import type { StorylineService } from '../../../services/storylineService'
import type { useNodesStore } from '../../../stores/nodes'

type NodesStore = ReturnType<typeof useNodesStore>

declare global {
  interface Window {
    __storylinePanelDropTarget?: boolean
  }
}

export interface StorylineDropTargetOptions {
  store: NodesStore
  storylineService: StorylineService | undefined
  selectedStorylineId: Ref<string | null>
  selectedStorylineNodes: Ref<Node[]>
  nodeListRef: Ref<ComponentPublicInstance | null>
  showToast?: (message: string, type: 'error' | 'success' | 'info') => void
  selectStoryline: (id: string) => void
  storylines: Ref<{ id: string; title: string }[]>
}

export function useStorylineDropTarget(
  panelRef: Ref<HTMLElement | null>,
  options: StorylineDropTargetOptions
) {
  const {
    store,
    storylineService,
    selectedStorylineId,
    selectedStorylineNodes,
    nodeListRef,
    showToast,
    selectStoryline,
    storylines,
  } = options

  const isDropTarget = ref(false)
  const dropPreviewIndex = ref<number | null>(null)

  function checkIfOverPanel(clientX: number, clientY: number): boolean {
    if (!panelRef.value) return false
    const rect = panelRef.value.getBoundingClientRect()
    return (
      clientX >= rect.left &&
      clientX <= rect.right &&
      clientY >= rect.top &&
      clientY <= rect.bottom
    )
  }

  function calculateDropPosition(clientY: number): number {
    const nodeListEl =
      nodeListRef.value?.$el ?? document.querySelector('.storyline-nodes-list .node-list')
    if (!nodeListEl) return selectedStorylineNodes.value.length

    const nodeItems = nodeListEl.querySelectorAll('.node-item')
    if (nodeItems.length === 0) return 0

    for (let i = 0; i < nodeItems.length; i++) {
      const rect = nodeItems[i].getBoundingClientRect()
      const midpoint = rect.top + rect.height / 2
      if (clientY < midpoint) {
        return i
      }
    }
    return nodeItems.length
  }

  function onGlobalPointerMove(e: PointerEvent) {
    if (document.body.classList.contains('node-dragging')) {
      const over = checkIfOverPanel(e.clientX, e.clientY)
      isDropTarget.value = over
      window.__storylinePanelDropTarget = over
      if (over && selectedStorylineId.value) {
        dropPreviewIndex.value = calculateDropPosition(e.clientY)
      } else {
        dropPreviewIndex.value = null
      }
    }
  }

  function onDragEnd() {
    isDropTarget.value = false
    dropPreviewIndex.value = null
    setTimeout(() => {
      window.__storylinePanelDropTarget = false
    }, 0)
  }

  async function handleNodeDrop(event: Event) {
    const e = event as CustomEvent<{ nodeIds: string[]; x: number; y: number }>
    const { nodeIds, y } = e.detail

    if (selectedStorylineId.value) {
      try {
        let position = calculateDropPosition(y)
        for (const nodeId of nodeIds) {
          if (storylineService) {
            await storylineService.addNode(selectedStorylineId.value, nodeId, position)
          } else {
            await store.addNodeToStoryline(selectedStorylineId.value, nodeId, position)
          }
          position++
        }
        showToast?.(`Added ${nodeIds.length} node(s) to storyline`, 'success')
      } catch (err) {
        showToast?.(`Failed to add nodes: ${err}`, 'error')
      }
    } else if (storylines.value.length > 0) {
      const firstStoryline = storylines.value[0]
      try {
        for (const nodeId of nodeIds) {
          if (storylineService) {
            await storylineService.addNode(firstStoryline.id, nodeId)
          } else {
            await store.addNodeToStoryline(firstStoryline.id, nodeId)
          }
        }
        showToast?.(`Added ${nodeIds.length} node(s) to "${firstStoryline.title}"`, 'success')
        selectStoryline(firstStoryline.id)
      } catch (err) {
        showToast?.(`Failed to add nodes: ${err}`, 'error')
      }
    } else {
      showToast?.('Create a storyline first', 'info')
    }
  }

  onMounted(() => {
    window.addEventListener('node-dropped-on-storyline', handleNodeDrop)
    document.addEventListener('pointermove', onGlobalPointerMove)
    document.addEventListener('pointerup', onDragEnd)
  })

  onUnmounted(() => {
    window.removeEventListener('node-dropped-on-storyline', handleNodeDrop)
    document.removeEventListener('pointermove', onGlobalPointerMove)
    document.removeEventListener('pointerup', onDragEnd)
  })

  return {
    isDropTarget,
    dropPreviewIndex,
  }
}
