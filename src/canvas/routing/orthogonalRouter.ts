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
  skipGridCheck?: boolean
  /** Offset for the middle channel to create parallel non-overlapping edges */
  channelOffset?: number
}

/**
 * Route an orthogonal edge with obstacle avoidance
 *
 * Uses ideal midpoint for the middle channel. Port spreading already
 * separates edges from the same source, so grid-based offsets are not
 * needed for symmetric fan-out.
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
    channelOffset = 0,
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

  let path: Point[]
  let svgPath: string
  let usedDetour = false

  // ==========================================================================
  // SPECIAL CASE: Adjacent nodes with crossing standoffs
  // When nodes are close together, standoffs can cross over each other.
  // In this case, use a simple direct connection with minimal jog.
  // ==========================================================================

  // Detect if standoffs have crossed (going the wrong direction)
  const standoffsCrossedX = (sourceSide === 'right' && startStandoff.x > endStandoff.x) ||
                            (sourceSide === 'left' && startStandoff.x < endStandoff.x)
  const standoffsCrossedY = (sourceSide === 'bottom' && startStandoff.y > endStandoff.y) ||
                            (sourceSide === 'top' && startStandoff.y < endStandoff.y)

  if (standoffsCrossedX && isHorizontalStart && isHorizontalEnd) {
    // Adjacent horizontal nodes - use simple jog between ports
    const midX = (startPort.x + endPort.x) / 2
    const mid1: Point = { x: midX, y: startPort.y }
    const mid2: Point = { x: midX, y: endPort.y }

    gridTracker.mark(startPort.x, startPort.y, mid1.x, mid1.y)
    gridTracker.mark(mid1.x, mid1.y, mid2.x, mid2.y)
    gridTracker.mark(mid2.x, mid2.y, endEdge.x, endEdge.y)

    path = [startPort, mid1, mid2, endEdge]
    svgPath = `M${startPort.x},${startPort.y} L${mid1.x},${mid1.y} L${mid2.x},${mid2.y} L${endEdge.x},${endEdge.y}`
    return { path, svgPath, usedDetour: false }
  }

  if (standoffsCrossedY && !isHorizontalStart && !isHorizontalEnd) {
    // Adjacent vertical nodes - use simple jog between ports
    const midY = (startPort.y + endPort.y) / 2
    const mid1: Point = { x: startPort.x, y: midY }
    const mid2: Point = { x: endPort.x, y: midY }

    gridTracker.mark(startPort.x, startPort.y, mid1.x, mid1.y)
    gridTracker.mark(mid1.x, mid1.y, mid2.x, mid2.y)
    gridTracker.mark(mid2.x, mid2.y, endEdge.x, endEdge.y)

    path = [startPort, mid1, mid2, endEdge]
    svgPath = `M${startPort.x},${startPort.y} L${mid1.x},${mid1.y} L${mid2.x},${mid2.y} L${endEdge.x},${endEdge.y}`
    return { path, svgPath, usedDetour: false }
  }

  // ==========================================================================
  // TRY SIMPLE PATHS FIRST (fewer segments = fewer crossings)
  // ==========================================================================

  // Case 1: STRAIGHT LINE - standoffs are aligned
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
  if (isHorizontalStart !== isHorizontalEnd) {
    const corner: Point = isHorizontalStart
      ? { x: endStandoff.x, y: startStandoff.y }
      : { x: startStandoff.x, y: endStandoff.y }

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
  //
  // SIMPLIFIED APPROACH: Use ideal midpoint, only offset for obstacles.
  // Port spreading already separates edges from the same source, so we don't
  // need grid-based offsets for the middle channel. This produces symmetric
  // fan-out patterns with minimal crossings.
  // ==========================================================================

  if (isHorizontalStart) {
    // Start horizontal, then vertical, then horizontal
    // Path: startStandoff -> (midX, startStandoff.y) -> (midX, endStandoff.y) -> endStandoff

    // Check if standoffs are at similar Y (nearly horizontal connection)
    const nearlyAlignedY = Math.abs(startStandoff.y - endStandoff.y) < 30

    if (nearlyAlignedY) {
      // For nearly horizontal connections, check for obstacles on direct path
      const directObs = findObstacles(startStandoff.x, startStandoff.y, endStandoff.x, endStandoff.y, nodes, excludeIds)

      if (directObs.length === 0) {
        // No obstacles - use direct path (may have small jog if Y differs slightly)
        const mid1: Point = { x: (startStandoff.x + endStandoff.x) / 2, y: startStandoff.y }
        const mid2: Point = { x: mid1.x, y: endStandoff.y }

        gridTracker.mark(startStandoff.x, startStandoff.y, mid1.x, mid1.y)
        if (Math.abs(mid1.y - mid2.y) > 1) {
          gridTracker.mark(mid1.x, mid1.y, mid2.x, mid2.y)
        }
        gridTracker.mark(mid2.x, mid2.y, endStandoff.x, endStandoff.y)

        path = [startPort, startStandoff, mid1, mid2, endStandoff, endEdge]
        svgPath = `M${startPort.x},${startPort.y} L${startStandoff.x},${startStandoff.y} L${mid1.x},${mid1.y} L${mid2.x},${mid2.y} L${endStandoff.x},${endStandoff.y} L${endEdge.x},${endEdge.y}`
        return { path, svgPath, usedDetour: false }
      } else {
        // Obstacles on horizontal path - route VERTICALLY around them
        const bounds = getObstacleBounds(directObs, OBSTACLE_MARGIN + 20)
        const avgY = (startStandoff.y + endStandoff.y) / 2

        // Decide to go above or below based on distance
        const distAbove = Math.abs(avgY - bounds.minY)
        const distBelow = Math.abs(bounds.maxY - avgY)
        const detourY = distAbove < distBelow ? bounds.minY : bounds.maxY

        // Create path that routes around obstacles vertically
        const corner1: Point = { x: startStandoff.x, y: detourY }
        const corner2: Point = { x: endStandoff.x, y: detourY }

        gridTracker.mark(startStandoff.x, startStandoff.y, corner1.x, corner1.y)
        gridTracker.mark(corner1.x, corner1.y, corner2.x, corner2.y)
        gridTracker.mark(corner2.x, corner2.y, endStandoff.x, endStandoff.y)

        path = [startPort, startStandoff, corner1, corner2, endStandoff, endEdge]
        svgPath = `M${startPort.x},${startPort.y} L${startStandoff.x},${startStandoff.y} L${corner1.x},${corner1.y} L${corner2.x},${corner2.y} L${endStandoff.x},${endStandoff.y} L${endEdge.x},${endEdge.y}`
        return { path, svgPath, usedDetour: true }
      }
    }

    // Standard case: significant Y difference
    let bestMidX = gridTracker.snap(startStandoff.x + dx / 2)

    // Check for obstacles on the ideal path and find clear route
    const checkPath = (midX: number): NodeRect[] => {
      return [
        ...findObstacles(startStandoff.x, startStandoff.y, midX, startStandoff.y, nodes, excludeIds),
        ...findObstacles(midX, startStandoff.y, midX, endStandoff.y, nodes, excludeIds),
        ...findObstacles(midX, endStandoff.y, endStandoff.x, endStandoff.y, nodes, excludeIds)
      ]
    }

    let obstacles = checkPath(bestMidX)
    if (obstacles.length > 0) {
      // Try routing around obstacles by going further in the direction of travel
      const allBounds = getObstacleBounds(obstacles, OBSTACLE_MARGIN + 20)
      const tryMidX = dx > 0 ? allBounds.maxX : allBounds.minX
      const newObs = checkPath(tryMidX)
      if (newObs.length === 0) {
        bestMidX = tryMidX
        usedDetour = true
      } else {
        // Still have obstacles, try the opposite side
        const altMidX = dx > 0 ? allBounds.minX : allBounds.maxX
        const altObs = checkPath(altMidX)
        if (altObs.length === 0) {
          bestMidX = altMidX
          usedDetour = true
        } else {
          // Use the direction that clears most obstacles
          bestMidX = newObs.length <= altObs.length ? tryMidX : altMidX
          usedDetour = true
        }
      }
    }

    // Apply channelOffset to create parallel non-overlapping paths.
    // The offset is based on port assignment, so edges to the same target
    // get different X values for their vertical segments.
    let adjustedMidX = bestMidX + channelOffset

    // Check if the adjusted path has obstacles BEFORE clamping
    let adjustedObstacles = checkPath(adjustedMidX)

    // Try to clamp midX to stay between source and target (prevents backwards paths)
    // BUT only if clamping doesn't cause obstacle collision
    const minX = Math.min(startStandoff.x, endStandoff.x)
    const maxX = Math.max(startStandoff.x, endStandoff.x)
    const clampedMidX = Math.max(minX, Math.min(maxX, adjustedMidX))

    // Only use clamped value if it doesn't introduce obstacles
    if (adjustedMidX !== clampedMidX) {
      const clampedObstacles = checkPath(clampedMidX)
      if (clampedObstacles.length === 0 || clampedObstacles.length <= adjustedObstacles.length) {
        adjustedMidX = clampedMidX
        adjustedObstacles = clampedObstacles
      }
      // Otherwise keep the unclamped midX to avoid obstacles
    }

    // If there are still obstacles, try to route around them
    if (adjustedObstacles.length > 0) {
      const bounds = getObstacleBounds(adjustedObstacles, OBSTACLE_MARGIN + 20)
      // Try going around the obstacle - prefer the side that keeps us within bounds
      const tryLeft = bounds.minX
      const tryRight = bounds.maxX

      const leftObs = checkPath(tryLeft)
      const rightObs = checkPath(tryRight)

      if (leftObs.length === 0) {
        adjustedMidX = tryLeft
        usedDetour = true
      } else if (rightObs.length === 0) {
        adjustedMidX = tryRight
        usedDetour = true
      } else if (leftObs.length < adjustedObstacles.length) {
        adjustedMidX = tryLeft
        usedDetour = true
      } else if (rightObs.length < adjustedObstacles.length) {
        adjustedMidX = tryRight
        usedDetour = true
      }
    }

    const mid1: Point = { x: adjustedMidX, y: startStandoff.y }
    const mid2: Point = { x: adjustedMidX, y: endStandoff.y }

    // Mark segments for grid tracking
    gridTracker.mark(startStandoff.x, startStandoff.y, mid1.x, mid1.y)
    gridTracker.mark(mid1.x, mid1.y, mid2.x, mid2.y)
    gridTracker.mark(mid2.x, mid2.y, endStandoff.x, endStandoff.y)

    path = [startPort, startStandoff, mid1, mid2, endStandoff, endEdge]
    svgPath = `M${startPort.x},${startPort.y} L${startStandoff.x},${startStandoff.y} L${mid1.x},${mid1.y} L${mid2.x},${mid2.y} L${endStandoff.x},${endStandoff.y} L${endEdge.x},${endEdge.y}`

  } else {
    // Start vertical, then horizontal, then vertical
    // Path: startStandoff -> (startStandoff.x, midY) -> (endStandoff.x, midY) -> endStandoff

    // Check if standoffs are at similar X (nearly vertical connection)
    const nearlyAlignedX = Math.abs(startStandoff.x - endStandoff.x) < 30

    if (nearlyAlignedX) {
      // For nearly vertical connections, check for obstacles on direct path
      const directObs = findObstacles(startStandoff.x, startStandoff.y, endStandoff.x, endStandoff.y, nodes, excludeIds)

      if (directObs.length === 0) {
        // No obstacles - use direct path (may have small jog if X differs slightly)
        const mid1: Point = { x: startStandoff.x, y: (startStandoff.y + endStandoff.y) / 2 }
        const mid2: Point = { x: endStandoff.x, y: mid1.y }

        gridTracker.mark(startStandoff.x, startStandoff.y, mid1.x, mid1.y)
        if (Math.abs(mid1.x - mid2.x) > 1) {
          gridTracker.mark(mid1.x, mid1.y, mid2.x, mid2.y)
        }
        gridTracker.mark(mid2.x, mid2.y, endStandoff.x, endStandoff.y)

        path = [startPort, startStandoff, mid1, mid2, endStandoff, endEdge]
        svgPath = `M${startPort.x},${startPort.y} L${startStandoff.x},${startStandoff.y} L${mid1.x},${mid1.y} L${mid2.x},${mid2.y} L${endStandoff.x},${endStandoff.y} L${endEdge.x},${endEdge.y}`
        return { path, svgPath, usedDetour: false }
      } else {
        // Obstacles on vertical path - route HORIZONTALLY around them
        const bounds = getObstacleBounds(directObs, OBSTACLE_MARGIN + 20)
        const avgX = (startStandoff.x + endStandoff.x) / 2

        // Decide to go left or right based on distance
        const distLeft = Math.abs(avgX - bounds.minX)
        const distRight = Math.abs(bounds.maxX - avgX)
        const detourX = distLeft < distRight ? bounds.minX : bounds.maxX

        // Create path that goes around horizontally
        const corner1: Point = { x: detourX, y: startStandoff.y }
        const corner2: Point = { x: detourX, y: endStandoff.y }

        gridTracker.mark(startStandoff.x, startStandoff.y, corner1.x, corner1.y)
        gridTracker.mark(corner1.x, corner1.y, corner2.x, corner2.y)
        gridTracker.mark(corner2.x, corner2.y, endStandoff.x, endStandoff.y)

        path = [startPort, startStandoff, corner1, corner2, endStandoff, endEdge]
        svgPath = `M${startPort.x},${startPort.y} L${startStandoff.x},${startStandoff.y} L${corner1.x},${corner1.y} L${corner2.x},${corner2.y} L${endStandoff.x},${endStandoff.y} L${endEdge.x},${endEdge.y}`
        return { path, svgPath, usedDetour: true }
      }
    }

    // Standard case: significant X difference
    let bestMidY = gridTracker.snap(startStandoff.y + dy / 2)

    // Check for obstacles on the ideal path and find clear route
    const checkPath = (midY: number): NodeRect[] => {
      return [
        ...findObstacles(startStandoff.x, startStandoff.y, startStandoff.x, midY, nodes, excludeIds),
        ...findObstacles(startStandoff.x, midY, endStandoff.x, midY, nodes, excludeIds),
        ...findObstacles(endStandoff.x, midY, endStandoff.x, endStandoff.y, nodes, excludeIds)
      ]
    }

    let obstacles = checkPath(bestMidY)
    if (obstacles.length > 0) {
      // Try routing around obstacles by going further in the direction of travel
      const allBounds = getObstacleBounds(obstacles, OBSTACLE_MARGIN + 20)
      const tryMidY = dy > 0 ? allBounds.maxY : allBounds.minY
      const newObs = checkPath(tryMidY)
      if (newObs.length === 0) {
        bestMidY = tryMidY
        usedDetour = true
      } else {
        // Still have obstacles, try the opposite side
        const altMidY = dy > 0 ? allBounds.minY : allBounds.maxY
        const altObs = checkPath(altMidY)
        if (altObs.length === 0) {
          bestMidY = altMidY
          usedDetour = true
        } else {
          // Use the direction that clears most obstacles
          bestMidY = newObs.length <= altObs.length ? tryMidY : altMidY
          usedDetour = true
        }
      }
    }

    // Apply channelOffset to create parallel non-overlapping paths.
    // The offset is based on port assignment, so edges to the same target
    // get different Y values for their horizontal segments.
    let adjustedMidY = bestMidY + channelOffset

    // Check if the adjusted path has obstacles BEFORE clamping
    let adjustedObstacles = checkPath(adjustedMidY)

    // Try to clamp midY to stay between source and target (prevents backwards paths)
    // BUT only if clamping doesn't cause obstacle collision
    const minY = Math.min(startStandoff.y, endStandoff.y)
    const maxY = Math.max(startStandoff.y, endStandoff.y)
    const clampedMidY = Math.max(minY, Math.min(maxY, adjustedMidY))

    // Only use clamped value if it doesn't introduce obstacles
    if (adjustedMidY !== clampedMidY) {
      const clampedObstacles = checkPath(clampedMidY)
      if (clampedObstacles.length === 0 || clampedObstacles.length <= adjustedObstacles.length) {
        adjustedMidY = clampedMidY
        adjustedObstacles = clampedObstacles
      }
      // Otherwise keep the unclamped midY to avoid obstacles
    }

    // If there are still obstacles, try to route around them
    if (adjustedObstacles.length > 0) {
      const bounds = getObstacleBounds(adjustedObstacles, OBSTACLE_MARGIN + 20)
      // Try going around the obstacle - prefer the side that clears obstacles
      const tryAbove = bounds.minY
      const tryBelow = bounds.maxY

      const aboveObs = checkPath(tryAbove)
      const belowObs = checkPath(tryBelow)

      if (aboveObs.length === 0) {
        adjustedMidY = tryAbove
        usedDetour = true
      } else if (belowObs.length === 0) {
        adjustedMidY = tryBelow
        usedDetour = true
      } else if (aboveObs.length < adjustedObstacles.length) {
        adjustedMidY = tryAbove
        usedDetour = true
      } else if (belowObs.length < adjustedObstacles.length) {
        adjustedMidY = tryBelow
        usedDetour = true
      }
    }

    const mid1: Point = { x: startStandoff.x, y: adjustedMidY }
    const mid2: Point = { x: endStandoff.x, y: adjustedMidY }

    // Mark segments for grid tracking
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
