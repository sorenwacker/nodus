/**
 * The layout animator reports when it is moving nodes, so edges can route
 * cheaply meanwhile (PRODUCT_DESIGN.md > Routing while a layout moves the nodes).
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { createLayoutAnimator, animateToPositions } from '../canvas/composables/layout/useLayoutAnimation'

afterEach(() => vi.useRealTimers())

describe('the layout animator', () => {
  it('is running during an animation and not after it', async () => {
    vi.useFakeTimers()
    const state = createLayoutAnimator()
    const pos = { x: 0, y: 0 }
    animateToPositions(new Map([['a', { x: 100, y: 0 }]]), () => pos, frame => Object.assign(pos, frame.get('a')), state, 100)
    expect(state.running.value).toBe(true)
    await vi.advanceTimersByTimeAsync(300)
    expect(state.running.value).toBe(false)
    expect(pos.x).toBe(100)
  })

  it('applies each frame as one batch of every moving node', async () => {
    // PRODUCT_DESIGN.md > Persisting animated positions
    vi.useFakeTimers()
    const state = createLayoutAnimator()
    const targets = new Map(Array.from({ length: 50 }, (_, i) => [`n${i}`, { x: 100, y: 0 }] as const))
    const applyFrame = vi.fn()
    animateToPositions(targets, () => ({ x: 0, y: 0 }), applyFrame, state, 100)
    await vi.advanceTimersByTimeAsync(300)
    expect(applyFrame.mock.calls.length).toBeGreaterThan(0)
    for (const [frame] of applyFrame.mock.calls) expect(frame.size).toBe(50)
  })

  it('applies the targets as one batch when settled', () => {
    const state = createLayoutAnimator()
    const applyFrame = vi.fn()
    const targets = new Map([['a', { x: 100, y: 0 }], ['b', { x: 5, y: 5 }]])
    animateToPositions(targets, () => ({ x: 0, y: 0 }), applyFrame, state, 1000)
    state.settle()
    expect(applyFrame).toHaveBeenCalledTimes(1)
    expect(applyFrame).toHaveBeenCalledWith(targets)
  })

  it('is not running once settled', () => {
    const state = createLayoutAnimator()
    animateToPositions(new Map([['a', { x: 100, y: 0 }]]), () => ({ x: 0, y: 0 }), () => {}, state, 1000)
    state.settle()
    expect(state.running.value).toBe(false)
  })
})
