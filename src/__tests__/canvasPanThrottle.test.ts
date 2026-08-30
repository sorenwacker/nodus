/**
 * Canvas pan throttling tests
 *
 * Pointer devices report moves faster than the screen refreshes, and every
 * offset write invalidates viewport culling and edge routing for the whole
 * graph. Panning wrote on each pointermove, so a single painted frame could
 * cost several full recomputes. Zoom already coalesces through
 * requestAnimationFrame; pan now does the same.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useCanvasPan } from '../canvas/composables/viewport/useCanvasPan'

/** Queued animation frames, run by hand so the test controls the clock. */
let frames: Array<{ id: number; cb: FrameRequestCallback }>
let nextFrameId: number

function runFrame() {
  const due = frames
  frames = []
  for (const f of due) f.cb(performance.now())
}

function move(x: number, y: number) {
  document.dispatchEvent(new PointerEvent('pointermove', { clientX: x, clientY: y }))
}

function setup() {
  const setOffset = vi.fn()
  const onPanEnd = vi.fn()
  const pan = useCanvasPan({
    getOffset: () => ({ x: 1000, y: 500 }),
    setOffset,
    onPanEnd,
  })
  pan.startPan(new PointerEvent('pointerdown', { clientX: 200, clientY: 200 }))
  return { pan, setOffset, onPanEnd }
}

describe('canvas pan throttling', () => {
  beforeEach(() => {
    frames = []
    nextFrameId = 1
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      const id = nextFrameId++
      frames.push({ id, cb })
      return id
    })
    vi.stubGlobal('cancelAnimationFrame', (id: number) => {
      frames = frames.filter(f => f.id !== id)
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('does not write an offset before the frame runs', () => {
    const { setOffset } = setup()
    move(300, 260)

    expect(setOffset).not.toHaveBeenCalled()
  })

  it('writes once per frame no matter how many moves arrived', () => {
    const { setOffset } = setup()
    // Six events inside one frame - a plausible burst from a high-polling
    // mouse or a pen
    move(210, 200)
    move(230, 210)
    move(250, 220)
    move(270, 230)
    move(290, 240)
    move(300, 260)
    runFrame()

    expect(setOffset).toHaveBeenCalledTimes(1)
    // The latest position wins: offset origin 1000,500 plus delta 100,60
    expect(setOffset).toHaveBeenCalledWith(1100, 560)
  })

  it('keeps writing across successive frames', () => {
    const { setOffset } = setup()
    move(300, 200)
    runFrame()
    move(400, 200)
    runFrame()

    expect(setOffset).toHaveBeenCalledTimes(2)
    expect(setOffset).toHaveBeenLastCalledWith(1200, 500)
  })

  it('still ignores movement inside the click threshold', () => {
    const { setOffset } = setup()
    move(202, 201)
    runFrame()

    // Below 3px this is a click, not a pan - double-click must survive
    expect(setOffset).not.toHaveBeenCalled()
  })

  describe('release', () => {
    it('flushes the pending frame so the view lands where the gesture ended', () => {
      const { setOffset } = setup()
      move(300, 200)
      // Release before the scheduled frame ever runs
      document.dispatchEvent(new PointerEvent('pointerup'))

      expect(setOffset).toHaveBeenCalledTimes(1)
      expect(setOffset).toHaveBeenCalledWith(1100, 500)
    })

    it('does not write again when the cancelled frame would have fired', () => {
      const { setOffset } = setup()
      move(300, 200)
      document.dispatchEvent(new PointerEvent('pointerup'))
      runFrame()

      // The scheduled frame was cancelled on release, not left to double-apply
      expect(setOffset).toHaveBeenCalledTimes(1)
    })

    it('reports the pan ended', () => {
      const { onPanEnd } = setup()
      move(300, 200)
      document.dispatchEvent(new PointerEvent('pointerup'))

      expect(onPanEnd).toHaveBeenCalledTimes(1)
    })

    it('does not report a pan that never cleared the threshold', () => {
      const { onPanEnd } = setup()
      move(201, 200)
      document.dispatchEvent(new PointerEvent('pointerup'))

      expect(onPanEnd).not.toHaveBeenCalled()
    })

    it('stops responding to moves after release', () => {
      const { setOffset } = setup()
      document.dispatchEvent(new PointerEvent('pointerup'))
      move(500, 500)
      runFrame()

      expect(setOffset).not.toHaveBeenCalled()
    })
  })
})
