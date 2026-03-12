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
}

// Minimum diagonal distance for meaningful 45° segment
const MIN_DIAG_DIST = 10

/**
 * Check if a path contains any 180-degree turns (reversing direction)
 */
function has180DegreeTurn(path: Point[]): boolean {
  for (let i = 0; i < path.length - 2; i++) {
    const p1 = path[i]
    const p2 = path[i + 1]
    const p3 = path[i + 2]

    const dx1 = p2.x - p1.x
    const dy1 = p2.y - p1.y
    const dx2 = p3.x - p2.x
    const dy2 = p3.y - p2.y

    // Skip zero-length segments
    const len1 = Math.abs(dx1) + Math.abs(dy1)
    const len2 = Math.abs(dx2) + Math.abs(dy2)
    if (len1 < 1 || len2 < 1) continue

    // Check for 180-degree turn (direction reversal)
    // Horizontal reversal
    if (Math.abs(dy1) < 1 && Math.abs(dy2) < 1) {
      if ((dx1 > 0 && dx2 < 0) || (dx1 < 0 && dx2 > 0)) {
        return true
      }
    }
    // Vertical reversal
    if (Math.abs(dx1) < 1 && Math.abs(dx2) < 1) {
      if ((dy1 > 0 && dy2 < 0) || (dy1 < 0 && dy2 > 0)) {
        return true
      }
    }
  }
  return false
}

// Minimum orthogonal segment length before/after diagonal
// Must be longer than arrow for clean entry/exit
const MIN_ORTHO_SEGMENT = 40

/** Build SVG path string from points */
function buildSvgPath(path: Point[]): string {
  if (path.length === 0) return ''
  return `M${path[0].x},${path[0].y}` + path.slice(1).map(p => ` L${p.x},${p.y}`).join('')
}

