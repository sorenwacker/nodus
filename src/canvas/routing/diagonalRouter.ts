/**
 * Diagonal routing with strict 45-degree angles
 *
 * Path structure: orthogonal -> 45° diagonal -> orthogonal
 *
 * For horizontal-dominant paths:
 *   startStandoff --horizontal--> p1 --45° diagonal--> p2 --horizontal--> endStandoff
 *
 * For vertical-dominant paths:
 *   startStandoff --vertical--> p1 --45° diagonal--> p2 --vertical--> endStandoff
 *
 * Special case: When dy or dx is very small (nearly horizontal/vertical),
 * use orthogonal jog path to separate edges.
 */

import type { Point, NodeRect, Side } from './types'
import { GridTracker } from './gridTracker'
import {
  findObstacles,
  findObstaclesInRegion,
  getObstacleBounds,
  OBSTACLE_MARGIN,
} from './obstacleAvoider'

export interface DiagonalRouteResult {
  path: Point[]
  svgPath: string
  usedDetour: boolean
}

export interface DiagonalRouteParams {
  startPort: Point
  startStandoff: Point
  endPort: Point
  endStandoff: Point
  sourceSide: Side
  targetSide: Side
  nodes: NodeRect[] | Map<string, NodeRect>
  excludeIds: Set<string>
  gridTracker: GridTracker
  arrowOffset?: number
  skipGridCheck?: boolean
}

// Minimum diagonal distance for meaningful 45° segment
const MIN_DIAG_DIST = 10

// Minimum orthogonal segment length before/after diagonal
// Must be longer than arrow for clean entry/exit
const MIN_ORTHO_SEGMENT = 40

/**
 * Calculate diagonal path points with offset
 * Ensures minimum orthogonal segment length BOTH before and after diagonal
 * while maintaining strict 45-degree diagonal angle
 */
function calculateDiagonalPoints(
  startStandoff: Point,
  endStandoff: Point,
  offset: number = 0
): { p1: Point; p2: Point; isHorizDominant: boolean } {
  const dx = endStandoff.x - startStandoff.x
  const dy = endStandoff.y - startStandoff.y
  const absDx = Math.abs(dx)
  const absDy = Math.abs(dy)
  const signX = dx >= 0 ? 1 : -1
  const signY = dy >= 0 ? 1 : -1
  const isHorizDominant = absDx >= absDy

  let p1: Point
  let p2: Point

  if (isHorizDominant) {
    // For 45-degree diagonal: diagonal horizontal distance = vertical distance
    const diagDist = absDy
    // Total orthogonal space = total horizontal - diagonal horizontal
    const totalOrtho = absDx - diagDist

    // Position diagonal to leave MIN_ORTHO_SEGMENT at END (for arrow)
    // Start orthogonal gets whatever remains
    let endOrtho = Math.min(MIN_ORTHO_SEGMENT, totalOrtho / 2)
    let startOrtho = totalOrtho - endOrtho

    // But also ensure start has minimum if possible
    if (startOrtho < MIN_ORTHO_SEGMENT && totalOrtho >= MIN_ORTHO_SEGMENT) {
      startOrtho = MIN_ORTHO_SEGMENT
      endOrtho = totalOrtho - startOrtho
    }

    // Prioritize end segment for arrow visibility
    endOrtho = Math.max(endOrtho, Math.min(MIN_ORTHO_SEGMENT, totalOrtho))

    const p1X = startStandoff.x + startOrtho * signX + offset

    p1 = { x: p1X, y: startStandoff.y }
    p2 = { x: p1X + diagDist * signX, y: endStandoff.y }
  } else {
    // For 45-degree diagonal: diagonal vertical distance = horizontal distance
    const diagDist = absDx
    // Total orthogonal space = total vertical - diagonal vertical
    const totalOrtho = absDy - diagDist

    // Position diagonal to leave MIN_ORTHO_SEGMENT at END (for arrow)
    let endOrtho = Math.min(MIN_ORTHO_SEGMENT, totalOrtho / 2)
    let startOrtho = totalOrtho - endOrtho

    // But also ensure start has minimum if possible
    if (startOrtho < MIN_ORTHO_SEGMENT && totalOrtho >= MIN_ORTHO_SEGMENT) {
      startOrtho = MIN_ORTHO_SEGMENT
      endOrtho = totalOrtho - startOrtho
    }

    // Prioritize end segment for arrow visibility
    endOrtho = Math.max(endOrtho, Math.min(MIN_ORTHO_SEGMENT, totalOrtho))

    const p1Y = startStandoff.y + startOrtho * signY + offset

    p1 = { x: startStandoff.x, y: p1Y }
    p2 = { x: endStandoff.x, y: p1Y + diagDist * signY }
  }

  return { p1, p2, isHorizDominant }
}

