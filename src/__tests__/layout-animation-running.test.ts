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
    animateToPositions(new Map([['a', { x: 100, y: 0 }]]), () => pos, (_id, x, y) => Object.assign(pos, { x, y }), state, 100)
    expect(state.running.value).toBe(true)
    await vi.advanceTimersByTimeAsync(300)
    expect(state.running.value).toBe(false)
    expect(pos.x).toBe(100)
  })

  it('is not running once settled', () => {
    const state = createLayoutAnimator()
    animateToPositions(new Map([['a', { x: 100, y: 0 }]]), () => ({ x: 0, y: 0 }), () => {}, state, 1000)
    state.settle()
    expect(state.running.value).toBe(false)
  })
})
