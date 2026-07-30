/**
 * Edge-step navigation: pushing the pointer against a screen edge fires one
 * step per push. Holding the pointer at the edge fires nothing further; the
 * edge re-arms when the pointer leaves its band.
 *
 * The right edge steps deeper (graph -> storyline overview -> reader), the
 * left edge steps back; the caller decides what each step does.
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
  /** Dwell time in ms the pointer must stay at the bottom edge before it fires */
  bottomDwellMs?: number
  stepRight: () => void
  stepLeft: () => void
  /** Optional bottom-edge push (e.g. opening the timelines sheet) */
  stepBottom?: () => void
}

export function createEdgeStepper(options: EdgeStepperOptions) {
  const { threshold, stepRight, stepLeft, stepBottom, bottomDwellMs = 0 } = options
  const rightThreshold = options.rightThreshold ?? (() => threshold)
  const leftThreshold = options.leftThreshold ?? (() => threshold)
  const bottomThreshold = options.bottomThreshold ?? (() => threshold)
  let rightArmed = true
  let leftArmed = true
  let bottomArmed = true
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

  return { onPointerX, onPointer }
}
