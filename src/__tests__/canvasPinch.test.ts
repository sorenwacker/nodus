/**
 * Canvas pinch tests
 *
 * Zoom used to arrive only through wheel events. A trackpad pinch reaches the
 * page as ctrl+wheel so it worked there, but a touchscreen emits no wheel
 * events, which left the canvas with no way to zoom on a tablet.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ref } from 'vue'
import { useCanvasPinch } from '../canvas/composables/viewport/useCanvasPinch'

let frames: Array<{ id: number; cb: FrameRequestCallback }>
let nextId: number

function runFrame() {
  const due = frames
  frames = []
  for (const f of due) f.cb(performance.now())
}

function setup() {
  const scale = ref(1)
  const offsetX = ref(0)
  const offsetY = ref(0)
  const onPinchStart = vi.fn()
  const scheduleSaveViewState = vi.fn()

  // A canvas filling the window, so client coords map straight to local ones
  const canvasRef = ref({
    getBoundingClientRect: () => ({ left: 0, top: 0 }) as DOMRect,
  } as unknown as HTMLElement)

  const pinch = useCanvasPinch({
    canvasRef,
    scale,
    offsetX,
    offsetY,
    startZooming: vi.fn(),
    scheduleSaveViewState,
    onPinchStart,
  })

  return { pinch, scale, offsetX, offsetY, onPinchStart, scheduleSaveViewState }
}

function down(id: number, x: number, y: number, pointerType = 'touch') {
  return new PointerEvent('pointerdown', { pointerId: id, clientX: x, clientY: y, pointerType })
}

function move(id: number, x: number, y: number, pointerType = 'touch') {
  document.dispatchEvent(
    new PointerEvent('pointermove', { pointerId: id, clientX: x, clientY: y, pointerType })
  )
}

function up(id: number, type = 'pointerup') {
  document.dispatchEvent(new PointerEvent(type, { pointerId: id }))
}

describe('canvas pinch', () => {
  beforeEach(() => {
    frames = []
    nextId = 1
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      const id = nextId++
      frames.push({ id, cb })
      return id
    })
    vi.stubGlobal('cancelAnimationFrame', (id: number) => {
      frames = frames.filter(f => f.id !== id)
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    // Leave no document listeners behind between tests
    up(1)
    up(2)
  })

  it('ignores a mouse, which already has the wheel path', () => {
    const { pinch, onPinchStart } = setup()
    pinch.onPointerDown(down(1, 100, 100, 'mouse'))
    pinch.onPointerDown(down(2, 300, 100, 'mouse'))

    expect(pinch.isPinching.value).toBe(false)
    expect(onPinchStart).not.toHaveBeenCalled()
  })

  it('does not start on a single contact', () => {
    const { pinch } = setup()
    pinch.onPointerDown(down(1, 100, 100))

    expect(pinch.isPinching.value).toBe(false)
  })

  it('starts on the second contact and cancels any pan in progress', () => {
    const { pinch, onPinchStart } = setup()
    pinch.onPointerDown(down(1, 100, 100))
    pinch.onPointerDown(down(2, 300, 100))

    expect(pinch.isPinching.value).toBe(true)
    expect(onPinchStart).toHaveBeenCalledTimes(1)
  })

  it('zooms in as the fingers separate', () => {
    const { pinch, scale } = setup()
    pinch.onPointerDown(down(1, 100, 100))
    pinch.onPointerDown(down(2, 300, 100))
    // 200px apart -> 400px apart, same midpoint
    move(1, 0, 100)
    move(2, 400, 100)
    runFrame()

    expect(scale.value).toBeCloseTo(2, 5)
  })

  it('zooms out as the fingers close', () => {
    const { pinch, scale } = setup()
    pinch.onPointerDown(down(1, 100, 100))
    pinch.onPointerDown(down(2, 300, 100))
    move(1, 150, 100)
    move(2, 250, 100)
    runFrame()

    expect(scale.value).toBeCloseTo(0.5, 5)
  })

  it('keeps the point under the midpoint fixed while zooming', () => {
    const { pinch, scale, offsetX, offsetY } = setup()
    pinch.onPointerDown(down(1, 100, 100))
    pinch.onPointerDown(down(2, 300, 100))
    // Midpoint is (200,100); at scale 1 offset 0 that is canvas point (200,100)
    move(1, 0, 100)
    move(2, 400, 100)
    runFrame()

    // That canvas point must still sit under the midpoint after zooming
    const screenX = 200 * scale.value + offsetX.value
    const screenY = 100 * scale.value + offsetY.value
    expect(screenX).toBeCloseTo(200, 5)
    expect(screenY).toBeCloseTo(100, 5)
  })

  it('pans when both fingers move together without changing separation', () => {
    const { pinch, scale, offsetX, offsetY } = setup()
    pinch.onPointerDown(down(1, 100, 100))
    pinch.onPointerDown(down(2, 300, 100))
    // Same 200px gap, midpoint shifted right 50 and down 30
    move(1, 150, 130)
    move(2, 350, 130)
    runFrame()

    expect(scale.value).toBeCloseTo(1, 5)
    expect(offsetX.value).toBeCloseTo(50, 5)
    expect(offsetY.value).toBeCloseTo(30, 5)
  })

  it('coalesces several moves into one frame', () => {
    const { pinch, scale } = setup()
    pinch.onPointerDown(down(1, 100, 100))
    pinch.onPointerDown(down(2, 300, 100))
    move(1, 50, 100)
    move(2, 350, 100)
    move(1, 0, 100)
    move(2, 400, 100)
    runFrame()

    // Only the last pair should count
    expect(scale.value).toBeCloseTo(2, 5)
  })

  it('clamps to the same limits as the wheel path', () => {
    const { pinch, scale } = setup()
    pinch.onPointerDown(down(1, 199, 100))
    pinch.onPointerDown(down(2, 201, 100))
    // 2px apart -> 2000px apart would be 1000x without a clamp
    move(1, -800, 100)
    move(2, 1200, 100)
    runFrame()

    expect(scale.value).toBe(3)
  })

  it('ends when a finger lifts, and saves the view state', () => {
    const { pinch, scheduleSaveViewState } = setup()
    pinch.onPointerDown(down(1, 100, 100))
    pinch.onPointerDown(down(2, 300, 100))
    up(1)

    expect(pinch.isPinching.value).toBe(false)
    expect(scheduleSaveViewState).toHaveBeenCalledTimes(1)
  })

  it('ends on pointercancel, which is how touch gestures usually die', () => {
    const { pinch } = setup()
    pinch.onPointerDown(down(1, 100, 100))
    pinch.onPointerDown(down(2, 300, 100))
    up(1, 'pointercancel')

    expect(pinch.isPinching.value).toBe(false)
  })

  it('stops responding once the gesture has ended', () => {
    const { pinch, scale } = setup()
    pinch.onPointerDown(down(1, 100, 100))
    pinch.onPointerDown(down(2, 300, 100))
    up(1)
    up(2)
    const settled = scale.value
    move(1, 0, 100)
    move(2, 400, 100)
    runFrame()

    expect(scale.value).toBe(settled)
  })
})
