/**
 * Edge-step navigation: pushing the pointer against a screen edge fires one
 * step per push. Holding the pointer at the edge fires nothing further; the
 * edge re-arms when the pointer leaves its band.
 *
 * The right edge steps deeper (graph -> storyline overview -> reader), the
 * left edge steps back, the bottom edge opens the timelines sheet and the top
 * edge closes it; the caller decides what each step does.
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
  /** Dynamic band for the bottom edge; same purpose as rightThreshold */
  bottomThreshold?: () => number
  /** Dynamic band for the top edge; returning 0 disables the edge */
  topThreshold?: () => number
  /** Dwell time in ms the pointer must stay at the bottom edge before it fires */
  bottomDwellMs?: number
  stepRight: () => void
  stepLeft: () => void
  /** Optional bottom-edge push (e.g. opening the timelines sheet) */
  stepBottom?: () => void
  /** Optional top-edge push (e.g. closing the timelines sheet) */
  stepTop?: () => void
}

export function createEdgeStepper(options: EdgeStepperOptions) {
  const { threshold, stepRight, stepLeft, stepBottom, stepTop, bottomDwellMs = 0 } = options
  const rightThreshold = options.rightThreshold ?? (() => threshold)
  const leftThreshold = options.leftThreshold ?? (() => threshold)
  const bottomThreshold = options.bottomThreshold ?? (() => threshold)
  const topThreshold = options.topThreshold ?? (() => threshold)
  let rightArmed = true
  let leftArmed = true
  let bottomArmed = true
  let topArmed = true
  let bottomTimer: ReturnType<typeof setTimeout> | null = null

  function onPointerX(x: number, y: number, windowWidth: number, windowHeight: number): void {
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

  function onPointer(x: number, y: number, windowWidth: number, windowHeight: number): void {
    onPointerX(x, y, windowWidth, windowHeight)

    const aimedVertically = withinHandle(x, windowWidth)

    if (stepTop) {
      const topBand = topThreshold()
      if (aimedVertically && topBand > 0 && y <= topBand) {
        if (topArmed) {
          topArmed = false
          stepTop()
        }
      } else {
        topArmed = true
      }
    }

    if (!stepBottom) return
    if (aimedVertically && y >= windowHeight - bottomThreshold()) {
      if (!bottomArmed) return
      if (bottomDwellMs <= 0) {
        bottomArmed = false
        stepBottom()
      } else if (bottomTimer === null) {
        // The pointer must dwell at the edge; leaving cancels the push
        bottomTimer = setTimeout(() => {
          bottomTimer = null
          bottomArmed = false
          stepBottom()
        }, bottomDwellMs)
      }
    } else {
      if (bottomTimer !== null) {
        clearTimeout(bottomTimer)
        bottomTimer = null
      }
      bottomArmed = true
    }
  }

  // A fast motion exits the window before any pointermove lands inside the
  // narrow edge band, so a window leave through these wider regions counts as
  // a push on the edge it left through. Without this, a quick flick at the
  // edge does nothing and the gesture feels unreliable.
  const TOP_LEAVE_BAND = 80
  const SIDE_LEAVE_BAND = 40

  /**
   * The pointer left the window at (x, y). Horizontal exits win over vertical
   * ones: leaving through a corner is a side push, which is the deliberate
   * gesture, while the top band exists only to catch the title-bar exit.
   */
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
      return
    }

    if (!stepTop) return
    if (topThreshold() <= 0) return
    if (y <= TOP_LEAVE_BAND && topArmed) {
      topArmed = false
      stepTop()
    }
  }

  return { onPointer, onPointerLeave }
}
