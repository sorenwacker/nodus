/**
 * Canvas display composable
 *
 * Handles magnifier, image thumbnails, and font scale display settings
 */

import { ref, computed, type Ref, type ComputedRef } from 'vue'
import { uiStorage } from '../../../lib/storage'
import type { Node } from '../../../types'

export interface UseCanvasDisplayContext {
  scale: Ref<number>
  filteredNodes: ComputedRef<Node[]> | Ref<Node[]>
  isLargeGraph: ComputedRef<boolean>
  showMagnifier: Ref<boolean>
}

export interface UseCanvasDisplayReturn {
  // Magnifier
  magnifierEnabled: Ref<boolean>
  shouldShowMagnifier: ComputedRef<boolean>
  toggleMagnifier: () => void
  MAGNIFIER_THRESHOLD: number
  MAGNIFIER_SIZE: number
  MAGNIFIER_ZOOM: number

  // Image thumbnails
  nodeFirstImage: ComputedRef<Record<string, string | null>>
  showImageThumbnail: ComputedRef<boolean>

  // Font scale
  fontScale: Ref<number>
  increaseFontScale: () => void
  decreaseFontScale: () => void
}

import { displayStorage } from '../../../lib/storage'

const MAGNIFIER_SIZE = 200
const MAGNIFIER_ZOOM = 2.5
const MIN_FONT_SCALE = 0.7
const MAX_FONT_SCALE = 1.5

export function useCanvasDisplay(ctx: UseCanvasDisplayContext): UseCanvasDisplayReturn {
  const { scale, filteredNodes, isLargeGraph, showMagnifier } = ctx

  // Magnifier state
  const magnifierEnabled = ref(uiStorage.getMagnifierEnabled())

  const shouldShowMagnifier = computed(() =>
    magnifierEnabled.value &&
    scale.value < displayStorage.getMagnifierZoomThreshold() &&
    showMagnifier.value &&
    !isLargeGraph.value
  )

  function toggleMagnifier() {
    magnifierEnabled.value = !magnifierEnabled.value
    uiStorage.setMagnifierEnabled(magnifierEnabled.value)
  }

  // Extract first image URL from node content for zoomed-out thumbnail display
  const nodeFirstImage = computed(() => {
    const imageMap: Record<string, string | null> = {}
    for (const node of filteredNodes.value) {
      if (!node.markdown_content) {
        imageMap[node.id] = null
        continue
      }
      // Match markdown image: ![alt](url) or HTML img: <img src="url">
      const mdMatch = node.markdown_content.match(/!\[.*?\]\(([^)]+)\)/)
      const htmlMatch = node.markdown_content.match(/<img[^>]+src=["']([^"']+)["']/)
      imageMap[node.id] = mdMatch?.[1] || htmlMatch?.[1] || null
    }
    return imageMap
  })

  // Show image thumbnail when zoomed out (scale < 0.3) and node has an image
  const showImageThumbnail = computed(() => scale.value < 0.3)

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
    // Magnifier
    magnifierEnabled,
    shouldShowMagnifier,
    toggleMagnifier,
    MAGNIFIER_THRESHOLD,
    MAGNIFIER_SIZE,
    MAGNIFIER_ZOOM,

    // Image thumbnails
    nodeFirstImage,
    showImageThumbnail,

    // Font scale
    fontScale,
    increaseFontScale,
    decreaseFontScale,
  }
}
