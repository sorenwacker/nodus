/**
 * Window-edge navigation: turns pointer events into edge steps.
 *
 * The gesture is live only while the window is in full screen. A window edge
 * that is not a screen edge is crossed during ordinary work - reaching for
 * another application, another window, the desktop - and aiming at a handle
 * does not make such a crossing deliberate. Windowed, the panels open from
 * their toolbar buttons (PRODUCT_DESIGN.md > Edge handles).
 *
 * The steps themselves belong to the caller: this composable owns when a push
 * counts, not what it opens.
 */
import { createEdgeStepper } from '../lib/edgeGesture'
import { isEdgeGesturePointer } from './edgeGesturePointer'
import { useWindowFullscreen } from './useWindowFullscreen'

export interface EdgeNavigationOptions {
  /** Edge band width in px */
  threshold?: number
  rightThreshold?: () => number
  leftThreshold?: () => number
  stepRight: () => void
  stepLeft: () => void
}

export function useEdgeNavigation(options: EdgeNavigationOptions) {
  const { isFullscreen } = useWindowFullscreen()

  const stepper = createEdgeStepper({
    threshold: options.threshold ?? 12,
    rightThreshold: options.rightThreshold,
    leftThreshold: options.leftThreshold,
    stepRight: options.stepRight,
    stepLeft: options.stepLeft,
    enabled: () => isFullscreen.value,
  })

  function onEdgePointerMove(e: PointerEvent): void {
    if (!isEdgeGesturePointer(e)) return
    stepper.onPointer(e.clientX, e.clientY, window.innerWidth, window.innerHeight)
  }

  // A fast motion exits the window before any pointermove lands in the narrow
  // edge band, so a leave counts as a push on the edge it left through
  function onEdgePointerOut(e: PointerEvent): void {
    if (!isEdgeGesturePointer(e)) return
    if (e.relatedTarget === null) {
      stepper.onPointerLeave(e.clientX, e.clientY, window.innerWidth, window.innerHeight)
    }
  }

  return { isFullscreen, onEdgePointerMove, onEdgePointerOut }
}
