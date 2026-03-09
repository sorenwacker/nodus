/**
 * Obstacle detection and avoidance for edge routing
 *
 * Edges must route AROUND nodes they don't connect to.
 * An edge between nodes A and B may not pass through node C.
 */

import type { Point, NodeRect } from './types'

// Increased margin to account for node height estimation inaccuracies
export const OBSTACLE_MARGIN = 25

/**
 * Check if a line segment intersects a node rectangle
 */
export function segmentIntersectsNode(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  node: NodeRect,
  margin: number = OBSTACLE_MARGIN
): boolean {
  const left = node.canvas_x - margin
  const right = node.canvas_x + (node.width || 200) + margin
  const top = node.canvas_y - margin
  const bottom = node.canvas_y + (node.height || 120) + margin

  // Quick bounding box check
  const minX = Math.min(x1, x2)
  const maxX = Math.max(x1, x2)
  const minY = Math.min(y1, y2)
  const maxY = Math.max(y1, y2)

  if (maxX < left || minX > right || maxY < top || minY > bottom) {
    return false
  }

  // For horizontal/vertical segments, bounding box check is sufficient
  if (Math.abs(x1 - x2) < 1 || Math.abs(y1 - y2) < 1) {
    return true
  }

  // For diagonal segments, check line-rectangle intersection
  // using cross product to determine if corners are on opposite sides
  const cross = (px: number, py: number) =>
    (x2 - x1) * (py - y1) - (y2 - y1) * (px - x1)

  const c1 = cross(left, top)
  const c2 = cross(right, top)
  const c3 = cross(right, bottom)
  const c4 = cross(left, bottom)

  // If all corners on same side, no intersection
  if ((c1 > 0 && c2 > 0 && c3 > 0 && c4 > 0) || (c1 < 0 && c2 < 0 && c3 < 0 && c4 < 0)) {
    return false
  }

  return true
}

/**
 * Find all obstacles that a segment passes through
 */
export function findObstacles(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  nodes: NodeRect[] | Map<string, NodeRect>,
  excludeIds: Set<string>
): NodeRect[] {
  const obstacles: NodeRect[] = []

  const nodeList = nodes instanceof Map ? Array.from(nodes.values()) : nodes

  for (const node of nodeList) {
    if (node.id && excludeIds.has(node.id)) continue
    if (segmentIntersectsNode(x1, y1, x2, y2, node)) {
      obstacles.push(node)
    }
  }

  return obstacles
}

/**
 * Find obstacles in a bounding box region
 */
export function findObstaclesInRegion(
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
  nodes: NodeRect[] | Map<string, NodeRect>,
  excludeIds: Set<string>,
  padding: number = 50
): NodeRect[] {
  const obstacles: NodeRect[] = []
  const nodeList = nodes instanceof Map ? Array.from(nodes.values()) : nodes

  const searchMinX = minX - padding
  const searchMinY = minY - padding
  const searchMaxX = maxX + padding
  const searchMaxY = maxY + padding

  for (const node of nodeList) {
    if (node.id && excludeIds.has(node.id)) continue

    const nodeLeft = node.canvas_x
    const nodeRight = node.canvas_x + (node.width || 200)
    const nodeTop = node.canvas_y
    const nodeBottom = node.canvas_y + (node.height || 120)

    // Check if node overlaps search region
    if (
      nodeLeft < searchMaxX &&
      nodeRight > searchMinX &&
      nodeTop < searchMaxY &&
      nodeBottom > searchMinY
    ) {
      obstacles.push(node)
    }
  }

  return obstacles
}

/**
 * Check if a complete path (array of points) passes through any obstacles
 */
export function pathIntersectsObstacles(
  path: Point[],
  nodes: NodeRect[] | Map<string, NodeRect>,
  excludeIds: Set<string>
): boolean {
  for (let i = 0; i < path.length - 1; i++) {
    const p1 = path[i]
    const p2 = path[i + 1]
    const obstacles = findObstacles(p1.x, p1.y, p2.x, p2.y, nodes, excludeIds)
    if (obstacles.length > 0) {
      return true
    }
  }
  return false
}

export interface DetourRoute {
  path: Point[]
  cost: number
}

/**
 * Calculate the bounding box of obstacles with margin
 */
export function getObstacleBounds(
  obstacles: NodeRect[],
  margin: number = OBSTACLE_MARGIN + 5
): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity

  for (const obs of obstacles) {
    minX = Math.min(minX, obs.canvas_x)
    minY = Math.min(minY, obs.canvas_y)
    maxX = Math.max(maxX, obs.canvas_x + (obs.width || 200))
    maxY = Math.max(maxY, obs.canvas_y + (obs.height || 120))
  }

  return {
    minX: minX - margin,
    minY: minY - margin,
    maxX: maxX + margin,
    maxY: maxY + margin,
  }
}

/**
 * Find a detour path around obstacles
 * Returns array of possible routes sorted by cost (shortest first)
 */
export function findDetourRoutes(
  start: Point,
  end: Point,
  obstacles: NodeRect[]
): DetourRoute[] {
  if (obstacles.length === 0) {
    return []
  }

  const { minX, minY, maxX, maxY } = getObstacleBounds(obstacles)
  const routes: DetourRoute[] = []

  // Route over (top)
  routes.push({
    path: [{ x: start.x, y: minY }, { x: end.x, y: minY }],
    cost: Math.abs(start.y - minY) + Math.abs(end.y - minY),
  })

  // Route under (bottom)
  routes.push({
    path: [{ x: start.x, y: maxY }, { x: end.x, y: maxY }],
    cost: Math.abs(start.y - maxY) + Math.abs(end.y - maxY),
  })

  // Route left
  routes.push({
    path: [{ x: minX, y: start.y }, { x: minX, y: end.y }],
    cost: Math.abs(start.x - minX) + Math.abs(end.x - minX),
  })

  // Route right
  routes.push({
    path: [{ x: maxX, y: start.y }, { x: maxX, y: end.y }],
    cost: Math.abs(start.x - maxX) + Math.abs(end.x - maxX),
  })

  // Sort by cost (shortest first)
  routes.sort((a, b) => a.cost - b.cost)

  return routes
}

/**
 * Find the best detour path around obstacles
 * Returns the intermediate waypoints (not including start/end)
 */
export function findBestDetour(
  start: Point,
  end: Point,
  obstacles: NodeRect[]
): Point[] {
  const routes = findDetourRoutes(start, end, obstacles)
  if (routes.length === 0) {
    return []
  }
  return routes[0].path
}

/**
 * Route around obstacles for orthogonal paths
 * Returns path waypoints for an orthogonal detour
 */
export function routeAroundObstacles(
  start: Point,
  end: Point,
  obstacles: NodeRect[],
  isHorizontalFirst: boolean
): Point[] {
  if (obstacles.length === 0) {
    return []
  }

  const { minX, minY, maxX, maxY } = getObstacleBounds(obstacles, OBSTACLE_MARGIN + 20)
  const dx = end.x - start.x
  const dy = end.y - start.y

  if (isHorizontalFirst) {
    // Go vertical first to avoid, then horizontal
    const midY = dy > 0 ? maxY : minY
    return [
      { x: start.x, y: midY },
      { x: end.x, y: midY },
    ]
  } else {
    // Go horizontal first to avoid, then vertical
    const midX = dx > 0 ? maxX : minX
    return [
      { x: midX, y: start.y },
      { x: midX, y: end.y },
    ]
  }
}