/**
 * Calculate orthogonal jog path for nearly horizontal/vertical edges
 * Returns 4 intermediate points that create a proper orthogonal path
 */
function calculateJogPath(
  startStandoff: Point,
  endStandoff: Point,
  jogOffset: number,
  isHorizDominant: boolean
): { points: Point[]; midChannel: number } {
  const dx = endStandoff.x - startStandoff.x
  const dy = endStandoff.y - startStandoff.y

  if (isHorizDominant) {
    // Nearly horizontal: create vertical jog
    // Path: start -> (start.x, jogY) -> (end.x, jogY) -> end
    const midX = startStandoff.x + dx / 2
    const jogY = (startStandoff.y + endStandoff.y) / 2 + jogOffset

    return {
      points: [
        { x: midX, y: startStandoff.y },
        { x: midX, y: jogY },
        { x: midX, y: jogY }, // Same point - will be cleaned up
        { x: midX, y: endStandoff.y },
      ],
      midChannel: jogY,
    }
  } else {
    // Nearly vertical: create horizontal jog
    const midY = startStandoff.y + dy / 2
    const jogX = (startStandoff.x + endStandoff.x) / 2 + jogOffset

    return {
      points: [
        { x: startStandoff.x, y: midY },
        { x: jogX, y: midY },
        { x: jogX, y: midY }, // Same point
        { x: endStandoff.x, y: midY },
      ],
      midChannel: jogX,
    }
  }
}

/**
 * Check if all segments of a diagonal path are free on the grid AND obstacle-free
 */
function checkDiagonalPathAvailable(
  startStandoff: Point,
  p1: Point,
  p2: Point,
  endStandoff: Point,
  gridTracker: GridTracker,
  nodes: NodeRect[] | Map<string, NodeRect>,
  excludeIds: Set<string>
): boolean {
  // Check segment 1 for grid conflicts
  if (!gridTracker.canPlace(startStandoff.x, startStandoff.y, p1.x, p1.y)) {
    return false
  }

  // Check diagonal segment for grid conflicts (skip if p1 == p2)
  if (Math.abs(p1.x - p2.x) > 1 || Math.abs(p1.y - p2.y) > 1) {
    if (!gridTracker.canPlaceDiagonal(p1.x, p1.y, p2.x, p2.y)) {
      return false
    }
  }

  // Check segment 3 for grid conflicts
  if (!gridTracker.canPlace(p2.x, p2.y, endStandoff.x, endStandoff.y)) {
    return false
  }

  // Check all segments for obstacles
  const seg1Obs = findObstacles(startStandoff.x, startStandoff.y, p1.x, p1.y, nodes, excludeIds)
  if (seg1Obs.length > 0) return false

  if (Math.abs(p1.x - p2.x) > 1 || Math.abs(p1.y - p2.y) > 1) {
    const diagObs = findObstacles(p1.x, p1.y, p2.x, p2.y, nodes, excludeIds)
    if (diagObs.length > 0) return false
  }

  const seg2Obs = findObstacles(p2.x, p2.y, endStandoff.x, endStandoff.y, nodes, excludeIds)
  if (seg2Obs.length > 0) return false

  return true
}

/**
 * Check if jog path is available (for nearly horizontal/vertical edges)
 *
 * For horizontal-dominant (nearly horizontal) edges, creates a "U" shape:
 *   startStandoff --(vertical)--> (start.x, channel) --(horizontal)--> (end.x, channel) --(vertical)--> endStandoff
 *
 * For vertical-dominant (nearly vertical) edges, creates an "S" shape:
 *   startStandoff --(horizontal)--> (channel, start.y) --(vertical)--> (channel, end.y) --(horizontal)--> endStandoff
 */
