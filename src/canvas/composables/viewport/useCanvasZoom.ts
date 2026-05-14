/**
 * Canvas zoom composable
 *
 * Handles wheel zoom/pan and mouse tracking
 *
 * Zoom modes:
 * - 'scroll': Two-finger vertical scroll = zoom (default, traditional)
 * - 'pinch': Only pinch gesture (ctrl+scroll) = zoom, scroll = pan
 */

import { ref, type Ref } from 'vue'
import { canvasStorage } from '../../../lib/storage'

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

  // Pinch momentum state
  let pinchVelocity = 0
  let lastPinchTime = 0
  let lastPinchMouseX = 0
  let lastPinchMouseY = 0
  let momentumRafId: number | null = null

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

  function applyZoomAtPoint(deltaY: number, mouseX: number, mouseY: number, intensity: number) {
    const delta = Math.exp(-deltaY * intensity)
    const newScale = Math.min(Math.max(scale.value * delta, 0.01), 3)
    const scaleChange = newScale / scale.value
    offsetX.value = mouseX - (mouseX - offsetX.value) * scaleChange
    offsetY.value = mouseY - (mouseY - offsetY.value) * scaleChange
    scale.value = newScale
  }

  function startPinchMomentum() {
    if (momentumRafId) return
    if (Math.abs(pinchVelocity) < 0.5) {
      pinchVelocity = 0
      return
    }

    const friction = 0.92
    const minVelocity = 0.3

    function animateMomentum() {
      if (Math.abs(pinchVelocity) < minVelocity) {
        pinchVelocity = 0
        momentumRafId = null
        scheduleSaveViewState()
        return
      }

      applyZoomAtPoint(pinchVelocity, lastPinchMouseX, lastPinchMouseY, 0.008)
      pinchVelocity *= friction

      momentumRafId = requestAnimationFrame(animateMomentum)
    }

    momentumRafId = requestAnimationFrame(animateMomentum)
  }

  function stopPinchMomentum() {
    if (momentumRafId) {
      cancelAnimationFrame(momentumRafId)
      momentumRafId = null
    }
    pinchVelocity = 0
  }

  function onWheel(e: WheelEvent) {
    // Check if inside a scrollable element (but allow pinch zoom to pass through)
    const target = e.target as HTMLElement
    const scrollable = target.closest('.node-content') || target.closest('.inline-editor')

    if (scrollable && !e.ctrlKey) {
      // Only handle scroll events, not pinch zoom (ctrlKey)
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

    // Zoom mode determines behavior:
    // 'scroll' (default): Two-finger vertical = zoom, pinch (ctrlKey) = zoom
    // 'pinch': Only pinch (ctrlKey) = zoom, all scroll = pan
    const zoomMode = canvasStorage.getZoomMode()
    const isHorizontalPan = Math.abs(e.deltaX) > Math.abs(e.deltaY) * 0.3

    // Determine if this should be a zoom or pan
    let shouldZoom = false
    if (zoomMode === 'pinch') {
      // Pinch mode: only zoom on pinch gesture (ctrlKey)
      shouldZoom = e.ctrlKey
    } else {
      // Scroll mode (default): zoom on vertical scroll or pinch
      shouldZoom = !isHorizontalPan || e.ctrlKey
    }

    if (!shouldZoom) {
      // Pan - disable smooth transitions
      isZooming.value = false
      offsetX.value -= e.deltaX
      offsetY.value -= e.deltaY
      scheduleSaveViewState()
    } else if (e.ctrlKey) {
      // Pinch gesture (ctrlKey) - apply immediately for responsiveness
      stopPinchMomentum()
      startZooming()

      // Track velocity for momentum
      const now = performance.now()
      const timeDelta = now - lastPinchTime
      if (timeDelta > 0 && timeDelta < 100) {
        // Blend new velocity with previous for smoothness
        pinchVelocity = pinchVelocity * 0.3 + e.deltaY * 0.7
      } else {
        pinchVelocity = e.deltaY
      }
      lastPinchTime = now
      lastPinchMouseX = mouseX
      lastPinchMouseY = mouseY

      // Apply zoom immediately
      applyZoomAtPoint(e.deltaY, mouseX, mouseY, 0.008)

      // Schedule momentum check - if no new events within 50ms, start momentum
      setTimeout(() => {
        if (performance.now() - lastPinchTime >= 45) {
          startPinchMomentum()
        }
      }, 50)
    } else {
      // Regular scroll zoom - throttle via RAF to prevent jank on large graphs
      if (pendingZoom) {
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
