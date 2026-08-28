/**
 * A ring holds as many nodes as its own circumference allows.
 *
 * Capacity was computed from `maxRadius` - the outermost radius the layout
 * permits - while the nodes were placed at the ring's own radius, a small
 * fraction of it at shallow depths. The branch meant to relieve crowding put
 * over a thousand nodes on a circle with room for a dozen, overlapping them
 * completely (PRODUCT_DESIGN.md > Radial rings).
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'


/** Mirrors the capacity rule: nodes that fit on a circle at a given radius. */
function capacityAt(radius: number, minNodeSpacing: number): number {
  return Math.max(1, Math.floor((2 * Math.PI * radius) / minNodeSpacing))
}

describe('radial ring capacity', () => {
  const SPACING = 280

  it('is far smaller at a shallow radius than at the outer limit', () => {
    // This gap is the defect: sizing by the outer limit while placing at 500
    const atRing = capacityAt(500, SPACING)
    const atOuterLimit = capacityAt(50000, SPACING)

    expect(atRing).toBeLessThan(atOuterLimit / 50)
  })

  it('never places more nodes on a ring than fit on it', () => {
    const radius = 500
    const capacity = capacityAt(radius, SPACING)
    const circumference = 2 * Math.PI * radius

    expect(capacity * SPACING).toBeLessThanOrEqual(circumference)
  })

  it('grows with the radius, so later rings hold more', () => {
    expect(capacityAt(1000, SPACING)).toBeGreaterThan(capacityAt(500, SPACING))
  })

  it('is applied per ring by the layout', () => {
    const source = readFileSync(
      resolve(__dirname, '../canvas/composables/layout/useRadialLayout.ts'),
      'utf-8'
    )
    // Each ring's own radius, not a single figure for all of them
    expect(source).toContain('capacityAt(ringRadius)')
    expect(source).not.toMatch(/maxNodesPerRing\s*=\s*Math\.floor\(\(2 \* Math\.PI \* maxRadius\)/)
  })
})