function checkJogPathAvailable(
  startStandoff: Point,
  endStandoff: Point,
  midChannel: number,
  isHorizDominant: boolean,
  gridTracker: GridTracker,
  nodes: NodeRect[] | Map<string, NodeRect>,
  excludeIds: Set<string>
): boolean {
  if (isHorizDominant) {
    // "U" shape: vertical down, horizontal across at channel, vertical up
    // Segment 1: (start.x, start.y) -> (start.x, midChannel) vertical
    if (!gridTracker.canPlace(startStandoff.x, startStandoff.y, startStandoff.x, midChannel)) {
      return false
    }
    // Segment 2: (start.x, midChannel) -> (end.x, midChannel) horizontal
    if (!gridTracker.canPlace(startStandoff.x, midChannel, endStandoff.x, midChannel)) {
      return false
    }
    // Segment 3: (end.x, midChannel) -> (end.x, end.y) vertical
    if (!gridTracker.canPlace(endStandoff.x, midChannel, endStandoff.x, endStandoff.y)) {
      return false
    }

    // Check obstacles
    if (findObstacles(startStandoff.x, startStandoff.y, startStandoff.x, midChannel, nodes, excludeIds).length > 0) return false
    if (findObstacles(startStandoff.x, midChannel, endStandoff.x, midChannel, nodes, excludeIds).length > 0) return false
    if (findObstacles(endStandoff.x, midChannel, endStandoff.x, endStandoff.y, nodes, excludeIds).length > 0) return false
  } else {
    // "S" shape: horizontal out, vertical across at channel, horizontal in
    // Segment 1: (start.x, start.y) -> (midChannel, start.y) horizontal
    if (!gridTracker.canPlace(startStandoff.x, startStandoff.y, midChannel, startStandoff.y)) {
      return false
    }
    // Segment 2: (midChannel, start.y) -> (midChannel, end.y) vertical
    if (!gridTracker.canPlace(midChannel, startStandoff.y, midChannel, endStandoff.y)) {
      return false
    }
    // Segment 3: (midChannel, end.y) -> (end.x, end.y) horizontal
    if (!gridTracker.canPlace(midChannel, endStandoff.y, endStandoff.x, endStandoff.y)) {
      return false
    }

    // Check obstacles
    if (findObstacles(startStandoff.x, startStandoff.y, midChannel, startStandoff.y, nodes, excludeIds).length > 0) return false
    if (findObstacles(midChannel, startStandoff.y, midChannel, endStandoff.y, nodes, excludeIds).length > 0) return false
    if (findObstacles(midChannel, endStandoff.y, endStandoff.x, endStandoff.y, nodes, excludeIds).length > 0) return false
  }

  return true
}

/**
 * Mark jog path segments on grid
 */
function markJogPath(
  startStandoff: Point,
  endStandoff: Point,
  midChannel: number,
  isHorizDominant: boolean,
  gridTracker: GridTracker
): void {
  if (isHorizDominant) {
    // "U" shape segments
    gridTracker.mark(startStandoff.x, startStandoff.y, startStandoff.x, midChannel)
    gridTracker.mark(startStandoff.x, midChannel, endStandoff.x, midChannel)
    gridTracker.mark(endStandoff.x, midChannel, endStandoff.x, endStandoff.y)
  } else {
    // "S" shape segments
    gridTracker.mark(startStandoff.x, startStandoff.y, midChannel, startStandoff.y)
    gridTracker.mark(midChannel, startStandoff.y, midChannel, endStandoff.y)
    gridTracker.mark(midChannel, endStandoff.y, endStandoff.x, endStandoff.y)
  }
}

/**
 * Build SVG path for jog route
 *
 * For horizontal-dominant: "U" shape going down/up to channel
 * For vertical-dominant: "S" shape going out to channel then in
 */
function buildJogSvgPath(
  startPort: Point,
  startStandoff: Point,
  endStandoff: Point,
  endEdge: Point,
  midChannel: number,
  isHorizDominant: boolean
): string {
  if (isHorizDominant) {
    // "U" shape: port -> standoff -> down to channel -> across -> up to standoff -> port
    return `M${startPort.x},${startPort.y} L${startStandoff.x},${startStandoff.y} L${startStandoff.x},${midChannel} L${endStandoff.x},${midChannel} L${endStandoff.x},${endStandoff.y} L${endEdge.x},${endEdge.y}`
  } else {
    // "S" shape: port -> standoff -> out to channel -> down -> in to standoff -> port
    return `M${startPort.x},${startPort.y} L${startStandoff.x},${startStandoff.y} L${midChannel},${startStandoff.y} L${midChannel},${endStandoff.y} L${endStandoff.x},${endStandoff.y} L${endEdge.x},${endEdge.y}`
  }
}

