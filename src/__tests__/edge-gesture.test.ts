import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createEdgeStepper, edgeHandleRange } from '../lib/edgeGesture'

const WIDTH = 1000
const HEIGHT = 1000
// Centre of the window: inside every edge handle
const MID = 500

function makeStepper() {
  const stepRight = vi.fn()
  const stepLeft = vi.fn()
  const stepper = createEdgeStepper({ threshold: 12, stepRight, stepLeft })
  return { stepper, stepRight, stepLeft }
}

describe('createEdgeStepper', () => {
  it('fires one right step per push against the right edge', () => {
    const { stepper, stepRight } = makeStepper()
    stepper.onPointer(995, MID, WIDTH, HEIGHT)
    stepper.onPointer(998, MID, WIDTH, HEIGHT) // still at the edge: no second fire
    stepper.onPointer(999, MID, WIDTH, HEIGHT)
    expect(stepRight).toHaveBeenCalledTimes(1)
  })

  it('fires again after pulling away and pushing again', () => {
    const { stepper, stepRight } = makeStepper()
    stepper.onPointer(995, MID, WIDTH, HEIGHT)
    stepper.onPointer(600, MID, WIDTH, HEIGHT) // pull away re-arms
    stepper.onPointer(996, MID, WIDTH, HEIGHT)
    expect(stepRight).toHaveBeenCalledTimes(2)
  })

  it('fires one left step per push against the left edge', () => {
    const { stepper, stepLeft } = makeStepper()
    stepper.onPointer(5, MID, WIDTH, HEIGHT)
    stepper.onPointer(2, MID, WIDTH, HEIGHT)
    expect(stepLeft).toHaveBeenCalledTimes(1)
    stepper.onPointer(400, MID, WIDTH, HEIGHT)
    stepper.onPointer(0, MID, WIDTH, HEIGHT)
    expect(stepLeft).toHaveBeenCalledTimes(2)
  })

  it('keeps the two edges independent', () => {
    const { stepper, stepRight, stepLeft } = makeStepper()
    stepper.onPointer(999, MID, WIDTH, HEIGHT)
    stepper.onPointer(3, MID, WIDTH, HEIGHT)
    stepper.onPointer(999, MID, WIDTH, HEIGHT)
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

    stepper.onPointer(990, MID, WIDTH, HEIGHT) // inside the 12px band
    expect(stepRight).toHaveBeenCalledTimes(1)

    band = 3 // band narrows once a layer is open
    stepper.onPointer(500, MID, WIDTH, HEIGHT) // re-arm
    stepper.onPointer(990, MID, WIDTH, HEIGHT) // 10px from edge: outside the narrow band
    expect(stepRight).toHaveBeenCalledTimes(1)
    stepper.onPointer(998, MID, WIDTH, HEIGHT) // pressed against the edge
    expect(stepRight).toHaveBeenCalledTimes(2)
  })

  it('fires the right step when the pointer leaves through the right region', () => {
    // A fast flick can jump past the narrow edge band without a pointermove
    // landing inside it; the window leave is the only evidence left
    const { stepper, stepRight } = makeStepper()
    stepper.onPointerLeave(WIDTH - 6, 400, WIDTH, 1000)
    expect(stepRight).toHaveBeenCalledTimes(1)
  })

  it('fires the left step when the pointer leaves through the left region', () => {
    const { stepper, stepLeft } = makeStepper()
    stepper.onPointerLeave(4, 400, WIDTH, 1000)
    expect(stepLeft).toHaveBeenCalledTimes(1)
  })

  it('does not double-fire when an in-band push precedes the leave', () => {
    const { stepper, stepRight } = makeStepper()
    stepper.onPointer(WIDTH - 5, MID, WIDTH, HEIGHT) // in-band push fires
    stepper.onPointerLeave(WIDTH - 1, 400, WIDTH, 1000) // then exits
    expect(stepRight).toHaveBeenCalledTimes(1)
  })

  it('re-arms the side edges after the pointer comes back inside', () => {
    const { stepper, stepRight } = makeStepper()
    stepper.onPointerLeave(WIDTH - 3, 400, WIDTH, 1000)
    stepper.onPointer(600, MID, WIDTH, HEIGHT) // back inside re-arms
    stepper.onPointerLeave(WIDTH - 3, 400, WIDTH, 1000)
    expect(stepRight).toHaveBeenCalledTimes(2)
  })

  it('ignores a leave through the middle of an edgeless region', () => {
    const { stepper, stepRight, stepLeft } = makeStepper()
    stepper.onPointerLeave(WIDTH / 2, 900, WIDTH, 1000)
    expect(stepRight).not.toHaveBeenCalled()
    expect(stepLeft).not.toHaveBeenCalled()
  })

  it('does not fire in the middle of the window', () => {
    const { stepper, stepRight, stepLeft } = makeStepper()
    stepper.onPointer(500, MID, WIDTH, HEIGHT)
    stepper.onPointer(13, MID, WIDTH, HEIGHT)
    stepper.onPointer(987, MID, WIDTH, HEIGHT)
    expect(stepRight).not.toHaveBeenCalled()
    expect(stepLeft).not.toHaveBeenCalled()
  })
})

