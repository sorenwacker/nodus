/**
 * Canvas display composable
 *
 * Handles image thumbnails and font scale display settings
 */

import { ref, computed, type Ref, type ComputedRef } from 'vue'
import { storeToRefs } from 'pinia'
import { uiStorage } from '../../../lib/storage'
import { useDisplayStore } from '../../../stores/display'
import type { Node } from '../../../types'

export interface UseCanvasDisplayContext {
  scale: Ref<number>
  filteredNodes: ComputedRef<Node[]> | Ref<Node[]>
  isLargeGraph: ComputedRef<boolean>
}

export interface UseCanvasDisplayReturn {
  // Image thumbnails
  nodeFirstImage: ComputedRef<Record<string, string | null>>
  showImageThumbnail: ComputedRef<boolean>

  // Font scale
  fontScale: Ref<number>
  increaseFontScale: () => void
  decreaseFontScale: () => void
}

const MIN_FONT_SCALE = 0.7
const MAX_FONT_SCALE = 1.5

export function useCanvasDisplay(ctx: UseCanvasDisplayContext): UseCanvasDisplayReturn {
  const { scale, filteredNodes } = ctx

  // Get semantic zoom threshold from display store to stay in sync with collapse behavior
  const displayStore = useDisplayStore()
  const { semanticZoomThreshold } = storeToRefs(displayStore)

  // Extract first image URL from node content for zoomed-out thumbnail display
  const nodeFirstImage = computed(() => {
    const imageMap: Record<string, string | null> = {}
    for (const node of filteredNodes.value) {
      if (!node.markdown_content) {
        imageMap[node.id] = null
        continue
      }
      // Match markdown image: ![alt](url) or HTML img: <img src="url">
      // Handle URLs with parentheses by matching to last ) before newline
      const mdMatch = node.markdown_content.match(/!\[[^\]]*\]\((.+?)\)(?:\s|$)/)
      const htmlMatch = node.markdown_content.match(/<img[^>]+src=["']([^"']+)["']/)
      imageMap[node.id] = mdMatch?.[1] || htmlMatch?.[1] || null
    }
    return imageMap
  })

  // Show image thumbnail when zoomed out enough that content is collapsed
  // Uses the same threshold as semantic zoom collapse for consistent transitions
  const showImageThumbnail = computed(() => scale.value < semanticZoomThreshold.value)

  // Font scale state
  const fontScale = ref(uiStorage.getFontScale())

  function increaseFontScale() {
    fontScale.value = Math.min(MAX_FONT_SCALE, fontScale.value + 0.1)
    uiStorage.setFontScale(fontScale.value)
    document.documentElement.style.setProperty('--font-scale', String(fontScale.value))
  }

  function decreaseFontScale() {
    fontScale.value = Math.max(MIN_FONT_SCALE, fontScale.value - 0.1)
    uiStorage.setFontScale(fontScale.value)
    document.documentElement.style.setProperty('--font-scale', String(fontScale.value))
  }

  return {
    // Image thumbnails
    nodeFirstImage,
    showImageThumbnail,

    // Font scale
    fontScale,
    increaseFontScale,
    decreaseFontScale,
  }
}
