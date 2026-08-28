/**
 * A fitted frame contains its nodes.
 *
 * The required size was the nodes' own extent, `maxX - minX`. That is smaller
 * than the span the frame must cover whenever the nodes sit to the right of or
 * below the frame's corner, so the frame was resized to something that still
 * did not contain them (PRODUCT_DESIGN.md > Fitting a frame to its contents).
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'


const PADDING = 40
const TITLE_HEIGHT = 30

/** The rule under test, mirrored: measured from the frame's own origin. */
function requiredSize(
  frame: { canvas_x: number; canvas_y: number },
  nodes: Array<{ canvas_x: number; canvas_y: number; width: number; height: number }>
) {
  let maxX = -Infinity
  let maxY = -Infinity
  for (const n of nodes) {
    maxX = Math.max(maxX, n.canvas_x + n.width)
    maxY = Math.max(maxY, n.canvas_y + n.height)
  }
  return {
    width: maxX + PADDING - frame.canvas_x,
    height: maxY + PADDING - frame.canvas_y + TITLE_HEIGHT,
  }
}

describe('fitting a frame to its contents', () => {
  it('covers a node sitting far from the frame corner', () => {
    const frame = { canvas_x: 0, canvas_y: 0 }
    // One node, 800px to the right of the frame's corner
    const nodes = [{ canvas_x: 800, canvas_y: 500, width: 200, height: 100 }]

    const size = requiredSize(frame, nodes)

    // The node's right edge is at 1000; the frame must reach past it
    expect(size.width).toBeGreaterThan(1000)
    expect(size.height).toBeGreaterThan(600)
  })

  it('is larger than the nodes own extent when they are offset', () => {
    // This gap is the defect: extent 200 wide, span from the origin 1000
    const frame = { canvas_x: 0, canvas_y: 0 }
    const nodes = [{ canvas_x: 800, canvas_y: 0, width: 200, height: 100 }]

    const extentOnly = 200 + PADDING * 2
    expect(requiredSize(frame, nodes).width).toBeGreaterThan(extentOnly)
  })

  it('is applied by the handler', () => {
    const source = readFileSync(
      resolve(__dirname, '../mcp/handlers/frameHandlers.ts'),
      'utf-8'
    )
    expect(source).toContain('maxX + padding - frame.canvas_x')
    expect(source).not.toMatch(/requiredWidth = maxX - minX/)
  })
})
