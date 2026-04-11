/**
 * Composable for tracking visible sections using IntersectionObserver
 * Replaces manual getBoundingClientRect() calls for better performance
 */
import { ref, onUnmounted, type Ref } from 'vue'

export interface ScrollObserverOptions {
  /** Root element to observe within */
  root: Ref<HTMLElement | null>
  /** Selector for elements to observe */
  selector: string
  /** Root margin for intersection detection */
  rootMargin?: string
  /** Threshold for intersection */
  threshold?: number | number[]
}

export function useScrollObserver(options: ScrollObserverOptions) {
  const activeIndex = ref(0)
  const visibleIndices = ref<Set<number>>(new Set())

  let observer: IntersectionObserver | null = null

  /**
   * Initialize the observer
   * Call this after the content is rendered
   */
  function initObserver() {
    if (!options.root.value) return

    // Disconnect existing observer
    if (observer) {
      observer.disconnect()
    }

    observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const element = entry.target as HTMLElement
          const indexAttr = element.getAttribute('data-node-index')
          if (indexAttr === null) continue

          const index = parseInt(indexAttr, 10)
          if (isNaN(index)) continue

          if (entry.isIntersecting) {
            visibleIndices.value.add(index)
          } else {
            visibleIndices.value.delete(index)
          }
        }

        // Active index is the lowest visible index
        if (visibleIndices.value.size > 0) {
          activeIndex.value = Math.min(...visibleIndices.value)
        }
      },
      {
        root: options.root.value,
        rootMargin: options.rootMargin ?? '-20% 0px -60% 0px',
        threshold: options.threshold ?? 0,
      }
    )

    // Observe all matching elements
    const elements = options.root.value.querySelectorAll(options.selector)
    elements.forEach((el) => {
      observer?.observe(el)
    })
  }

  /**
   * Refresh the observer (e.g., when content changes)
   */
  function refreshObserver() {
    visibleIndices.value.clear()
    initObserver()
  }

  /**
   * Disconnect the observer
   */
  function disconnectObserver() {
    if (observer) {
      observer.disconnect()
      observer = null
    }
    visibleIndices.value.clear()
  }

  onUnmounted(() => {
    disconnectObserver()
  })

  return {
    activeIndex,
    visibleIndices,
    initObserver,
    refreshObserver,
    disconnectObserver,
  }
}
