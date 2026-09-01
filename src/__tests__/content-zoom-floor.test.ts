/**
 * The zoom-out floor comes from the content, not from a constant.
 *
 * A fixed floor serves every workspace the same number, and the number that
 * lets a 69,000px layout fit lets an 11,000px one shrink to a ~55px smudge -
 * every card visually piled on every other - while a pan moves two hundred
 * canvas px per mouse px, so the view ends up megapixels from the graph. The
 * floor is now the fit scale with ~40% margin: the whole graph plus breathing
 * room is as far out as out goes (useViewState > minZoom).
 *
 * The force layout's collision padding scales with the card for the same
 * user: resizing every card up and re-running the layout used to barely
 * change the spread, because a flat 80px pad is generous beside a 200x120
 * card and nothing beside a 400x380 one (forceLayout).
 */
import { describe, it, expect } from 'vitest'
import { useViewState } from '../canvas/composables/viewport/useViewState'
import { ZOOM_LIMITS } from '../canvas/constants'
import { contentSpan } from '../canvas/utils/contentBounds'
import { applyForceLayout } from '../canvas/layout'

const RECT = { width: 1536, height: 652 } as DOMRect

function viewStateFor(span: { width: number; height: number } | null) {
  return useViewState({
    getCanvasRect: () => RECT,
    getContentSpan: () => span,
  })
}

describe('content-aware zoom-out floor', () => {
  it('stops zooming out a little past the whole graph', () => {
    // The measured workspace: 11,175 x 10,668px in a 1536x652 viewport
    const vs = viewStateFor({ width: 11175, height: 10668 })
    for (let i = 0; i < 100; i++) vs.zoomOut()
    const fit = Math.min(RECT.width / 11275, RECT.height / 10768)
    expect(vs.scale.value).toBeGreaterThanOrEqual(fit * 0.7 * 0.99)
    expect(vs.scale.value).toBeLessThan(fit)
    // nowhere near the absolute floor that produced the smudge
    expect(vs.scale.value).toBeGreaterThan(ZOOM_LIMITS.MIN * 5)
  })

  it('still reaches the absolute floor for a vast layout', () => {
    const vs = viewStateFor({ width: 300000, height: 300000 })
    for (let i = 0; i < 100; i++) vs.zoomOut()
    expect(vs.scale.value).toBe(ZOOM_LIMITS.MIN)
  })

  it('falls back to the absolute floor when content is unknown', () => {
    const vs = viewStateFor(null)
    for (let i = 0; i < 100; i++) vs.zoomOut()
    expect(vs.scale.value).toBe(ZOOM_LIMITS.MIN)
  })

  it('never fits below its own floor', () => {
    // fit * 0.7 < fit by construction; setScale to the fit must be accepted
    const vs = viewStateFor({ width: 11175, height: 10668 })
    const fit = Math.min(RECT.width / 11275, RECT.height / 10768)
    vs.setScale(fit)
    expect(vs.scale.value).toBeCloseTo(fit, 5)
  })

  it('lets a tiny workspace zoom out to half scale for planning room', () => {
    const vs = viewStateFor({ width: 500, height: 300 })
    for (let i = 0; i < 100; i++) vs.zoomOut()
    expect(vs.scale.value).toBeCloseTo(0.5, 3)
  })
})

describe('contentSpan', () => {
  it('spans node rectangles, not node origins', () => {
    const span = contentSpan([
      { canvas_x: 0, canvas_y: 0, width: 200, height: 120 },
      { canvas_x: 1000, canvas_y: 500, width: 400, height: 380 },
    ])
    expect(span).toEqual({ minX: 0, minY: 0, width: 1400, height: 880 })
    expect(contentSpan([])).toBeNull()
  })
})

describe('force layout spacing follows card size', () => {
  it('spaces two large linked cards further apart than the flat pad did', async () => {
    const big = { width: 400, height: 380 }
    const nodes = [
      { id: 'a', x: 0, y: 0, ...big },
      { id: 'b', x: 10, y: 10, ...big },
    ]
    const positions = await applyForceLayout(nodes, [{ source: 'a', target: 'b' }], {
      centerX: 0,
      centerY: 0,
      iterations: 300,
    })
    const a = positions.get('a')!
    const b = positions.get('b')!
    const dist = Math.hypot(a.x - b.x, a.y - b.y)
    const diagonal = Math.hypot(400, 380)
    // Collision demands r_a + r_b = diagonal + 2 * max(80, diagonal / 4);
    // allow d3 a little unresolved slack
    expect(dist).toBeGreaterThan((diagonal + 2 * (diagonal / 4)) * 0.9)
  })
})
