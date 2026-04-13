/**
 * Canvas zoom composable
 *
 * Handles wheel zoom/pan and mouse tracking
 */

import { ref, type Ref } from 'vue'

export interface UseCanvasZoomContext {
  canvasRef: Ref<HTMLElement | null>
  scale: Ref<number>
  offsetX: Ref<number>
  offsetY: Ref<number>
  isZooming: Ref<boolean>
  startZooming: () => void
  scheduleSaveViewState: () => void
}

export interface UseCanvasZoomReturn {
  // State
  isMouseOnCanvas: Ref<boolean>

  // Functions
  onWheel: (e: WheelEvent) => void
  onCanvasPointerMove: (e: PointerEvent) => void
  onCanvasPointerEnter: () => void
  onCanvasPointerLeave: () => void
}

export function useCanvasZoom(ctx: UseCanvasZoomContext): UseCanvasZoomReturn {
  const {
    canvasRef,
    scale,
    offsetX,
    offsetY,
    isZooming,
    startZooming,
    scheduleSaveViewState,
  } = ctx

  // State
  const isMouseOnCanvas = ref(false)

  // Zoom throttling for large graphs - accumulate deltas and apply via RAF
  let pendingZoom: { deltaY: number; mouseX: number; mouseY: number } | null = null
  let zoomRafId: number | null = null

  function applyPendingZoom() {
    zoomRafId = null
    if (!pendingZoom) return

    const { deltaY, mouseX, mouseY } = pendingZoom
    pendingZoom = null

    startZooming()

    const zoomIntensity = 0.003
    const delta = Math.exp(-deltaY * zoomIntensity)
    const newScale = Math.min(Math.max(scale.value * delta, 0.01), 3)
    const scaleChange = newScale / scale.value
    offsetX.value = mouseX - (mouseX - offsetX.value) * scaleChange
    offsetY.value = mouseY - (mouseY - offsetY.value) * scaleChange
    scale.value = newScale

    // Save view state (debounced)
    scheduleSaveViewState()
  }

  function onWheel(e: WheelEvent) {
    // Check if inside a scrollable element
    const target = e.target as HTMLElement
    const scrollable = target.closest('.node-content') || target.closest('.inline-editor')

    if (scrollable) {
      const el = scrollable as HTMLElement
      const canScroll = el.scrollHeight > el.clientHeight

      if (canScroll) {
        // Check if at scroll boundaries
        const atTop = el.scrollTop <= 0
        const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 1

        // Let the element scroll if not at boundary
        if ((e.deltaY < 0 && !atTop) || (e.deltaY > 0 && !atBottom)) {
          return // Let the element scroll normally
        }

        // At boundary - prevent canvas zoom, just absorb the event
        e.preventDefault()
        e.stopPropagation()
        return
      }
    }

    e.preventDefault()

    const rect = canvasRef.value?.getBoundingClientRect()
    if (!rect) return

    const mouseX = e.clientX - rect.left
    const mouseY = e.clientY - rect.top

    // Two-finger vertical (up/down) = zoom
    // Two-finger horizontal = pan
    // Pinch = zoom (ctrlKey is set)
    const isHorizontalPan = Math.abs(e.deltaX) > Math.abs(e.deltaY) * 0.3

    if (isHorizontalPan && !e.ctrlKey) {
      // Horizontal pan - disable smooth transitions
      isZooming.value = false
      offsetX.value -= e.deltaX
      offsetY.value -= e.deltaY
      scheduleSaveViewState()
    } else {
      // Throttle zoom via RAF - accumulate delta and apply once per frame
      // This prevents multiple recomputations per wheel event burst
      if (pendingZoom) {
        // Accumulate delta for smoother zooming
        pendingZoom.deltaY += e.deltaY
        pendingZoom.mouseX = mouseX
        pendingZoom.mouseY = mouseY
      } else {
        pendingZoom = { deltaY: e.deltaY, mouseX, mouseY }
      }

      if (!zoomRafId) {
        zoomRafId = requestAnimationFrame(applyPendingZoom)
      }
    }
  }

  function onCanvasPointerMove(_e: PointerEvent) {
    // Mouse tracking - kept for potential future use
  }

  function onCanvasPointerEnter() {
    isMouseOnCanvas.value = true
  }

  function onCanvasPointerLeave() {
    isMouseOnCanvas.value = false
  }

  return {
    isMouseOnCanvas,
    onWheel,
    onCanvasPointerMove,
    onCanvasPointerEnter,
    onCanvasPointerLeave,
  }
}
