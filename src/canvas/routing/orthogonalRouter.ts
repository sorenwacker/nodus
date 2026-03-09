/**
 * Orthogonal routing with 90-degree angles only
 *
 * Path structure: horizontal/vertical segments only
 * Uses grid tracking to prevent overlapping edges
 *
 * For horizontal-start paths:
 *   startStandoff --horizontal--> midPoint --vertical--> midPoint2 --horizontal--> endStandoff
 *
 * For vertical-start paths:
 *   startStandoff --vertical--> midPoint --horizontal--> midPoint2 --vertical--> endStandoff
 */

import type { Point, NodeRect, Side } from './types'
import { GridTracker } from './gridTracker'
import {
  findObstacles,
  findObstaclesInRegion,
  getObstacleBounds,
  OBSTACLE_MARGIN,
} from './obstacleAvoider'

export interface OrthogonalRouteResult {
  path: Point[]
  svgPath: string
  usedDetour: boolean
}

export interface OrthogonalRouteParams {
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

/**
 * Check if all three segments of an orthogonal path are free
 */
function checkOrthogonalPathAvailable(
  startStandoff: Point,
  mid1: Point,
  mid2: Point,
  endStandoff: Point,
  isHorizontalStart: boolean,
  gridTracker: GridTracker,
  nodes: NodeRect[] | Map<string, NodeRect>,
  excludeIds: Set<string>
): boolean {
  // Check all segments for obstacles FIRST (most important)
  const seg1Obs = findObstacles(startStandoff.x, startStandoff.y, mid1.x, mid1.y, nodes, excludeIds)
  if (seg1Obs.length > 0) return false

  const seg2Obs = findObstacles(mid1.x, mid1.y, mid2.x, mid2.y, nodes, excludeIds)
  if (seg2Obs.length > 0) return false

  const seg3Obs = findObstacles(mid2.x, mid2.y, endStandoff.x, endStandoff.y, nodes, excludeIds)
  if (seg3Obs.length > 0) return false

  // Grid placement checks
  if (!gridTracker.canPlace(startStandoff.x, startStandoff.y, mid1.x, mid1.y)) {
    return false
  }
  if (!gridTracker.canPlace(mid1.x, mid1.y, mid2.x, mid2.y)) {
    return false
  }
  if (!gridTracker.canPlace(mid2.x, mid2.y, endStandoff.x, endStandoff.y)) {
    return false
  }

  return true
}

/**
 * Route an orthogonal edge with obstacle avoidance and grid tracking
 */
export function routeOrthogonal(params: OrthogonalRouteParams): OrthogonalRouteResult {
  const {
    startPort,
    startStandoff,
    endPort,
    endStandoff,
    sourceSide,
    targetSide,
    nodes,
    excludeIds,
    gridTracker,
    arrowOffset = 0,
  } = params

  const dx = endStandoff.x - startStandoff.x
  const dy = endStandoff.y - startStandoff.y
  const isHorizontalStart = sourceSide === 'left' || sourceSide === 'right'
  const isHorizontalEnd = targetSide === 'left' || targetSide === 'right'

  // Adjust end port for arrow head
  let endEdge = { ...endPort }
  if (arrowOffset > 0) {
    if (targetSide === 'left') endEdge.x += arrowOffset
    else if (targetSide === 'right') endEdge.x -= arrowOffset
    else if (targetSide === 'top') endEdge.y += arrowOffset
    else if (targetSide === 'bottom') endEdge.y -= arrowOffset
  }

  const gridSize = gridTracker.getGridSize()
  let path: Point[]
  let svgPath: string
  let usedDetour = false

  // ==========================================================================
  // TRY SIMPLE PATHS FIRST (fewer segments = fewer crossings)
  // ==========================================================================

  // Case 1: STRAIGHT LINE - standoffs are aligned
  // e.g., both exit bottom/top and have same X, or both exit left/right and have same Y
  const alignedX = Math.abs(startStandoff.x - endStandoff.x) < 5
  const alignedY = Math.abs(startStandoff.y - endStandoff.y) < 5

  if (alignedX && !isHorizontalStart && !isHorizontalEnd) {
    // Vertical straight line (top/bottom to top/bottom, same X)
    const obs = findObstacles(startStandoff.x, startStandoff.y, endStandoff.x, endStandoff.y, nodes, excludeIds)
    if (obs.length === 0 && gridTracker.canPlace(startStandoff.x, startStandoff.y, endStandoff.x, endStandoff.y)) {
      gridTracker.mark(startStandoff.x, startStandoff.y, endStandoff.x, endStandoff.y)
      path = [startPort, startStandoff, endStandoff, endEdge]
      svgPath = `M${startPort.x},${startPort.y} L${startStandoff.x},${startStandoff.y} L${endStandoff.x},${endStandoff.y} L${endEdge.x},${endEdge.y}`
      return { path, svgPath, usedDetour: false }
    }
  }

  if (alignedY && isHorizontalStart && isHorizontalEnd) {
    // Horizontal straight line (left/right to left/right, same Y)
    const obs = findObstacles(startStandoff.x, startStandoff.y, endStandoff.x, endStandoff.y, nodes, excludeIds)
    if (obs.length === 0 && gridTracker.canPlace(startStandoff.x, startStandoff.y, endStandoff.x, endStandoff.y)) {
      gridTracker.mark(startStandoff.x, startStandoff.y, endStandoff.x, endStandoff.y)
      path = [startPort, startStandoff, endStandoff, endEdge]
      svgPath = `M${startPort.x},${startPort.y} L${startStandoff.x},${startStandoff.y} L${endStandoff.x},${endStandoff.y} L${endEdge.x},${endEdge.y}`
      return { path, svgPath, usedDetour: false }
    }
  }

  // Case 2: L-SHAPE (2 segments) - when source is horizontal and target is vertical (or vice versa)
  // The corner point is where they naturally meet
  if (isHorizontalStart !== isHorizontalEnd) {
    // One exits horizontal, one exits vertical - perfect for L-shape
    const corner: Point = isHorizontalStart
      ? { x: endStandoff.x, y: startStandoff.y }  // horizontal first, then vertical
      : { x: startStandoff.x, y: endStandoff.y }  // vertical first, then horizontal

    const seg1Obs = findObstacles(startStandoff.x, startStandoff.y, corner.x, corner.y, nodes, excludeIds)
    const seg2Obs = findObstacles(corner.x, corner.y, endStandoff.x, endStandoff.y, nodes, excludeIds)

    if (seg1Obs.length === 0 && seg2Obs.length === 0) {
      const canPlace1 = gridTracker.canPlace(startStandoff.x, startStandoff.y, corner.x, corner.y)
      const canPlace2 = gridTracker.canPlace(corner.x, corner.y, endStandoff.x, endStandoff.y)

      if (canPlace1 && canPlace2) {
        gridTracker.mark(startStandoff.x, startStandoff.y, corner.x, corner.y)
        gridTracker.mark(corner.x, corner.y, endStandoff.x, endStandoff.y)
        path = [startPort, startStandoff, corner, endStandoff, endEdge]
        svgPath = `M${startPort.x},${startPort.y} L${startStandoff.x},${startStandoff.y} L${corner.x},${corner.y} L${endStandoff.x},${endStandoff.y} L${endEdge.x},${endEdge.y}`
        return { path, svgPath, usedDetour: false }
      }
    }
  }

  // ==========================================================================
  // FALLBACK: 3-segment path (U-shape or Z-shape)
  // ==========================================================================

  if (isHorizontalStart) {
    // Start horizontal, then vertical, then horizontal
    // Path: startStandoff -> (midX, startStandoff.y) -> (midX, endStandoff.y) -> endStandoff

    const idealMidX = startStandoff.x + dx / 2
    let foundFreePath = false
    let bestMidX = idealMidX

    // Try to find a free path with increasing offsets
    for (let tryOffset = 0; tryOffset <= 20; tryOffset++) {
      const offset =
        tryOffset === 0
          ? 0
          : (tryOffset % 2 === 1 ? 1 : -1) * Math.ceil(tryOffset / 2) * gridSize

      const midX = gridTracker.snap(idealMidX + offset)
      const mid1: Point = { x: midX, y: startStandoff.y }
      const mid2: Point = { x: midX, y: endStandoff.y }

      if (checkOrthogonalPathAvailable(startStandoff, mid1, mid2, endStandoff, true, gridTracker, nodes, excludeIds)) {
        bestMidX = midX
        foundFreePath = true
        break
      }
    }

    if (!foundFreePath) {
      // Check if there are obstacles and route around them
      const firstHorizObstacles = findObstacles(startStandoff.x, startStandoff.y, bestMidX, startStandoff.y, nodes, excludeIds)
      const vertObstacles = findObstacles(bestMidX, startStandoff.y, bestMidX, endStandoff.y, nodes, excludeIds)
      const lastHorizObstacles = findObstacles(bestMidX, endStandoff.y, endStandoff.x, endStandoff.y, nodes, excludeIds)

      if (firstHorizObstacles.length > 0 || vertObstacles.length > 0 || lastHorizObstacles.length > 0) {
        const allObs = [...firstHorizObstacles, ...vertObstacles, ...lastHorizObstacles]
        const { minX, maxX } = getObstacleBounds(allObs, OBSTACLE_MARGIN)
        bestMidX = dx > 0 ? maxX + 20 : minX - 20
        usedDetour = true
      }
    }

    let mid1: Point = { x: bestMidX, y: startStandoff.y }
    let mid2: Point = { x: bestMidX, y: endStandoff.y }

    // FINAL VALIDATION: Check if the computed path still intersects obstacles
    const finalSegments = [
      [startStandoff, mid1],
      [mid1, mid2],
      [mid2, endStandoff]
    ]
    let hasObstacle = false
    for (let i = 0; i < finalSegments.length; i++) {
      const [p1, p2] = finalSegments[i]
      const obs = findObstacles(p1.x, p1.y, p2.x, p2.y, nodes, excludeIds)
      if (obs.length > 0) {
        hasObstacle = true
        break
      }
    }

    if (hasObstacle) {
      // Find the ACTUAL blocking obstacles on each segment
      const blockingObstacles: NodeRect[] = []
      for (const [p1, p2] of finalSegments) {
        const obs = findObstacles(p1.x, p1.y, p2.x, p2.y, nodes, excludeIds)
        for (const o of obs) {
          if (!blockingObstacles.find(b => b.id === o.id)) {
            blockingObstacles.push(o)
          }
        }
      }

      if (blockingObstacles.length > 0) {
        const bounds = getObstacleBounds(blockingObstacles, OBSTACLE_MARGIN + 30)

        // Calculate distances to go above or below
        const distAbove = Math.abs(Math.min(startStandoff.y, endStandoff.y) - bounds.minY)
        const distBelow = Math.abs(Math.max(startStandoff.y, endStandoff.y) - bounds.maxY)

        // For horizontal-start paths, prefer going above or below
        if (distAbove <= distBelow) {
          mid1 = { x: startStandoff.x, y: bounds.minY }
          mid2 = { x: endStandoff.x, y: bounds.minY }
        } else {
          mid1 = { x: startStandoff.x, y: bounds.maxY }
          mid2 = { x: endStandoff.x, y: bounds.maxY }
        }
        usedDetour = true
      }
    }

    // Mark all segments (after final calculation)
    gridTracker.mark(startStandoff.x, startStandoff.y, mid1.x, mid1.y)
    gridTracker.mark(mid1.x, mid1.y, mid2.x, mid2.y)
    gridTracker.mark(mid2.x, mid2.y, endStandoff.x, endStandoff.y)

    path = [startPort, startStandoff, mid1, mid2, endStandoff, endEdge]
    svgPath = `M${startPort.x},${startPort.y} L${startStandoff.x},${startStandoff.y} L${mid1.x},${mid1.y} L${mid2.x},${mid2.y} L${endStandoff.x},${endStandoff.y} L${endEdge.x},${endEdge.y}`

  } else {
    // Start vertical, then horizontal, then vertical
    // Path: startStandoff -> (startStandoff.x, midY) -> (endStandoff.x, midY) -> endStandoff

    const idealMidY = startStandoff.y + dy / 2
    let foundFreePath = false
    let bestMidY = idealMidY

    // Try to find a free path with increasing offsets
    for (let tryOffset = 0; tryOffset <= 20; tryOffset++) {
      const offset =
        tryOffset === 0
          ? 0
          : (tryOffset % 2 === 1 ? 1 : -1) * Math.ceil(tryOffset / 2) * gridSize

      const midY = gridTracker.snap(idealMidY + offset)
      const mid1: Point = { x: startStandoff.x, y: midY }
      const mid2: Point = { x: endStandoff.x, y: midY }

      if (checkOrthogonalPathAvailable(startStandoff, mid1, mid2, endStandoff, false, gridTracker, nodes, excludeIds)) {
        bestMidY = midY
        foundFreePath = true
        break
      }
    }

    if (!foundFreePath) {
      // Check if there are obstacles and route around them
      const firstVertObstacles = findObstacles(startStandoff.x, startStandoff.y, startStandoff.x, bestMidY, nodes, excludeIds)
      const horizObstacles = findObstacles(startStandoff.x, bestMidY, endStandoff.x, bestMidY, nodes, excludeIds)
      const lastVertObstacles = findObstacles(endStandoff.x, bestMidY, endStandoff.x, endStandoff.y, nodes, excludeIds)

      if (firstVertObstacles.length > 0 || horizObstacles.length > 0 || lastVertObstacles.length > 0) {
        const allObs = [...firstVertObstacles, ...horizObstacles, ...lastVertObstacles]
        const { minY, maxY } = getObstacleBounds(allObs, OBSTACLE_MARGIN)
        bestMidY = dy > 0 ? maxY + 20 : minY - 20
        usedDetour = true
      }
    }

    let mid1: Point = { x: startStandoff.x, y: bestMidY }
    let mid2: Point = { x: endStandoff.x, y: bestMidY }

    // FINAL VALIDATION: Check if the computed path still intersects obstacles
    const finalSegments = [
      [startStandoff, mid1],
      [mid1, mid2],
      [mid2, endStandoff]
    ]
    let hasObstacle = false
    for (let i = 0; i < finalSegments.length; i++) {
      const [p1, p2] = finalSegments[i]
      const obs = findObstacles(p1.x, p1.y, p2.x, p2.y, nodes, excludeIds)
      if (obs.length > 0) {
        hasObstacle = true
        break
      }
    }

    if (hasObstacle) {
      // Find all obstacles in the region and route completely around
      const allObstacles = findObstaclesInRegion(
        Math.min(startStandoff.x, endStandoff.x, mid1.x, mid2.x) - 50,
        Math.min(startStandoff.y, endStandoff.y, mid1.y, mid2.y) - 50,
        Math.max(startStandoff.x, endStandoff.x, mid1.x, mid2.x) + 50,
        Math.max(startStandoff.y, endStandoff.y, mid1.y, mid2.y) + 50,
        nodes,
        excludeIds
      )
      if (allObstacles.length > 0) {
        const bounds = getObstacleBounds(allObstacles, OBSTACLE_MARGIN + 30)

        // Decide whether to go around horizontally or vertically
        const goLeftOrRight = bounds.minX > Math.min(startStandoff.x, endStandoff.x) ||
                              bounds.maxX < Math.max(startStandoff.x, endStandoff.x)

        if (goLeftOrRight) {
          // Go left or right of the obstacle
          const goLeft = Math.abs(startStandoff.x - bounds.minX) < Math.abs(startStandoff.x - bounds.maxX)
          const detourX = goLeft ? bounds.minX : bounds.maxX
          mid1 = { x: detourX, y: startStandoff.y }
          mid2 = { x: detourX, y: endStandoff.y }
        } else {
          // Go above or below
          bestMidY = dy > 0 ? bounds.maxY : bounds.minY
          mid1 = { x: startStandoff.x, y: bestMidY }
          mid2 = { x: endStandoff.x, y: bestMidY }
        }
        usedDetour = true
      }
    }

    // Mark all segments
    gridTracker.mark(startStandoff.x, startStandoff.y, mid1.x, mid1.y)
    gridTracker.mark(mid1.x, mid1.y, mid2.x, mid2.y)
    gridTracker.mark(mid2.x, mid2.y, endStandoff.x, endStandoff.y)

    path = [startPort, startStandoff, mid1, mid2, endStandoff, endEdge]
    svgPath = `M${startPort.x},${startPort.y} L${startStandoff.x},${startStandoff.y} L${mid1.x},${mid1.y} L${mid2.x},${mid2.y} L${endStandoff.x},${endStandoff.y} L${endEdge.x},${endEdge.y}`
  }

  return { path, svgPath, usedDetour }
}

/**
 * Verify that a path only uses 90-degree angles
 */
export function validateOrthogonalPath(path: Point[]): boolean {
  for (let i = 0; i < path.length - 1; i++) {
    const p1 = path[i]
    const p2 = path[i + 1]
    const dx = p2.x - p1.x
    const dy = p2.y - p1.y

    // Skip very short segments
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue

    // Check for valid orthogonal: either dx or dy should be ~0
    const absDx = Math.abs(dx)
    const absDy = Math.abs(dy)

    // Horizontal
    if (absDy < 1) continue

    // Vertical
    if (absDx < 1) continue

    // Neither horizontal nor vertical - invalid
    return false
  }

  return true
}
