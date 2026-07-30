/**
 * usePointerReorder - pointer-based drag reordering of a vertical list
 *
 * The one reorder mechanism shared by storyline node lists and the storyline
 * overview itself. Pointer-based rather than HTML5 drag-drop because the
 * latter is unreliable in WebKit: a drag starts after 5px of movement (so
 * plain clicks pass through), items are hit-tested under the pointer, and a
 * completed drag reports the from/to indices.
 */
import { ref } from 'vue'

export interface PointerReorderOptions {
  /** CSS selector matching one reorderable item (scoped by containerSelector) */
  itemSelector: string
  /** CSS selector of the list container */
  containerSelector: string
  /** Called after a completed drag with the source and target item indices */
  onReorder: (fromIndex: number, toIndex: number) => void
  /** Elements that must not start a drag (default: buttons and inputs) */
  ignoreSelector?: string
}

/** Move a list element from one index to another, returning a new array */
export function moveItem<T>(list: readonly T[], fromIndex: number, toIndex: number): T[] {
  const copy = [...list]
  const [removed] = copy.splice(fromIndex, 1)
  // Adjust the target when moving down (an element before it was removed)
  const adjusted = toIndex > fromIndex ? toIndex - 1 : toIndex
  copy.splice(adjusted, 0, removed)
  return copy
}

export function usePointerReorder(options: PointerReorderOptions) {
  const { itemSelector, containerSelector, onReorder } = options
  const ignoreSelector = options.ignoreSelector ?? 'button, input, textarea'

  const draggingIndex = ref<number | null>(null)
  const dragOverIndex = ref<number | null>(null)

  let pointerStartY = 0
  let isDragging = false

  function items(): Element[] {
    return Array.from(document.querySelectorAll(`${containerSelector} ${itemSelector}`))
  }

  function onPointerDown(e: PointerEvent, index: number) {
    if (e.button !== 0) return
    if ((e.target as HTMLElement).closest(ignoreSelector)) return

    // Prevent text selection while possibly dragging
    e.preventDefault()

    draggingIndex.value = index
    pointerStartY = e.clientY
    isDragging = false

    document.body.classList.add('storyline-dragging')
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)

    document.addEventListener('pointermove', onPointerMove)
    document.addEventListener('pointerup', onPointerUp)
  }

  function onPointerMove(e: PointerEvent) {
    if (draggingIndex.value === null) return

    if (Math.abs(e.clientY - pointerStartY) > 5) {
      isDragging = true
    }
    if (!isDragging) return

    const under = document.elementsFromPoint(e.clientX, e.clientY)
    const item = under.find(el => el.matches(itemSelector))
    if (item) {
      const hoverIndex = items().indexOf(item)
      if (hoverIndex !== -1 && hoverIndex !== draggingIndex.value) {
        dragOverIndex.value = hoverIndex
      }
    }
  }

  function onPointerUp() {
    document.removeEventListener('pointermove', onPointerMove)
    document.removeEventListener('pointerup', onPointerUp)
    document.body.classList.remove('storyline-dragging')

    if (draggingIndex.value === null) return

    const fromIndex = draggingIndex.value
    const toIndex = dragOverIndex.value
    if (isDragging && toIndex !== null && toIndex !== fromIndex) {
      onReorder(fromIndex, toIndex)
    }

    draggingIndex.value = null
    dragOverIndex.value = null
    isDragging = false
  }

  return {
    draggingIndex,
    dragOverIndex,
    onPointerDown,
  }
}
