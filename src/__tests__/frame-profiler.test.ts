/**
 * Measuring the canvas from outside the browser kept exonerating the code:
 * culling and styling measured 0.015ms per frame, the edge model 0.41ms, both
 * against a 16.7ms budget, while the app stayed laggy. What those probes cannot
 * see is rendering - the Vue patch, layout, paint and compositing - so the
 * measurement has to happen in the running app
 * (PRODUCT_DESIGN.md > Measuring canvas performance).
 */
import { describe, it, expect } from 'vitest'
import { createFrameProfiler } from '../canvas/composables/util/useFrameProfiler'

describe('createFrameProfiler', () => {
  it('reports nothing before any frame is recorded', () => {
    expect(createFrameProfiler().summary()).toBeNull()
  })

  it('reports the median and the tail of the frames it saw', () => {
    const p = createFrameProfiler()
    for (const ms of [10, 12, 14, 16, 50]) p.recordFrame(ms)
    const s = p.summary()!
    expect(s.frames).toBe(5)
    expect(s.p50).toBe(14)
    expect(s.p95).toBe(50)
    expect(s.worst).toBe(50)
  })

  it('counts the frames that missed the budget', () => {
    const p = createFrameProfiler()
    for (const ms of [8, 9, 20, 40]) p.recordFrame(ms)
    expect(p.summary()!.dropped).toBe(2)
  })

  it('accumulates named spans so a phase can be blamed', () => {
    const p = createFrameProfiler()
    p.recordFrame(16)
    p.recordSpan('canvas', 4)
    p.recordSpan('canvas', 6)
    p.recordSpan('edges', 1)
    const s = p.summary()!
    expect(s.spans.canvas).toBe(5)
    expect(s.spans.edges).toBe(1)
  })

  it('keeps only a recent window, so a long session does not grow without bound', () => {
    const p = createFrameProfiler(4)
    for (const ms of [1, 2, 3, 100, 100, 100, 100]) p.recordFrame(ms)
    const s = p.summary()!
    expect(s.frames).toBe(4)
    expect(s.p50).toBe(100)
  })

  it('forgets everything on reset, so each gesture is measured alone', () => {
    const p = createFrameProfiler()
    p.recordFrame(30)
    p.recordSpan('canvas', 9)
    p.reset()
    expect(p.summary()).toBeNull()
  })
})
