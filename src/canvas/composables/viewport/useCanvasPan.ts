/**
 * Canvas pan composable
 * Manages canvas panning with pointer events (supports mouse, touch, pen)
 */
import { ref } from 'vue'

export interface UseCanvasPanOptions {
  getOffset: () => { x: number; y: number }
  setOffset: (x: number, y: number) => void
  onPanEnd?: () => void
}

export function useCanvasPan(options: UseCanvasPanOptions) {
  const { getOffset, setOffset, onPanEnd } = options

  const isPanning = ref(false)
  const panStart = ref({ x: 0, y: 0, offsetX: 0, offsetY: 0 })

  // The most recent pointer position, applied on the next animation frame.
  //
  // A pointer device reports moves faster than the screen refreshes - a
  // 1000Hz mouse or a pen can fire several times per frame - and each
  // setOffset invalidates viewport culling and edge routing for the whole
  // graph. Writing every event meant redoing that work several times to
  // produce one painted frame, which is what made panning a large graph
  // lag. Zoom already coalesces through requestAnimationFrame in
  // useCanvasZoom; this is the same treatment for pan.
  let pendingPan: { dx: number; dy: number } | null = null
  let panRafId: number | null = null

  function applyPendingPan() {
    panRafId = null
    if (!pendingPan) return
    const { dx, dy } = pendingPan
    pendingPan = null
    setOffset(panStart.value.offsetX + dx, panStart.value.offsetY + dy)
  }

  /** Apply any coalesced move immediately and drop the scheduled frame. */
  function flushPendingPan() {
    if (panRafId !== null) {
      cancelAnimationFrame(panRafId)
      panRafId = null
    }
    applyPendingPan()
  }

  function startPan(e: PointerEvent) {
    const offset = getOffset()
    panStart.value = {
      x: e.clientX,
      y: e.clientY,
      offsetX: offset.x,
      offsetY: offset.y,
    }
    document.addEventListener('pointermove', onPanMove)
    document.addEventListener('pointerup', stopPan)
    // Touch and pen gestures are often torn down with pointercancel rather
    // than pointerup - the browser reclaiming the gesture, the pen leaving
    // the digitiser, a palm landing. Listening only for pointerup left the
    // pan running with no pointer behind it, so the canvas kept following
    // stale coordinates.
    document.addEventListener('pointercancel', stopPan)
  }

  function onPanMove(e: PointerEvent) {
    // Only set panning true after pointer actually moves (allows double-click to work)
    const dx = e.clientX - panStart.value.x
    const dy = e.clientY - panStart.value.y
    if (!isPanning.value && (Math.abs(dx) > 3 || Math.abs(dy) > 3)) {
      isPanning.value = true
    }
    if (!isPanning.value) return

    // Offsets are absolute against the press, so a later event simply
    // replaces an earlier one: no movement is lost by coalescing.
    pendingPan = { dx, dy }
    if (panRafId === null) {
      panRafId = requestAnimationFrame(applyPendingPan)
    }
  }

  function stopPan() {
    // Land on the true final position. Without this the canvas could settle a
    // frame behind the pointer, leaving the view slightly off from where the
    // gesture ended - and that stale offset is what gets persisted.
    flushPendingPan()
    if (isPanning.value) {
      onPanEnd?.()
    }
    isPanning.value = false
    document.removeEventListener('pointermove', onPanMove)
    document.removeEventListener('pointerup', stopPan)
    document.removeEventListener('pointercancel', stopPan)
  }

  return {
    isPanning,
    panStart,
    startPan,
    onPanMove,
    stopPan,
  }
}
