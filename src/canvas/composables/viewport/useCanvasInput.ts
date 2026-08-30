/**
 * Canvas viewport input composable
 *
 * Groups the two gestures that move the viewport: one-contact drag to pan and
 * two-contact pinch to zoom. They are composed here rather than side by side
 * in GraphCanvas because they write the same offset and have to agree on who
 * owns it - a second finger landing mid-drag has to end the pan, or both act
 * on the offset in the same frame and the canvas jitters between them.
 */

import type { Ref } from 'vue'
import { useCanvasPan } from './useCanvasPan'
import { useCanvasPinch } from './useCanvasPinch'

export interface UseCanvasInputContext {
  canvasRef: Ref<HTMLElement | null>
  scale: Ref<number>
  offsetX: Ref<number>
  offsetY: Ref<number>
  startZooming: () => void
  scheduleSaveViewState: () => void
  onPanEnd?: () => void
}

export function useCanvasInput(ctx: UseCanvasInputContext) {
  const { canvasRef, scale, offsetX, offsetY, startZooming, scheduleSaveViewState, onPanEnd } = ctx

  const pan = useCanvasPan({
    getOffset: () => ({ x: offsetX.value, y: offsetY.value }),
    setOffset: (x, y) => {
      offsetX.value = x
      offsetY.value = y
    },
    onPanEnd,
  })

  const pinch = useCanvasPinch({
    canvasRef,
    scale,
    offsetX,
    offsetY,
    startZooming,
    scheduleSaveViewState,
    onPinchStart: () => pan.stopPan(),
  })

  /**
   * Offer a press to the gesture handlers before anything else reads it.
   *
   * Returns true when a pinch now owns the viewport, which is the caller's
   * signal to do nothing further with this event. Touch and pen contacts are
   * tracked wherever they land, including on a node or a frame, because the
   * second finger of a pinch frequently comes down on one.
   */
  function beginContact(e: PointerEvent): boolean {
    pinch.onPointerDown(e)
    return pinch.isPinching.value
  }

  return {
    isPanning: pan.isPanning,
    isPinching: pinch.isPinching,
    startPan: pan.startPan,
    stopPan: pan.stopPan,
    beginContact,
  }
}
