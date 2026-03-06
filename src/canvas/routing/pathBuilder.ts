/**
 * Path building utilities for edge routing
 */

import type { Point, Side, NodeRect } from './types'

/**
 * Create orthogonal path between two points with standoffs
 */
export function createOrthogonalPath(
  sourcePort: Point,
  sourceStandoff: Point,
  sourceSide: Side,
  targetPort: Point,
  targetStandoff: Point,
  _targetSide: Side
): Point[] {
  const path = [sourcePort, sourceStandoff]
  const horizontal = sourceSide === 'left' || sourceSide === 'right'

  if (horizontal) {
    if (Math.abs(sourceStandoff.x - targetStandoff.x) < 5) {
      // Nearly aligned vertically - direct
      path.push(targetStandoff)
    } else {
      // L-shape: horizontal then vertical
      const mid = { x: targetStandoff.x, y: sourceStandoff.y }
      path.push(mid, targetStandoff)
    }
  } else {
    if (Math.abs(sourceStandoff.y - targetStandoff.y) < 5) {
      // Nearly aligned horizontally - direct
      path.push(targetStandoff)
    } else {
      // L-shape: vertical then horizontal
      const mid = { x: sourceStandoff.x, y: targetStandoff.y }
      path.push(mid, targetStandoff)
    }
  }

  path.push(targetPort)
  return path
}

/**
 * Clean a path by removing redundant points
 */
export function cleanPath(path: Point[]): Point[] {
  if (path.length <= 2) return path

  const result: Point[] = [path[0]]

  for (let i = 1; i < path.length; i++) {
    const prev = result[result.length - 1]
    const curr = path[i]

    // Skip points too close to previous
    if (Math.abs(curr.x - prev.x) < 1 && Math.abs(curr.y - prev.y) < 1) {
      continue
    }

    // Skip collinear middle points
    if (i < path.length - 1 && result.length >= 1) {
      const next = path[i + 1]
      const dx1 = curr.x - prev.x
      const dy1 = curr.y - prev.y
      const dx2 = next.x - curr.x
      const dy2 = next.y - curr.y
      const cross = dx1 * dy2 - dy1 * dx2

      if (Math.abs(cross) < 1) {
        continue
      }
    }

    result.push(curr)
  }

  // Ensure last point is included
  const last = path[path.length - 1]
  const resultLast = result[result.length - 1]
  if (Math.abs(last.x - resultLast.x) > 1 || Math.abs(last.y - resultLast.y) > 1) {
    result.push(last)
  }

  return result
}

/**
 * Legacy function for useEdges composable compatibility
 * Creates a simple orthogonal path between source and target nodes
 */
export function findOrthogonalPath(
  source: NodeRect,
  target: NodeRect,
  _nodes: NodeRect[],
  _nodeIds: string[],
  _excludeIds: Set<string>,
  offset: number = 0
): Point[] {
  const sw = source.width || 200
  const sh = source.height || 120
  const tw = target.width || 200
  const th = target.height || 120

  const sx = source.canvas_x + sw / 2
  const sy = source.canvas_y + sh / 2
  const tx = target.canvas_x + tw / 2
  const ty = target.canvas_y + th / 2

  const path: Point[] = []

  // Start point
  path.push({ x: sx, y: sy })

  // Apply offset for parallel edges
  const midX = (sx + tx) / 2 + offset
  const midY = (sy + ty) / 2 + offset

  if (Math.abs(tx - sx) > Math.abs(ty - sy)) {
    // Horizontal dominant
    path.push({ x: midX, y: sy })
    path.push({ x: midX, y: ty })
  } else {
    // Vertical dominant
    path.push({ x: sx, y: midY })
    path.push({ x: tx, y: midY })
  }

  // End point
  path.push({ x: tx, y: ty })

  return path
}
