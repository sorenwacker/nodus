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
  /** Dynamic band for the bottom edge; same purpose as rightThreshold */
  bottomThreshold?: () => number
  stepRight: () => void
  stepLeft: () => void
  /** Optional bottom-edge push (e.g. opening the timelines sheet) */
  stepBottom?: () => void
}

export function createEdgeStepper(options: EdgeStepperOptions) {
  const { threshold, stepRight, stepLeft, stepBottom } = options
  const rightThreshold = options.rightThreshold ?? (() => threshold)
  const bottomThreshold = options.bottomThreshold ?? (() => threshold)
  let rightArmed = true
  let leftArmed = true
  let bottomArmed = true

  function onPointerX(x: number, windowWidth: number): void {
    if (x >= windowWidth - rightThreshold()) {
      if (rightArmed) {
        rightArmed = false
        stepRight()
      }
    } else {
      rightArmed = true
    }

    if (x <= threshold) {
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
      if (bottomArmed) {
        bottomArmed = false
        stepBottom()
      }
    } else {
      bottomArmed = true
    }
  }

  return { onPointerX, onPointer }
}
