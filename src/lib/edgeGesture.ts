/**
 * Edge-step navigation: pushing the pointer against a screen edge fires one
 * step per push. Holding the pointer at the edge fires nothing further; the
 * edge re-arms when the pointer leaves its band.
 *
 * The right edge steps deeper (graph -> storyline overview -> reader) and the
 * left edge steps back; the caller decides what each step does.
 *
 * Only these two edges exist. The bottom edge used to raise the timelines
 * sheet after a dwell and the top edge closed it, but a dwell fires from
 * ordinary pointer travel - panning the canvas towards the bottom of the
 * window rested the pointer in the band and the sheet unfolded on its own.
 * That moved to a toolbar button (PRODUCT_DESIGN.md > Edge handles).
 *
 * Each edge listens only over a handle centred on it, not along its full
 * length: in a window that does not fill the screen the pointer crosses a
 * border constantly, and an edge live end to end fires on ordinary travel
 * (PRODUCT_DESIGN.md > Edge handles).
 */

/** Share of an edge the handle spans, before the bounds below are applied */
const HANDLE_RATIO = 0.3
/** Small enough to aim at, large enough to hit on a small window */
const HANDLE_MIN = 120
const HANDLE_MAX = 320

/**
 * Where an edge listens, along an edge of the given length. The single
 * definition of the handle: the gesture and the drawn marker both read it, so a
 * handle can never be drawn where the gesture is not listening.
 */
export function edgeHandleRange(length: number): { start: number; end: number; size: number } {
  const size = Math.min(Math.max(length * HANDLE_RATIO, HANDLE_MIN), HANDLE_MAX, length)
  const start = (length - size) / 2
  return { start, end: start + size, size }
}

function withinHandle(position: number, length: number): boolean {
  const { start, end } = edgeHandleRange(length)
  return position >= start && position <= end
}
export interface EdgeStepperOptions {
  /** Edge band width in px */
  threshold: number
  /**
   * Dynamic band for the right edge, evaluated per event. Lets callers narrow
   * the band while a panel occupies the edge, so working inside it does not
   * accidentally step deeper.
   */
  rightThreshold?: () => number
  /** Dynamic band for the left edge; same purpose as rightThreshold */
  leftThreshold?: () => number
  stepRight: () => void
  stepLeft: () => void
}

export function createEdgeStepper(options: EdgeStepperOptions) {
  const { threshold, stepRight, stepLeft } = options
  const rightThreshold = options.rightThreshold ?? (() => threshold)
  const leftThreshold = options.leftThreshold ?? (() => threshold)
  let rightArmed = true
  let leftArmed = true

  function onPointer(x: number, y: number, windowWidth: number, windowHeight: number): void {
    // Outside the handle the edge is inert, but the arming state still has to
    // follow the pointer: otherwise leaving through a dead stretch would leave
    // the edge disarmed for the next real push
    const aimed = withinHandle(y, windowHeight)

    if (aimed && x >= windowWidth - rightThreshold()) {
      if (rightArmed) {
        rightArmed = false
        stepRight()
      }
    } else {
      rightArmed = true
    }

    if (aimed && x <= leftThreshold()) {
      if (leftArmed) {
        leftArmed = false
        stepLeft()
      }
    } else {
      leftArmed = true
    }
  }

  // A fast motion exits the window before any pointermove lands inside the
  // narrow edge band, so a window leave through these wider regions counts as
  // a push on the edge it left through. Without this, a quick flick at the
  // edge does nothing and the gesture feels unreliable.
  const SIDE_LEAVE_BAND = 40

  /** The pointer left the window at (x, y). */
  function onPointerLeave(x: number, y: number, windowWidth: number, windowHeight: number): void {
    // Reaching for another window drags the pointer out through a border; only
    // an exit through a handle was aimed at the gesture
    if (x >= windowWidth - SIDE_LEAVE_BAND || x <= SIDE_LEAVE_BAND) {
      if (!withinHandle(y, windowHeight)) return
    } else if (!withinHandle(x, windowWidth)) {
      return
    }

    if (x >= windowWidth - SIDE_LEAVE_BAND) {
      if (rightArmed) {
        rightArmed = false
        stepRight()
      }
      return
    }

    if (x <= SIDE_LEAVE_BAND) {
      if (leftArmed) {
        leftArmed = false
        stepLeft()
      }
    }
  }

  return { onPointer, onPointerLeave }
}
