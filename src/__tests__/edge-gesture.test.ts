import { describe, it, expect, vi } from 'vitest'
import { createEdgeStepper } from '../lib/edgeGesture'

const WIDTH = 1000

function makeStepper() {
  const stepRight = vi.fn()
  const stepLeft = vi.fn()
  const stepper = createEdgeStepper({ threshold: 12, stepRight, stepLeft })
  return { stepper, stepRight, stepLeft }
}

describe('createEdgeStepper', () => {
  it('fires one right step per push against the right edge', () => {
    const { stepper, stepRight } = makeStepper()
    stepper.onPointerX(995, WIDTH)
    stepper.onPointerX(998, WIDTH) // still at the edge: no second fire
    stepper.onPointerX(999, WIDTH)
    expect(stepRight).toHaveBeenCalledTimes(1)
  })

  it('fires again after pulling away and pushing again', () => {
    const { stepper, stepRight } = makeStepper()
    stepper.onPointerX(995, WIDTH)
    stepper.onPointerX(600, WIDTH) // pull away re-arms
    stepper.onPointerX(996, WIDTH)
    expect(stepRight).toHaveBeenCalledTimes(2)
  })

  it('fires one left step per push against the left edge', () => {
    const { stepper, stepLeft } = makeStepper()
    stepper.onPointerX(5, WIDTH)
    stepper.onPointerX(2, WIDTH)
    expect(stepLeft).toHaveBeenCalledTimes(1)
    stepper.onPointerX(400, WIDTH)
    stepper.onPointerX(0, WIDTH)
    expect(stepLeft).toHaveBeenCalledTimes(2)
  })

  it('keeps the two edges independent', () => {
    const { stepper, stepRight, stepLeft } = makeStepper()
    stepper.onPointerX(999, WIDTH)
    stepper.onPointerX(3, WIDTH)
    stepper.onPointerX(999, WIDTH)
    expect(stepRight).toHaveBeenCalledTimes(2)
    expect(stepLeft).toHaveBeenCalledTimes(1)
  })

  it('uses the dynamic right threshold per event', () => {
    let band = 12
    const stepRight = vi.fn()
    const stepper = createEdgeStepper({
      threshold: 12,
      rightThreshold: () => band,
      stepRight,
      stepLeft: vi.fn(),
    })

    stepper.onPointerX(990, WIDTH) // inside the 12px band
    expect(stepRight).toHaveBeenCalledTimes(1)

    band = 3 // band narrows once a layer is open
    stepper.onPointerX(500, WIDTH) // re-arm
    stepper.onPointerX(990, WIDTH) // 10px from edge: outside the narrow band
    expect(stepRight).toHaveBeenCalledTimes(1)
    stepper.onPointerX(998, WIDTH) // pressed against the edge
    expect(stepRight).toHaveBeenCalledTimes(2)
  })

  it('fires one bottom step per push against the bottom edge', () => {
    const stepBottom = vi.fn()
    const stepper = createEdgeStepper({
      threshold: 12,
      stepRight: vi.fn(),
      stepLeft: vi.fn(),
      stepBottom,
    })
    stepper.onPointer(500, 995, WIDTH, 1000)
    stepper.onPointer(500, 999, WIDTH, 1000) // held at the edge: no re-fire
    expect(stepBottom).toHaveBeenCalledTimes(1)
    stepper.onPointer(500, 500, WIDTH, 1000) // pull away re-arms
    stepper.onPointer(500, 996, WIDTH, 1000)
    expect(stepBottom).toHaveBeenCalledTimes(2)
  })

  it('waits out the bottom dwell time and cancels when the pointer leaves', () => {
    vi.useFakeTimers()
    const stepBottom = vi.fn()
    const stepper = createEdgeStepper({
      threshold: 12,
      bottomDwellMs: 1000,
      stepRight: vi.fn(),
      stepLeft: vi.fn(),
      stepBottom,
    })

    // Passing through the edge briefly fires nothing
    stepper.onPointer(500, 995, WIDTH, 1000)
    vi.advanceTimersByTime(400)
    stepper.onPointer(500, 500, WIDTH, 1000)
    vi.advanceTimersByTime(2000)
    expect(stepBottom).not.toHaveBeenCalled()

    // Dwelling the full second fires once
    stepper.onPointer(500, 995, WIDTH, 1000)
    vi.advanceTimersByTime(1000)
    expect(stepBottom).toHaveBeenCalledTimes(1)
    vi.useRealTimers()
  })

  it('fires one top step per push against the top edge', () => {
    const stepTop = vi.fn()
    const stepper = createEdgeStepper({
      threshold: 12,
      stepRight: vi.fn(),
      stepLeft: vi.fn(),
      stepTop,
    })
    stepper.onPointer(500, 5, WIDTH, 1000)
    stepper.onPointer(500, 2, WIDTH, 1000) // held at the edge: no re-fire
    expect(stepTop).toHaveBeenCalledTimes(1)
    stepper.onPointer(500, 500, WIDTH, 1000) // pull away re-arms
    stepper.onPointer(500, 3, WIDTH, 1000)
    expect(stepTop).toHaveBeenCalledTimes(2)
  })

  it('uses the dynamic top threshold per event', () => {
    let band = 0
    const stepTop = vi.fn()
    const stepper = createEdgeStepper({
      threshold: 12,
      topThreshold: () => band,
      stepRight: vi.fn(),
      stepLeft: vi.fn(),
      stepTop,
    })
    stepper.onPointer(500, 5, WIDTH, 1000) // band 0: top edge disabled
    expect(stepTop).not.toHaveBeenCalled()
    band = 12
    stepper.onPointer(500, 5, WIDTH, 1000)
    expect(stepTop).toHaveBeenCalledTimes(1)
  })

  it('does not fire in the middle of the window', () => {
    const { stepper, stepRight, stepLeft } = makeStepper()
    stepper.onPointerX(500, WIDTH)
    stepper.onPointerX(13, WIDTH)
    stepper.onPointerX(987, WIDTH)
    expect(stepRight).not.toHaveBeenCalled()
    expect(stepLeft).not.toHaveBeenCalled()
  })
})
