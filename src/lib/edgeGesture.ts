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
  stepRight: () => void
  stepLeft: () => void
}

export function createEdgeStepper(options: EdgeStepperOptions) {
  const { threshold, stepRight, stepLeft } = options
  let rightArmed = true
  let leftArmed = true

  function onPointerX(x: number, windowWidth: number): void {
    if (x >= windowWidth - threshold) {
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

  return { onPointerX }
}