/**
 * Route a diagonal edge with obstacle avoidance and grid tracking
 */
export function routeDiagonal(params: DiagonalRouteParams): DiagonalRouteResult {
  const {
    startPort,
    startStandoff,
    endPort,
    endStandoff,
    nodes,
    excludeIds,
    gridTracker,
    arrowOffset = 0,
  } = params

  const dx = endStandoff.x - startStandoff.x
  const dy = endStandoff.y - startStandoff.y
  const absDx = Math.abs(dx)
  const absDy = Math.abs(dy)
  const isHorizDominant = absDx >= absDy

  // Adjust end port for arrow head
  let endEdge = { ...endPort }
  if (arrowOffset > 0) {
    if (params.targetSide === 'left') endEdge.x += arrowOffset
    else if (params.targetSide === 'right') endEdge.x -= arrowOffset
    else if (params.targetSide === 'top') endEdge.y += arrowOffset
    else if (params.targetSide === 'bottom') endEdge.y -= arrowOffset
  }

  // Very short path - just draw a line
  if (absDx < 5 && absDy < 5) {
    const path = [startPort, endEdge]
    return {
      path,
      svgPath: `M${startPort.x},${startPort.y} L${endEdge.x},${endEdge.y}`,
      usedDetour: false,
    }
  }

  const gridSize = gridTracker.getGridSize()

  // For nearly horizontal/vertical paths, check for obstacles and route around if needed
  if (absDy < MIN_DIAG_DIST || absDx < MIN_DIAG_DIST) {
    // Check if direct path has obstacles
    const directObstacles = findObstacles(
      startStandoff.x, startStandoff.y,
      endStandoff.x, endStandoff.y,
      nodes, excludeIds
    )

    if (directObstacles.length === 0) {
      // Simple direct path: port -> standoff -> standoff -> port
      const path = [startPort, startStandoff, endStandoff, endEdge]
      const svgPath = `M${startPort.x},${startPort.y} L${startStandoff.x},${startStandoff.y} L${endStandoff.x},${endStandoff.y} L${endEdge.x},${endEdge.y}`

      // Mark the direct segment
      gridTracker.mark(startStandoff.x, startStandoff.y, endStandoff.x, endStandoff.y)

      return { path, svgPath, usedDetour: false }
    }

    // Route around obstacles for nearly straight paths
    const { minX, minY, maxX, maxY } = getObstacleBounds(directObstacles, OBSTACLE_MARGIN + 20)
    const signX = dx >= 0 ? 1 : -1
    const signY = dy >= 0 ? 1 : -1

    let path: Point[]
    let svgPath: string

    if (absDx >= absDy) {
      // More horizontal - jog vertically around obstacles
      const midY = signY >= 0 ? maxY : minY
      path = [startPort, startStandoff, { x: startStandoff.x, y: midY }, { x: endStandoff.x, y: midY }, endStandoff, endEdge]
      svgPath = `M${startPort.x},${startPort.y} L${startStandoff.x},${startStandoff.y} L${startStandoff.x},${midY} L${endStandoff.x},${midY} L${endStandoff.x},${endStandoff.y} L${endEdge.x},${endEdge.y}`

      gridTracker.mark(startStandoff.x, startStandoff.y, startStandoff.x, midY)
      gridTracker.mark(startStandoff.x, midY, endStandoff.x, midY)
      gridTracker.mark(endStandoff.x, midY, endStandoff.x, endStandoff.y)
    } else {
      // More vertical - jog horizontally around obstacles
      const midX = signX >= 0 ? maxX : minX
      path = [startPort, startStandoff, { x: midX, y: startStandoff.y }, { x: midX, y: endStandoff.y }, endStandoff, endEdge]
      svgPath = `M${startPort.x},${startPort.y} L${startStandoff.x},${startStandoff.y} L${midX},${startStandoff.y} L${midX},${endStandoff.y} L${endStandoff.x},${endStandoff.y} L${endEdge.x},${endEdge.y}`

      gridTracker.mark(startStandoff.x, startStandoff.y, midX, startStandoff.y)
      gridTracker.mark(midX, startStandoff.y, midX, endStandoff.y)
      gridTracker.mark(midX, endStandoff.y, endStandoff.x, endStandoff.y)
    }

    return { path, svgPath, usedDetour: true }
  }

  // Normal diagonal routing
  let foundFreePath = false
  let bestP1: Point = { x: 0, y: 0 }
  let bestP2: Point = { x: 0, y: 0 }

  // Try to find a free path with increasing offsets
  for (let tryOffset = 0; tryOffset <= 20; tryOffset++) {
    const offset =
      tryOffset === 0
        ? 0
        : (tryOffset % 2 === 1 ? 1 : -1) * Math.ceil(tryOffset / 2) * gridSize

    const { p1, p2 } = calculateDiagonalPoints(startStandoff, endStandoff, offset)

    if (checkDiagonalPathAvailable(startStandoff, p1, p2, endStandoff, gridTracker, nodes, excludeIds)) {
      bestP1 = p1
      bestP2 = p2
      foundFreePath = true
      break
    }
  }

  // If no free path found, check for obstacles and route around
  if (!foundFreePath) {
    const allObstacles = findObstaclesInRegion(
      Math.min(startStandoff.x, endStandoff.x),
      Math.min(startStandoff.y, endStandoff.y),
      Math.max(startStandoff.x, endStandoff.x),
      Math.max(startStandoff.y, endStandoff.y),
      nodes,
      excludeIds
    )

    if (allObstacles.length > 0) {
      // Route around obstacles with orthogonal path
      const { minX, minY, maxX, maxY } = getObstacleBounds(allObstacles, OBSTACLE_MARGIN + 20)
      const signX = dx >= 0 ? 1 : -1
      const signY = dy >= 0 ? 1 : -1

      let path: Point[]
      let svgPath: string

      if (isHorizDominant) {
        const midY = signY > 0 ? maxY : minY
        path = [startPort, startStandoff, { x: startStandoff.x, y: midY }, { x: endStandoff.x, y: midY }, endStandoff, endEdge]
        svgPath = `M${startPort.x},${startPort.y} L${startStandoff.x},${startStandoff.y} L${startStandoff.x},${midY} L${endStandoff.x},${midY} L${endStandoff.x},${endStandoff.y} L${endEdge.x},${endEdge.y}`

        gridTracker.mark(startStandoff.x, startStandoff.y, startStandoff.x, midY)
        gridTracker.mark(startStandoff.x, midY, endStandoff.x, midY)
        gridTracker.mark(endStandoff.x, midY, endStandoff.x, endStandoff.y)
      } else {
        const midX = signX > 0 ? maxX : minX
        path = [startPort, startStandoff, { x: midX, y: startStandoff.y }, { x: midX, y: endStandoff.y }, endStandoff, endEdge]
        svgPath = `M${startPort.x},${startPort.y} L${startStandoff.x},${startStandoff.y} L${midX},${startStandoff.y} L${midX},${endStandoff.y} L${endStandoff.x},${endStandoff.y} L${endEdge.x},${endEdge.y}`

        gridTracker.mark(startStandoff.x, startStandoff.y, midX, startStandoff.y)
        gridTracker.mark(midX, startStandoff.y, midX, endStandoff.y)
        gridTracker.mark(midX, endStandoff.y, endStandoff.x, endStandoff.y)
      }

      return { path, svgPath, usedDetour: true }
    }

    // No obstacles - use default position
    const { p1, p2 } = calculateDiagonalPoints(startStandoff, endStandoff, 0)
    bestP1 = p1
    bestP2 = p2
    foundFreePath = true
  }

  // FINAL VALIDATION: Check if the computed path intersects any obstacles
  // This catches cases where checkDiagonalPathAvailable incorrectly returns true
  const finalPath = [startStandoff, bestP1, bestP2, endStandoff]
  let hasObstacle = false
  for (let i = 0; i < finalPath.length - 1; i++) {
    const p1 = finalPath[i]
    const p2 = finalPath[i + 1]
    const obs = findObstacles(p1.x, p1.y, p2.x, p2.y, nodes, excludeIds)
    if (obs.length > 0) {
      hasObstacle = true
      break
    }
  }

  if (hasObstacle) {
    // Force a detour around ALL obstacles in the region
    const allObstacles = findObstaclesInRegion(
      Math.min(startStandoff.x, endStandoff.x, bestP1.x, bestP2.x) - 50,
      Math.min(startStandoff.y, endStandoff.y, bestP1.y, bestP2.y) - 50,
      Math.max(startStandoff.x, endStandoff.x, bestP1.x, bestP2.x) + 50,
      Math.max(startStandoff.y, endStandoff.y, bestP1.y, bestP2.y) + 50,
      nodes,
      excludeIds
    )

    if (allObstacles.length > 0) {
      const { minX, minY, maxX, maxY } = getObstacleBounds(allObstacles, OBSTACLE_MARGIN + 30)
      const signX = dx >= 0 ? 1 : -1
      const signY = dy >= 0 ? 1 : -1

      let path: Point[]
      let svgPath: string

      if (isHorizDominant) {
        const midY = signY > 0 ? maxY : minY
        path = [startPort, startStandoff, { x: startStandoff.x, y: midY }, { x: endStandoff.x, y: midY }, endStandoff, endEdge]
        svgPath = `M${startPort.x},${startPort.y} L${startStandoff.x},${startStandoff.y} L${startStandoff.x},${midY} L${endStandoff.x},${midY} L${endStandoff.x},${endStandoff.y} L${endEdge.x},${endEdge.y}`

        gridTracker.mark(startStandoff.x, startStandoff.y, startStandoff.x, midY)
        gridTracker.mark(startStandoff.x, midY, endStandoff.x, midY)
        gridTracker.mark(endStandoff.x, midY, endStandoff.x, endStandoff.y)
      } else {
        const midX = signX > 0 ? maxX : minX
        path = [startPort, startStandoff, { x: midX, y: startStandoff.y }, { x: midX, y: endStandoff.y }, endStandoff, endEdge]
        svgPath = `M${startPort.x},${startPort.y} L${startStandoff.x},${startStandoff.y} L${midX},${startStandoff.y} L${midX},${endStandoff.y} L${endStandoff.x},${endStandoff.y} L${endEdge.x},${endEdge.y}`

        gridTracker.mark(startStandoff.x, startStandoff.y, midX, startStandoff.y)
        gridTracker.mark(midX, startStandoff.y, midX, endStandoff.y)
        gridTracker.mark(midX, endStandoff.y, endStandoff.x, endStandoff.y)
      }

      return { path, svgPath, usedDetour: true }
    }
  }

  // Mark all segments
  gridTracker.mark(startStandoff.x, startStandoff.y, bestP1.x, bestP1.y)
  if (Math.abs(bestP1.x - bestP2.x) > 1 || Math.abs(bestP1.y - bestP2.y) > 1) {
    gridTracker.markDiagonal(bestP1.x, bestP1.y, bestP2.x, bestP2.y)
  }
  gridTracker.mark(bestP2.x, bestP2.y, endStandoff.x, endStandoff.y)

  const path = [startPort, startStandoff, bestP1, bestP2, endStandoff, endEdge]
  const svgPath = `M${startPort.x},${startPort.y} L${startStandoff.x},${startStandoff.y} L${bestP1.x},${bestP1.y} L${bestP2.x},${bestP2.y} L${endStandoff.x},${endStandoff.y} L${endEdge.x},${endEdge.y}`

  return { path, svgPath, usedDetour: false }
}

/**
 * Verify that a path only uses 45° and 90° angles
 */
export function validateDiagonalPath(path: Point[]): boolean {
  for (let i = 0; i < path.length - 1; i++) {
    const p1 = path[i]
    const p2 = path[i + 1]
    const dx = p2.x - p1.x
    const dy = p2.y - p1.y

    // Skip very short segments
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue

    const absDx = Math.abs(dx)
    const absDy = Math.abs(dy)

    // Horizontal
    if (absDy < 1) continue

    // Vertical
    if (absDx < 1) continue

    // Diagonal: ratio should be ~1
    const ratio = absDx / absDy
    if (ratio < 0.9 || ratio > 1.1) {
      return false
    }
  }

  return true
}
