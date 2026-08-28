/**
 * An edge label sits on the curve it belongs to.
 *
 * The midpoint was computed from four points only when the path had exactly
 * four. `hyperbolic` returns six - port, standoff, two control points, standoff,
 * port - so it fell through to the polyline branch, which treats the control
 * points as places the line passes through. The label drifted further from the
 * curve the further those points reached
 * (PRODUCT_DESIGN.md > Placing an edge label).
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'


/** B(0.5) of a cubic bezier: the point the label should sit on. */
function bezierMidpoint(
  p0: { x: number; y: number },
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  p3: { x: number; y: number }
) {
  return {
    x: 0.125 * p0.x + 0.375 * p1.x + 0.375 * p2.x + 0.125 * p3.x,
    y: 0.125 * p0.y + 0.375 * p1.y + 0.375 * p2.y + 0.125 * p3.y,
  }
}

describe('the curve points of an edge path', () => {
  // Mirrors the selection the routing composable makes. A hyperbolic path's
  // curve is entries 1..4; a curved path's is 0..3.
  function curvePoints(style: string, path: Array<{ x: number; y: number }>) {
    if (style === 'curved' && path.length === 4) return path.slice(0, 4)
    if (style === 'hyperbolic' && path.length === 6) return path.slice(1, 5)
    return null
  }

  it('takes the four curve points from a six-entry hyperbolic path', () => {
    const path = [
      { x: 0, y: 0 }, // port
      { x: 10, y: 0 }, // standoff, curve start
      { x: 190, y: 0 }, // control point
      { x: 190, y: 100 }, // control point
      { x: 200, y: 100 }, // standoff, curve end
      { x: 210, y: 100 }, // port
    ]

    const points = curvePoints('hyperbolic', path)

    expect(points).not.toBeNull()
    expect(points![0]).toEqual({ x: 10, y: 0 })
    expect(points![3]).toEqual({ x: 200, y: 100 })
  })

  it('puts the label on the curve, not on the control polygon', () => {
    const path = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 190, y: 0 },
      { x: 190, y: 100 },
      { x: 200, y: 100 },
      { x: 210, y: 100 },
    ]
    const points = curvePoints('hyperbolic', path)!
    const onCurve = bezierMidpoint(points[0], points[1], points[2], points[3])

    // What the polyline fallback would have produced: the midpoint of the whole
    // six-point run, which passes through the control points
    const polylineMid = { x: (path[2].x + path[3].x) / 2, y: (path[2].y + path[3].y) / 2 }

    const drift = Math.hypot(onCurve.x - polylineMid.x, onCurve.y - polylineMid.y)
    expect(drift, 'the two must differ, or this test proves nothing').toBeGreaterThan(10)
    // The curve midpoint sits inside the span, not out at the control points
    expect(onCurve.x).toBeLessThan(190)
  })

  it('leaves a four-entry curved path alone', () => {
    const path = [
      { x: 0, y: 0 },
      { x: 50, y: 0 },
      { x: 50, y: 100 },
      { x: 100, y: 100 },
    ]

    expect(curvePoints('curved', path)).toHaveLength(4)
  })

  it('is applied by the routing composable', () => {
    const source = readFileSync(
      resolve(__dirname, '../canvas/composables/edges/useEdgeRouting.ts'),
      'utf-8'
    )
    expect(source).toMatch(/routed\.path\.slice\(1, 5\)/)
  })
})
