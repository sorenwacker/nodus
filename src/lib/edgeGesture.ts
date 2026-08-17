/**
 * Edge-step navigation: pushing the pointer against a screen edge fires one
 * step per push. Holding the pointer at the edge fires nothing further; the
 * edge re-arms when the pointer leaves its band.
 *
 * The right edge steps deeper (graph -> storyline overview -> reader), the
 * left edge steps back, the bottom edge opens the timelines sheet and the top
 * edge closes it; the caller decides what each step does.
 */
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

  function onPointerX(x: number, windowWidth: number): void {
    if (x >= windowWidth - rightThreshold()) {
      if (rightArmed) {
        rightArmed = false
        stepRight()
      }
    } else {
      rightArmed = true
    }

    if (x <= leftThreshold()) {
      if (leftArmed) {
        leftArmed = false
        stepLeft()
      }
    } else {
      leftArmed = true
    }
  }

  function onPointer(x: number, y: number, windowWidth: number, windowHeight: number): void {
    onPointerX(x, windowWidth)

    if (stepTop) {
      const topBand = topThreshold()
      if (topBand > 0 && y <= topBand) {
        if (topArmed) {
          topArmed = false
          stepTop()
        }
      } else {
        topArmed = true
      }
    }

    if (!stepBottom) return
    if (y >= windowHeight - bottomThreshold()) {
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

  // An upward mouse motion usually exits the window (into the title bar)
  // before any pointermove lands inside the narrow top band, so a window
  // leave through this taller region also counts as a top push
  const TOP_LEAVE_BAND = 80

  function onPointerLeave(y: number): void {
    if (!stepTop) return
    if (topThreshold() <= 0) return
    if (y <= TOP_LEAVE_BAND && topArmed) {
      topArmed = false
      stepTop()
    }
  }

  return { onPointerX, onPointer, onPointerLeave }
}
