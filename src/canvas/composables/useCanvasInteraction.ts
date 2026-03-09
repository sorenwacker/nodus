/**
 * Canvas interaction composable
 * Handles pan, zoom, and coordinate transformations
 */
import { ref, computed } from 'vue'

interface UseCanvasInteractionOptions {
  minScale?: number
  maxScale?: number
  initialScale?: number
  initialOffsetX?: number
  initialOffsetY?: number
}

export function useCanvasInteraction(options: UseCanvasInteractionOptions = {}) {
  const {
    minScale = 0.1,
    maxScale = 3,
    initialScale = 1,
    initialOffsetX = 0,
    initialOffsetY = 0,
  } = options

  const scale = ref(initialScale)
  const offsetX = ref(initialOffsetX)
  const offsetY = ref(initialOffsetY)
  const isPanning = ref(false)
  const panStartX = ref(0)
  const panStartY = ref(0)

  const transform = computed(() => {
    return `translate3d(${offsetX.value}px, ${offsetY.value}px, 0) scale(${scale.value})`
  })

  function screenToCanvas(
    screenX: number,
    screenY: number,
    canvasRect: DOMRect | null
  ): { x: number; y: number } {
    if (!canvasRect) return { x: 0, y: 0 }
    return {
      x: (screenX - canvasRect.left - offsetX.value) / scale.value,
      y: (screenY - canvasRect.top - offsetY.value) / scale.value,
    }
  }

  function canvasToScreen(
    canvasX: number,
    canvasY: number,
    canvasRect: DOMRect | null
  ): { x: number; y: number } {
    if (!canvasRect) return { x: 0, y: 0 }
    return {
      x: canvasX * scale.value + offsetX.value + canvasRect.left,
      y: canvasY * scale.value + offsetY.value + canvasRect.top,
    }
  }

  function zoom(
    delta: number,
    centerX: number,
    centerY: number,
    canvasRect: DOMRect | null
  ) {
    if (!canvasRect) return

    const zoomFactor = delta > 0 ? 0.9 : 1.1
    const newScale = Math.max(minScale, Math.min(maxScale, scale.value * zoomFactor))

    if (newScale !== scale.value) {
      const mouseX = centerX - canvasRect.left
      const mouseY = centerY - canvasRect.top

      const canvasX = (mouseX - offsetX.value) / scale.value
      const canvasY = (mouseY - offsetY.value) / scale.value

      scale.value = newScale
      offsetX.value = mouseX - canvasX * newScale
      offsetY.value = mouseY - canvasY * newScale
    }
  }

  function startPan(clientX: number, clientY: number) {
    isPanning.value = true
    panStartX.value = clientX - offsetX.value
    panStartY.value = clientY - offsetY.value
  }

  function updatePan(clientX: number, clientY: number) {
    if (!isPanning.value) return
    offsetX.value = clientX - panStartX.value
    offsetY.value = clientY - panStartY.value
  }

  function endPan() {
    isPanning.value = false
  }

  function fitToContent(
    nodes: Array<{ canvas_x: number; canvas_y: number; width: number; height: number }>,
    canvasWidth: number,
    canvasHeight: number,
    padding = 50
  ) {
    if (nodes.length === 0) return

    let minX = Infinity, minY = Infinity
    let maxX = -Infinity, maxY = -Infinity

    for (const node of nodes) {
      minX = Math.min(minX, node.canvas_x)
      minY = Math.min(minY, node.canvas_y)
      maxX = Math.max(maxX, node.canvas_x + (node.width || 200))
      maxY = Math.max(maxY, node.canvas_y + (node.height || 120))
    }

    const contentWidth = maxX - minX
    const contentHeight = maxY - minY

    const scaleX = (canvasWidth - padding * 2) / contentWidth
    const scaleY = (canvasHeight - padding * 2) / contentHeight
    const newScale = Math.max(minScale, Math.min(maxScale, Math.min(scaleX, scaleY)))

    scale.value = newScale
    offsetX.value = (canvasWidth - contentWidth * newScale) / 2 - minX * newScale
    offsetY.value = (canvasHeight - contentHeight * newScale) / 2 - minY * newScale
  }

  function reset() {
    scale.value = initialScale
    offsetX.value = initialOffsetX
    offsetY.value = initialOffsetY
  }

  return {
    scale,
    offsetX,
    offsetY,
    isPanning,
    transform,
    screenToCanvas,
    canvasToScreen,
    zoom,
    startPan,
    updatePan,
    endPan,
    fitToContent,
    reset,
  }
}
