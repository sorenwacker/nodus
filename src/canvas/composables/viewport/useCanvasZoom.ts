/**
 * Canvas zoom composable
 *
 * Handles wheel zoom/pan and mouse tracking
 *
 * Zoom modes:
 * - 'scroll': Two-finger vertical scroll = zoom (default, traditional)
 * - 'pinch': Only pinch gesture (ctrl+scroll) = zoom, scroll = pan
 */

import { ref, onMounted, onUnmounted, type Ref } from 'vue'
import { canvasStorage } from '../../../lib/storage'
import { ZOOM_LIMITS } from '../../constants'

export interface UseCanvasZoomContext {
  canvasRef: Ref<HTMLElement | null>
  scale: Ref<number>
  offsetX: Ref<number>
  offsetY: Ref<number>
  isZooming: Ref<boolean>
  /** Dynamic zoom-out floor, from content extent (useViewState > minZoom) */
  minZoom?: () => number
  startZooming: () => void
  scheduleSaveViewState: () => void
}

export interface UseCanvasZoomReturn {
  // State
  isMouseOnCanvas: Ref<boolean>

  // Functions
  /** Zoom by a multiplicative factor about a point in canvas-viewport pixels */
  zoomByRatio: (ratio: number, mouseX: number, mouseY: number) => void
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
    minZoom,
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
    const newScale = Math.min(Math.max(scale.value * delta, minZoom?.() ?? ZOOM_LIMITS.MIN), ZOOM_LIMITS.MAX)
    const scaleChange = newScale / scale.value
    offsetX.value = mouseX - (mouseX - offsetX.value) * scaleChange
    offsetY.value = mouseY - (mouseY - offsetY.value) * scaleChange
    scale.value = newScale

    // Save view state (debounced)
    scheduleSaveViewState()
  }

  function applyZoomAtPoint(deltaY: number, mouseX: number, mouseY: number, intensity: number) {
    const delta = Math.exp(-deltaY * intensity)
    const newScale = Math.min(Math.max(scale.value * delta, minZoom?.() ?? ZOOM_LIMITS.MIN), ZOOM_LIMITS.MAX)
    const scaleChange = newScale / scale.value
    offsetX.value = mouseX - (mouseX - offsetX.value) * scaleChange
    offsetY.value = mouseY - (mouseY - offsetY.value) * scaleChange
    scale.value = newScale
  }

  /**
   * Zoom by a multiplicative factor about a point, in canvas-viewport pixels.
   * The touchpad reports a cumulative scale rather than a wheel delta, so it
   * needs this rather than applyZoomAtPoint's exponential-of-delta form.
   */
  function zoomByRatio(ratio: number, mouseX: number, mouseY: number) {
    if (!(ratio > 0)) return
    const newScale = Math.min(Math.max(scale.value * ratio, minZoom?.() ?? ZOOM_LIMITS.MIN), ZOOM_LIMITS.MAX)
    const scaleChange = newScale / scale.value
    offsetX.value = mouseX - (mouseX - offsetX.value) * scaleChange
    offsetY.value = mouseY - (mouseY - offsetY.value) * scaleChange
    scale.value = newScale
    scheduleSaveViewState()
  }

  // The touchpad pinch, handed over from GTK.
  //
  // WebKit answers a pinch by changing the viewport page-scale, which scales
  // the whole interface - the toolbar and the canvas controls included - and
  // is unreachable from here: it is not the zoom-level property and not a DOM
  // default action. The Rust side consumes the gesture at the GTK widget
  // before WebKit sees one and calls this instead, so a pinch zooms the canvas
  // about the pointer like every other zoom (main.rs > pinch guard).
  let lastPinchScale = 1
  let lastPinchAt = 0
  /** Last pointer position seen over the canvas, in client pixels. */
  let lastPointerX: number | null = null
  let lastPointerY: number | null = null
  /** A gap this long means the previous gesture ended and scale restarts at 1. */
  const PINCH_GESTURE_GAP_MS = 200

  function onNativePinch(cumulativeScale: number, x: number, y: number) {
    const rect = canvasRef.value?.getBoundingClientRect()
    if (!rect || !(cumulativeScale > 0)) return
    // Anchor on the pointer the canvas itself tracks, in the same coordinate
    // space the wheel path uses, rather than trusting the widget coordinates
    // the gesture carries: those come from GTK and need not share an origin
    // with the page once a panel, a header or a display scale factor is in
    // play. The gesture's own position is the fallback.
    const anchorX = lastPointerX ?? x
    const anchorY = lastPointerY ?? y
    const now = performance.now()
    const isNewGesture = now - lastPinchAt > PINCH_GESTURE_GAP_MS
    lastPinchAt = now
    if (isNewGesture) {
      // A gesture starts at 1; nothing to apply until it moves
      lastPinchScale = cumulativeScale
      return
    }
    // GDK reports scale 1 again when the gesture ends. Taken as a sample that
    // is a ratio of 1/lastScale, which throws the view back to where the pinch
    // started - the zoom appearing to spring back the moment fingers lift.
    if (cumulativeScale === 1) {
      lastPinchScale = 1
      return
    }
    const ratio = cumulativeScale / lastPinchScale
    lastPinchScale = cumulativeScale
    startZooming()
    zoomByRatio(ratio, anchorX - rect.left, anchorY - rect.top)
  }

  onMounted(() => {
    ;(window as unknown as Record<string, unknown>).__NODUS_PINCH_ZOOM = onNativePinch
  })

  onUnmounted(() => {
    delete (window as unknown as Record<string, unknown>).__NODUS_PINCH_ZOOM
  })

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

      // Momentum is still the zoom gesture: keep isZooming alive for its
      // whole run, or it reports the gesture over 150ms in while the scale is
      // still changing - and anything deferred to the gesture's end (the
      // renderer switch in useGraphMetrics) would fire mid-flight
      startZooming()
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

  function onCanvasPointerMove(e: PointerEvent) {
    // The pinch gesture carries no usable page coordinate of its own, so the
    // pointer is tracked here and used as the zoom anchor
    lastPointerX = e.clientX
    lastPointerY = e.clientY
  }

  function onCanvasPointerEnter() {
    isMouseOnCanvas.value = true
  }

  function onCanvasPointerLeave() {
    isMouseOnCanvas.value = false
  }

  return {
    isMouseOnCanvas,
    zoomByRatio,
    onWheel,
    onCanvasPointerMove,
    onCanvasPointerEnter,
    onCanvasPointerLeave,
  }
}