describe('edge handles', () => {
  // An edge live along its whole length fires during ordinary mouse travel: in
  // a windowed app the pointer crosses a border constantly
  // (PRODUCT_DESIGN.md > Edge handles)
  function handleStepper() {
    const stepRight = vi.fn()
    const stepLeft = vi.fn()
    const stepper = createEdgeStepper({ threshold: 12, stepRight, stepLeft })
    return { stepper, stepRight, stepLeft }
  }

  it('centres the handle on its edge', () => {
    const range = edgeHandleRange(HEIGHT)
    expect((range.start + range.end) / 2).toBe(HEIGHT / 2)
    expect(range.end - range.start).toBe(range.size)
  })

  it('keeps the handle aimable on a small window and partial on a large one', () => {
    expect(edgeHandleRange(300).size).toBeLessThanOrEqual(300)
    expect(edgeHandleRange(4000).size).toBeLessThan(4000 * 0.5)
    expect(edgeHandleRange(4000).size).toBe(edgeHandleRange(3000).size)
  })

  it('ignores a side push above or below the handle', () => {
    const { stepper, stepRight, stepLeft } = handleStepper()
    const above = edgeHandleRange(HEIGHT).start - 20
    const below = edgeHandleRange(HEIGHT).end + 20

    stepper.onPointer(999, above, WIDTH, HEIGHT)
    stepper.onPointer(1, above, WIDTH, HEIGHT)
    stepper.onPointer(999, below, WIDTH, HEIGHT)

    expect(stepRight).not.toHaveBeenCalled()
    expect(stepLeft).not.toHaveBeenCalled()
  })

  it('still fires a side push inside the handle', () => {
    const { stepper, stepRight } = handleStepper()
    stepper.onPointer(999, MID, WIDTH, HEIGHT)
    expect(stepRight).toHaveBeenCalledTimes(1)
  })

  it('does not treat a window exit outside the handle as a push', () => {
    // Reaching for another window drags the pointer out through a border; only
    // an exit through the handle was aimed at the gesture
    const { stepper, stepRight } = handleStepper()
    stepper.onPointerLeave(999, edgeHandleRange(HEIGHT).end + 40, WIDTH, HEIGHT)
    expect(stepRight).not.toHaveBeenCalled()

    stepper.onPointerLeave(999, MID, WIDTH, HEIGHT)
    expect(stepRight).toHaveBeenCalledTimes(1)
  })
})

describe('handle drawing', () => {
  it('draws the handles from the same geometry the gesture listens on', () => {
    // A handle drawn anywhere else is worse than no handle at all
    const component = readFileSync(resolve(__dirname, '../components/EdgeHandles.vue'), 'utf-8')
    expect(component).toContain('edgeHandleRange')

    const app = readFileSync(resolve(__dirname, '../App.vue'), 'utf-8')
    expect(app).toContain('EdgeHandles')
  })
})
