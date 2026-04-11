/**
 * Composable for saving and restoring scroll position in storyline reader
 */
import { ref, onUnmounted, type Ref } from 'vue'
import { storylineReadingStorage } from '../lib/storage'

const SAVE_DEBOUNCE_MS = 500

export function useScrollPositionMemory(
  storylineId: Ref<string>,
  contentRef: Ref<HTMLElement | null>,
  activeNodeIndex: Ref<number>
) {
  let saveTimeout: ReturnType<typeof setTimeout> | null = null
  const isRestoring = ref(false)

  /**
   * Schedule a debounced save of the current scroll position
   */
  function schedulePositionSave() {
    if (isRestoring.value) return

    if (saveTimeout) {
      clearTimeout(saveTimeout)
    }

    saveTimeout = setTimeout(() => {
      const scrollTop = contentRef.value?.scrollTop ?? 0
      storylineReadingStorage.setPosition(
        storylineId.value,
        activeNodeIndex.value,
        scrollTop
      )
    }, SAVE_DEBOUNCE_MS)
  }

  /**
   * Restore saved scroll position
   * Returns true if position was restored
   */
  function restorePosition(): boolean {
    const saved = storylineReadingStorage.getPosition(storylineId.value)
    if (!saved || !contentRef.value) return false

    isRestoring.value = true

    // Use requestAnimationFrame to ensure DOM is ready
    requestAnimationFrame(() => {
      if (contentRef.value) {
        contentRef.value.scrollTop = saved.scrollTop
      }
      // Allow some time for scroll to settle before enabling saves again
      setTimeout(() => {
        isRestoring.value = false
      }, 100)
    })

    return true
  }

  /**
   * Clear saved position for current storyline
   */
  function clearPosition() {
    storylineReadingStorage.clearPosition(storylineId.value)
  }

  onUnmounted(() => {
    if (saveTimeout) {
      clearTimeout(saveTimeout)
    }
  })

  return {
    schedulePositionSave,
    restorePosition,
    clearPosition,
    isRestoring,
  }
}
