/**
 * Canvas pinch composable
 *
 * Two-finger zoom and pan for touch and pen input.
 *
 * Zoom used to arrive only through wheel events. A trackpad pinch reaches the
 * page as a ctrl+wheel event so it worked there, but a touchscreen emits no
 * wheel events at all, which left the canvas with no way to zoom on a tablet.
 * This reads the pointers directly instead.
 */

import { ref, type Ref } from 'vue'

/** Matches the wheel path in useCanvasZoom, so both routes agree. */
const MIN_SCALE = 0.01
const MAX_SCALE = 3

export interface UseCanvasPinchContext {
  canvasRef: Ref<HTMLElement | null>
  scale: Ref<number>
  offsetX: Ref<number>
  offsetY: Ref<number>
  startZooming: () => void
  scheduleSaveViewState: () => void
  /**
   * Called when a second contact turns a drag into a pinch, so a pan already
   * in progress can be abandoned rather than fighting the gesture.
   */
  onPinchStart?: () => void
}

interface Contact {
  x: number
  y: number
}

interface GestureStart {
  distance: number
  /** Canvas-space point under the midpoint, held fixed through the gesture */
  anchorX: number
  anchorY: number
  scale: number
}

export function useCanvasPinch(ctx: UseCanvasPinchContext) {
  const { canvasRef, scale, offsetX, offsetY, startZooming, scheduleSaveViewState, onPinchStart } =
    ctx

  const isPinching = ref(false)

  const contacts = new Map<number, Contact>()
  let gestureStart: GestureStart | null = null
  let pending: { distance: number; midX: number; midY: number } | null = null
  let rafId: number | null = null
  let listening = false

  // A mouse already has the wheel path; taking its events here would give it
  // two competing routes to the same zoom.
  function isTouchLike(e: PointerEvent) {
    return e.pointerType === 'touch' || e.pointerType === 'pen'
  }

  /** Client coords relative to the canvas, matching the wheel path's frame. */
  function toLocal(x: number, y: number) {
    const rect = canvasRef.value?.getBoundingClientRect()
    return rect ? { x: x - rect.left, y: y - rect.top } : { x, y }
  }

  function twoContacts() {
    const it = contacts.values()
    const a = it.next().value
    const b = it.next().value
    if (!a || !b) return null
    const dx = b.x - a.x
    const dy = b.y - a.y
    return {
      distance: Math.hypot(dx, dy),
      midX: (a.x + b.x) / 2,
      midY: (a.y + b.y) / 2,
    }
  }

  function beginPinch() {
    const m = twoContacts()
    // Two contacts landing on exactly the same pixel would divide by zero
    if (!m || m.distance === 0) return

    const local = toLocal(m.midX, m.midY)
    gestureStart = {
      distance: m.distance,
      // Screen midpoint converted to canvas space once, up front
      anchorX: (local.x - offsetX.value) / scale.value,
      anchorY: (local.y - offsetY.value) / scale.value,
      scale: scale.value,
    }
    isPinching.value = true
    startZooming()
    onPinchStart?.()
  }

  function applyPending() {
    rafId = null
    if (!pending || !gestureStart) return
    const { distance, midX, midY } = pending
    pending = null

    const local = toLocal(midX, midY)
    const next = Math.min(
      Math.max((gestureStart.scale * distance) / gestureStart.distance, MIN_SCALE),
      MAX_SCALE
    )

    // Hold the anchor under the midpoint. Because the midpoint is re-read each
    // frame, dragging both fingers without changing their separation pans the
    // canvas - two-finger pan and pinch zoom fall out of the same equation.
    scale.value = next
    offsetX.value = local.x - gestureStart.anchorX * next
    offsetY.value = local.y - gestureStart.anchorY * next
  }

  function schedule() {
    if (rafId === null) rafId = requestAnimationFrame(applyPending)
  }

  function endPinch() {
    if (!isPinching.value) return
    if (rafId !== null) {
      cancelAnimationFrame(rafId)
      rafId = null
    }
    // Land on the last reported position rather than a frame behind it
    applyPending()
    isPinching.value = false
    gestureStart = null
    scheduleSaveViewState()
  }

  function onPointerMove(e: PointerEvent) {
    if (!contacts.has(e.pointerId)) return
    contacts.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (!isPinching.value || !gestureStart) return
    const m = twoContacts()
    if (!m || m.distance === 0) return
    pending = m
    schedule()
  }

  function onPointerUp(e: PointerEvent) {
    if (!contacts.delete(e.pointerId)) return
    // Lifting one finger ends the gesture. Re-anchoring on the remaining
    // contact would make the canvas jump, and the surviving finger is
    // usually on its way up too.
    if (contacts.size < 2) endPinch()
    if (contacts.size === 0) stopListening()
  }

  function startListening() {
    if (listening) return
    listening = true
    // On document, so a finger leaving the canvas element mid-gesture does not
    // strand the pinch in a half-applied state.
    document.addEventListener('pointermove', onPointerMove)
    document.addEventListener('pointerup', onPointerUp)
    // Touch gestures are frequently torn down with pointercancel instead of
    // pointerup - without this the pinch would never end.
    document.addEventListener('pointercancel', onPointerUp)
  }

  function stopListening() {
    if (!listening) return
    listening = false
    document.removeEventListener('pointermove', onPointerMove)
    document.removeEventListener('pointerup', onPointerUp)
    document.removeEventListener('pointercancel', onPointerUp)
  }

  function onPointerDown(e: PointerEvent) {
    if (!isTouchLike(e)) return
    contacts.set(e.pointerId, { x: e.clientX, y: e.clientY })
    startListening()
    if (contacts.size === 2) beginPinch()
  }

  return {
    isPinching,
    onPointerDown,
    /** Exposed for teardown; the composable manages its own listeners. */
    stopListening,
  }
}
