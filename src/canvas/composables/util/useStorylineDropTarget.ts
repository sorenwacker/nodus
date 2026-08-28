/**
 * useStorylineDropTarget - Composable for handling drag-drop onto storyline panel
 *
 * Tracks when nodes are being dragged over the panel and resolves which
 * storyline section (and insertion position) the pointer is over.
 */
import { ref, onMounted, onUnmounted, type Ref } from 'vue'
import { setOverStorylinePanel } from './dragDropTarget'
import type { StorylineService } from '../../../services/storylineService'
import type { useNodesStore } from '../../../stores/nodes'

type NodesStore = ReturnType<typeof useNodesStore>

export interface StorylineDropTarget {
  storylineId: string
  /** Insertion index inside the section's node list; null appends at the end */
  index: number | null
}

export interface StorylineDropTargetOptions {
  store: NodesStore
  storylineService: StorylineService | undefined
  showToast?: (message: string, type: 'error' | 'success' | 'info') => void
  /** Section (and index) under the pointer, or null when over none */
  resolveDropTarget: (clientX: number, clientY: number) => StorylineDropTarget | null
  /** Target when the pointer is over the panel but not over a section */
  fallbackTarget: () => StorylineDropTarget | null
  /** Called after nodes were added, e.g. to expand the receiving section */
  onNodesAdded?: (storylineId: string) => void
}

export function useStorylineDropTarget(
  panelRef: Ref<HTMLElement | null>,
  options: StorylineDropTargetOptions
) {
  const { store, storylineService, showToast, resolveDropTarget, fallbackTarget, onNodesAdded } =
    options

  const isDropTarget = ref(false)
  const dropPreview = ref<StorylineDropTarget | null>(null)

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

  function onGlobalPointerMove(e: PointerEvent) {
    if (document.body.classList.contains('node-dragging')) {
      const over = checkIfOverPanel(e.clientX, e.clientY)
      isDropTarget.value = over
      setOverStorylinePanel(over)
      dropPreview.value = over ? resolveDropTarget(e.clientX, e.clientY) : null
    }
  }

  function onDragEnd() {
    isDropTarget.value = false
    dropPreview.value = null
    // Cleared after the drag-end handlers have read it. The ordering used to
    // be the only thing keeping this correct; it is still deferred, but the
    // value is now a named module both sides import
    // (PRODUCT_DESIGN.md > Dropping a node on the storyline panel)
    setTimeout(() => {
      setOverStorylinePanel(false)
    }, 0)
  }

  async function handleNodeDrop(event: Event) {
    const e = event as CustomEvent<{ nodeIds: string[]; x: number; y: number }>
    const { nodeIds, x, y } = e.detail

    const target = resolveDropTarget(x, y) ?? fallbackTarget()
    if (!target) {
      showToast?.('Create a storyline first', 'info')
      return
    }

    try {
      let position = target.index
      for (const nodeId of nodeIds) {
        if (storylineService) {
          await storylineService.addNode(target.storylineId, nodeId, position ?? undefined)
        } else {
          await store.addNodeToStoryline(target.storylineId, nodeId, position ?? undefined)
        }
        if (position !== null) position++
      }
      const title = store.filteredStorylines.find(s => s.id === target.storylineId)?.title
      showToast?.(
        title
          ? `Added ${nodeIds.length} node(s) to "${title}"`
          : `Added ${nodeIds.length} node(s) to storyline`,
        'success'
      )
      onNodesAdded?.(target.storylineId)
    } catch (err) {
      showToast?.(`Failed to add nodes: ${err}`, 'error')
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
    dropPreview,
  }
}
