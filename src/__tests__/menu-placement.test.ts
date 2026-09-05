/**
 * A context menu opens at the pointer, which puts it off screen whenever the
 * pointer is near the bottom or right edge - a right-click on a node at the
 * bottom of the canvas showed a menu running past the window
 * (PRODUCT_DESIGN.md > Context Menu > Placement).
 */
import { describe, it, expect } from 'vitest'
import { placeMenuInViewport } from '../canvas/utils/menuPlacement'

const VIEWPORT = { width: 1000, height: 800 }
const MENU = { width: 200, height: 300 }

describe('placeMenuInViewport', () => {
  it('opens at the pointer when the menu fits', () => {
    expect(placeMenuInViewport({ x: 100, y: 100 }, MENU, VIEWPORT)).toEqual({ x: 100, y: 100 })
  })

  it('opens above the pointer when it does not fit below', () => {
    const { y } = placeMenuInViewport({ x: 100, y: 700 }, MENU, VIEWPORT)
    expect(y).toBe(400)
  })

  it('opens left of the pointer when it does not fit to the right', () => {
    const { x } = placeMenuInViewport({ x: 900, y: 100 }, MENU, VIEWPORT)
    expect(x).toBe(700)
  })

  it('flips on both axes at the bottom-right corner', () => {
    expect(placeMenuInViewport({ x: 950, y: 780 }, MENU, VIEWPORT)).toEqual({ x: 750, y: 480 })
  })

  it('clamps rather than flipping when neither side fits', () => {
    // Flipping up from y=250 would land at -50, so the menu is clamped instead
    const { y } = placeMenuInViewport({ x: 100, y: 600 }, { width: 200, height: 650 }, VIEWPORT)
    expect(y).toBeGreaterThanOrEqual(0)
    expect(y + 650).toBeLessThanOrEqual(VIEWPORT.height)
  })

  it('pins a menu taller than the window to the top edge', () => {
    const { y } = placeMenuInViewport({ x: 100, y: 400 }, { width: 200, height: 900 }, VIEWPORT)
    expect(y).toBe(0)
  })

  it('keeps a menu wider than the window at the left edge', () => {
    const { x } = placeMenuInViewport({ x: 400, y: 100 }, { width: 1200, height: 300 }, VIEWPORT)
    expect(x).toBe(0)
  })

  it('respects a margin from the edge', () => {
    const { y } = placeMenuInViewport({ x: 100, y: 795 }, MENU, VIEWPORT, 8)
    expect(y).toBe(495)
  })
})
