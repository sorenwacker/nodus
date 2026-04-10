import { ref, nextTick, type Ref } from 'vue'

export interface UseStorylineNavigationOptions {
  contentRef: Ref<HTMLElement | null>
  nodeCount: () => number
  onClose: () => void
}

/**
 * Handles navigation within the storyline reader.
 * Provides functions for navigating between nodes, keyboard shortcuts, and scroll sync.
 */
export function useStorylineNavigation(options: UseStorylineNavigationOptions) {
  const { contentRef, nodeCount, onClose } = options

  const activeNodeIndex = ref(0)

  function goToNode(index: number) {
    activeNodeIndex.value = index
    nextTick(() => {
      const section = document.getElementById(`node-${index}`)
      if (section) {
        section.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
    })
  }

  function goToPrevious() {
    if (activeNodeIndex.value > 0) {
      goToNode(activeNodeIndex.value - 1)
    }
  }

  function goToNext() {
    if (activeNodeIndex.value < nodeCount() - 1) {
      goToNode(activeNodeIndex.value + 1)
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    switch (e.key) {
      case 'Escape':
        onClose()
        break
      case 'ArrowLeft':
      case 'ArrowUp':
        e.preventDefault()
        goToPrevious()
        break
      case 'ArrowRight':
      case 'ArrowDown':
        e.preventDefault()
        goToNext()
        break
    }
  }

  function handleScroll() {
    if (!contentRef.value) return

    const sections = contentRef.value.querySelectorAll('.node-section')
    let closestIndex = 0
    let closestDistance = Infinity

    sections.forEach((section, index) => {
      const rect = section.getBoundingClientRect()
      const distance = Math.abs(rect.top - 100) // 100px offset for header
      if (distance < closestDistance) {
        closestDistance = distance
        closestIndex = index
      }
    })

    activeNodeIndex.value = closestIndex
  }

  function setupKeyboardListeners() {
    window.addEventListener('keydown', handleKeydown)
  }

  function cleanupKeyboardListeners() {
    window.removeEventListener('keydown', handleKeydown)
  }

  return {
    activeNodeIndex,
    goToNode,
    goToPrevious,
    goToNext,
    handleKeydown,
    handleScroll,
    setupKeyboardListeners,
    cleanupKeyboardListeners,
  }
}
