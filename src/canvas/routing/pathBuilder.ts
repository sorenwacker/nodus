/**
 * Path building utilities for edge routing
 */

import type { Point, Side, NodeRect } from './types'

const OBSTACLE_MARGIN = 20

/**
 * Create orthogonal path between two points, avoiding obstacles
 */
export function createOrthogonalPath(
  sourcePort: Point,
  sourceStandoff: Point,
  sourceSide: Side,
  targetPort: Point,
  targetStandoff: Point,
  _targetSide: Side,
  obstacles: NodeRect[] = [],
  excludeIds: Set<string> = new Set()
): Point[] {
  const path = [sourcePort, sourceStandoff]
  const horizontal = sourceSide === 'left' || sourceSide === 'right'

  // Check if there are any obstacles in the general area between source and target
  const hasObstaclesInArea = obstacles.some(node => {
    if (node.id && excludeIds.has(node.id)) return false

    const nodeLeft = node.canvas_x
    const nodeRight = node.canvas_x + (node.width || 200)
    const nodeTop = node.canvas_y
    const nodeBottom = node.canvas_y + (node.height || 120)

    const pathLeft = Math.min(sourceStandoff.x, targetStandoff.x) - 10
    const pathRight = Math.max(sourceStandoff.x, targetStandoff.x) + 10
    const pathTop = Math.min(sourceStandoff.y, targetStandoff.y) - 10
    const pathBottom = Math.max(sourceStandoff.y, targetStandoff.y) + 10

    // Check overlap
    return nodeLeft < pathRight && nodeRight > pathLeft &&
           nodeTop < pathBottom && nodeBottom > pathTop
  })

  if (hasObstaclesInArea) {
    // Route around obstacles
    const altPath = routeAroundObstacles(sourceStandoff, targetStandoff, obstacles, excludeIds)
    if (altPath.length > 0) {
      path.push(...altPath, targetStandoff, targetPort)
      return path
    }
  }

  // Simple path - no obstacles
  if (horizontal) {
    if (Math.abs(sourceStandoff.x - targetStandoff.x) >= 5) {
      path.push({ x: targetStandoff.x, y: sourceStandoff.y })
    }
  } else {
    if (Math.abs(sourceStandoff.y - targetStandoff.y) >= 5) {
      path.push({ x: sourceStandoff.x, y: targetStandoff.y })
    }
  }

  path.push(targetStandoff, targetPort)
  return path
}

/**
 * Route around obstacles using a simple algorithm
 */
function routeAroundObstacles(
  start: Point,
  end: Point,
  obstacles: NodeRect[],
  excludeIds: Set<string>
): Point[] {
  // Find all blocking obstacles between start and end
  const blocking = obstacles.filter(node => {
    if (node.id && excludeIds.has(node.id)) return false
    const rect = {
      x: node.canvas_x,
      y: node.canvas_y,
      width: node.width || 200,
      height: node.height || 120
    }
    // Check if obstacle is roughly between start and end
    const minX = Math.min(start.x, end.x) - 50
    const maxX = Math.max(start.x, end.x) + 50
    const minY = Math.min(start.y, end.y) - 50
    const maxY = Math.max(start.y, end.y) + 50

    const obsRight = rect.x + rect.width
    const obsBottom = rect.y + rect.height

    // Check if obstacle overlaps the bounding box of the line
    if (obsRight < minX || rect.x > maxX) return false
    if (obsBottom < minY || rect.y > maxY) return false

    return true
  })

  if (blocking.length === 0) return []

  // Find bounding box of all blocking obstacles
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const obs of blocking) {
    minX = Math.min(minX, obs.canvas_x)
    minY = Math.min(minY, obs.canvas_y)
    maxX = Math.max(maxX, obs.canvas_x + (obs.width || 200))
    maxY = Math.max(maxY, obs.canvas_y + (obs.height || 120))
  }

  // Add margin
  const margin = OBSTACLE_MARGIN + 5
  minX -= margin
  minY -= margin
  maxX += margin
  maxY += margin

  // Determine best route: go around top, bottom, left, or right
  const routes: { path: Point[]; cost: number }[] = []

  // Route over (top)
  routes.push({
    path: [{ x: start.x, y: minY }, { x: end.x, y: minY }],
    cost: Math.abs(start.y - minY) + Math.abs(end.y - minY)
  })

  // Route under (bottom)
  routes.push({
    path: [{ x: start.x, y: maxY }, { x: end.x, y: maxY }],
    cost: Math.abs(start.y - maxY) + Math.abs(end.y - maxY)
  })

  // Route left
  routes.push({
    path: [{ x: minX, y: start.y }, { x: minX, y: end.y }],
    cost: Math.abs(start.x - minX) + Math.abs(end.x - minX)
  })

  // Route right
  routes.push({
    path: [{ x: maxX, y: start.y }, { x: maxX, y: end.y }],
    cost: Math.abs(start.x - maxX) + Math.abs(end.x - maxX)
  })

  // Pick lowest cost route
  routes.sort((a, b) => a.cost - b.cost)
  return routes[0].path
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