/** Route around obstacles with orthogonal detour */
function buildObstacleDetour(
  startPort: Point,
  startStandoff: Point,
  endStandoff: Point,
  endEdge: Point,
  obstacles: NodeRect[],
  isHorizDominant: boolean,
  dx: number,
  dy: number,
  gridTracker: GridTracker,
  margin: number = OBSTACLE_MARGIN + 20
): DiagonalRouteResult {
  const { minX, minY, maxX, maxY } = getObstacleBounds(obstacles, margin)
  const signX = dx >= 0 ? 1 : -1
  const signY = dy >= 0 ? 1 : -1

  let path: Point[]

  if (isHorizDominant) {
    const midY = signY > 0 ? maxY : minY
    path = [startPort, startStandoff, { x: startStandoff.x, y: midY }, { x: endStandoff.x, y: midY }, endStandoff, endEdge]
    gridTracker.mark(startStandoff.x, startStandoff.y, startStandoff.x, midY)
    gridTracker.mark(startStandoff.x, midY, endStandoff.x, midY)
    gridTracker.mark(endStandoff.x, midY, endStandoff.x, endStandoff.y)
  } else {
    const midX = signX > 0 ? maxX : minX
    path = [startPort, startStandoff, { x: midX, y: startStandoff.y }, { x: midX, y: endStandoff.y }, endStandoff, endEdge]
    gridTracker.mark(startStandoff.x, startStandoff.y, midX, startStandoff.y)
    gridTracker.mark(midX, startStandoff.y, midX, endStandoff.y)
    gridTracker.mark(midX, endStandoff.y, endStandoff.x, endStandoff.y)
  }

  return { path, svgPath: buildSvgPath(path), usedDetour: true }
}

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
    sourceSide,
    targetSide,
  } = params

  const dx = endStandoff.x - startStandoff.x
  const dy = endStandoff.y - startStandoff.y
  const absDx = Math.abs(dx)
  const absDy = Math.abs(dy)
  const isHorizDominant = absDx >= absDy

  // Adjust end port for arrow head
  const endEdge = { ...endPort }
  if (arrowOffset > 0) {
    if (targetSide === 'left') endEdge.x += arrowOffset
    else if (targetSide === 'right') endEdge.x -= arrowOffset
    else if (targetSide === 'top') endEdge.y += arrowOffset
    else if (targetSide === 'bottom') endEdge.y -= arrowOffset
  }

  // Detect 180-degree turn situations (crossed standoffs)
  // This happens when the standoff extends in the wrong direction
  const crossedX = (sourceSide === 'right' && startStandoff.x > endStandoff.x) ||
                   (sourceSide === 'left' && startStandoff.x < endStandoff.x)
  const crossedY = (sourceSide === 'bottom' && startStandoff.y > endStandoff.y) ||
                   (sourceSide === 'top' && startStandoff.y < endStandoff.y)

  // If crossed, route directly between ports with a simple midpoint
  if (crossedX || crossedY) {
    const midX = (startPort.x + endPort.x) / 2
    const midY = (startPort.y + endPort.y) / 2
    let path: Point[]
    let svgPath: string

    if (crossedX) {
      // Go vertical first, then horizontal
      path = [startPort, { x: startPort.x, y: midY }, { x: endPort.x, y: midY }, endEdge]
      svgPath = `M${startPort.x},${startPort.y} L${startPort.x},${midY} L${endPort.x},${midY} L${endEdge.x},${endEdge.y}`
    } else {
      // Go horizontal first, then vertical
      path = [startPort, { x: midX, y: startPort.y }, { x: midX, y: endPort.y }, endEdge]
      svgPath = `M${startPort.x},${startPort.y} L${midX},${startPort.y} L${midX},${endPort.y} L${endEdge.x},${endEdge.y}`
    }

    return { path, svgPath, usedDetour: false }
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
    return buildObstacleDetour(
      startPort, startStandoff, endStandoff, endEdge,
      directObstacles, absDx >= absDy, dx, dy, gridTracker
    )
  }

  // Normal diagonal routing
  let foundFreePath = false
  let bestP1: Point = { x: 0, y: 0 }
  let bestP2: Point = { x: 0, y: 0 }

  // Try to find a free path with increasing offsets (more aggressive search)
  for (let tryOffset = 0; tryOffset <= 30; tryOffset++) {
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
      return buildObstacleDetour(
        startPort, startStandoff, endStandoff, endEdge,
        allObstacles, isHorizDominant, dx, dy, gridTracker
      )
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
      return buildObstacleDetour(
        startPort, startStandoff, endStandoff, endEdge,
        allObstacles, isHorizDominant, dx, dy, gridTracker,
        OBSTACLE_MARGIN + 30
      )
    }
  }

  // Mark all segments
  gridTracker.mark(startStandoff.x, startStandoff.y, bestP1.x, bestP1.y)
  if (Math.abs(bestP1.x - bestP2.x) > 1 || Math.abs(bestP1.y - bestP2.y) > 1) {
    gridTracker.markDiagonal(bestP1.x, bestP1.y, bestP2.x, bestP2.y)
  }
  gridTracker.mark(bestP2.x, bestP2.y, endStandoff.x, endStandoff.y)

  const path = [startPort, startStandoff, bestP1, bestP2, endStandoff, endEdge]

  // Final check for 180-degree turns - if found, use simple direct path
  if (has180DegreeTurn(path)) {
    const midX = (startPort.x + endEdge.x) / 2
    const midY = (startPort.y + endEdge.y) / 2
    const isHorizontalStart = sourceSide === 'left' || sourceSide === 'right'
    const directPath = isHorizontalStart
      ? [startPort, { x: midX, y: startPort.y }, { x: midX, y: endEdge.y }, endEdge]
      : [startPort, { x: startPort.x, y: midY }, { x: endEdge.x, y: midY }, endEdge]
    return { path: directPath, svgPath: buildSvgPath(directPath), usedDetour: true }
  }

  return { path, svgPath: buildSvgPath(path), usedDetour: false }
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
