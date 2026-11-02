/**
 * Every node is visible in bubble mode, however far out the view is zoomed
 * (PRODUCT_DESIGN.md > Circle size in bubble mode).
 *
 * A node without edges has the smallest canvas radius, and circles were drawn
 * at canvas scale only: at 10 % zoom such a node was half a pixel across.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { screenFloorRadius, MIN_DRAW_RADIUS_PX, MIN_HIT_RADIUS_PX } from '../canvas/utils/bubbleRadius'

describe('bubble radius', () => {
  it('draws a disconnected node at least 4 px in radius at 10 % zoom', () => {
    const scale = 0.1
    const drawn = screenFloorRadius(5, scale, MIN_DRAW_RADIUS_PX)
    expect(drawn * scale).toBeGreaterThanOrEqual(4)
  })

  it('keeps the canvas radius where it is already larger than the floor', () => {
    expect(screenFloorRadius(40, 1, MIN_DRAW_RADIUS_PX)).toBe(40)
  })

  it('never lets the pressable target fall below the drawn circle', () => {
    for (const scale of [0.05, 0.1, 0.5, 1, 2]) {
      expect(screenFloorRadius(5, scale, MIN_HIT_RADIUS_PX)).toBeGreaterThanOrEqual(
        screenFloorRadius(5, scale, MIN_DRAW_RADIUS_PX)
      )
    }
  })

  it('is the one rule the canvas applies to drawing and to hit testing', () => {
    const sfc = readFileSync(resolve(__dirname, '../canvas/components/CanvasLODCanvas.vue'), 'utf-8')
    expect(sfc).toMatch(/screenFloorRadius\(.*MIN_DRAW_RADIUS_PX\)/)
    expect(sfc).toMatch(/screenFloorRadius\(.*MIN_HIT_RADIUS_PX\)/)
    expect(sfc).not.toMatch(/const MIN_HIT_RADIUS_PX/)
  })
})
