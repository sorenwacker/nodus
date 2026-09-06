/**
 * Cards arrive a few at a time, not a column at once.
 *
 * A grid layout puts a whole column across the viewport margin in one frame:
 * measured on a dense workspace, churn is 0 for most frames and then 20, 30 or
 * 60 cards in a single one. Mounting is the expensive part - the codebase
 * records that swapping some 300 cards "costs seconds" - so the burst is what
 * is felt, while the median frame stays healthy.
 *
 * The margin is the slack that makes this safe: a node crossing it is not yet
 * on screen, so it can be mounted a frame or two later without a gap appearing
 * (PRODUCT_DESIGN.md > Staging what the viewport mounts).
 */
import { describe, it, expect } from 'vitest'
import { stageAdditions } from '../canvas/utils/stagedMounting'

const ids = (n: number, prefix = 'n') => Array.from({ length: n }, (_, i) => `${prefix}${i}`)

describe('stageAdditions', () => {
  it('passes everything through when the target fits the budget', () => {
    const out = stageAdditions(new Set(['a']), new Set(['a', 'b']), 8)
    expect([...out].sort()).toEqual(['a', 'b'])
  })

  it('admits only the budget when a column arrives at once', () => {
    const target = new Set(ids(60))
    const out = stageAdditions(new Set(), target, 8)
    expect(out.size).toBe(8)
  })

  it('catches up over successive frames', () => {
    const target = new Set(ids(20))
    let mounted = new Set<string>()
    for (let frame = 0; frame < 3; frame++) mounted = stageAdditions(mounted, target, 8)
    expect(mounted.size).toBe(20)
  })

  it('drops what left the viewport immediately, since unmounting frees work', () => {
    const out = stageAdditions(new Set(['a', 'b', 'c']), new Set(['a']), 8)
    expect([...out]).toEqual(['a'])
  })

  it('never admits a node the viewport does not want', () => {
    const out = stageAdditions(new Set(['gone']), new Set(['a', 'b']), 8)
    expect(out.has('gone')).toBe(false)
  })

  it('converges even when the target keeps changing', () => {
    let mounted = new Set<string>()
    for (let frame = 0; frame < 40; frame++) {
      mounted = stageAdditions(mounted, new Set(ids(30)), 8)
    }
    expect(mounted.size).toBe(30)
  })

  it('treats a budget of zero as no staging, so the feature can be turned off', () => {
    const target = new Set(ids(60))
    expect(stageAdditions(new Set(), target, 0).size).toBe(60)
  })
})
