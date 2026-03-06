/**
 * SVG path generation with rounded corners
 */

import type { Point } from './types'

/**
 * Convert a point array to SVG path string with rounded corners
 */
export function pathToSvg(path: Point[], radius = 6): string {
  if (path.length < 2) return ''

  if (path.length === 2) {
    return `M${path[0].x},${path[0].y} L${path[1].x},${path[1].y}`
  }

  let d = `M${path[0].x},${path[0].y}`

  for (let i = 1; i < path.length - 1; i++) {
    const prev = path[i - 1]
    const curr = path[i]
    const next = path[i + 1]

    const d1 = Math.sqrt((curr.x - prev.x) ** 2 + (curr.y - prev.y) ** 2)
    const d2 = Math.sqrt((next.x - curr.x) ** 2 + (next.y - curr.y) ** 2)
    const r = Math.min(radius, d1 / 2, d2 / 2)

    if (r < 1) {
      d += ` L${curr.x},${curr.y}`
      continue
    }

    const t1 = r / d1
    const t2 = r / d2
    const x1 = curr.x - (curr.x - prev.x) * t1
    const y1 = curr.y - (curr.y - prev.y) * t1
    const x2 = curr.x + (next.x - curr.x) * t2
    const y2 = curr.y + (next.y - curr.y) * t2

    d += ` L${x1},${y1} Q${curr.x},${curr.y} ${x2},${y2}`
  }

  d += ` L${path[path.length - 1].x},${path[path.length - 1].y}`
  return d
}
