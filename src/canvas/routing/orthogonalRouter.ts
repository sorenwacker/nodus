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

// Routing constants
const ALIGNMENT_THRESHOLD = 5        // Points within this distance are considered aligned
const NEAR_ALIGNMENT_THRESHOLD = 30  // Points within this distance try direct path first
const DETOUR_MARGIN = 20             // Extra margin when routing around obstacles

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
  /** Offset for the middle channel to create parallel non-overlapping edges */
  channelOffset?: number
}

/** Grouped endpoint data passed between routing functions */
interface RouteEndpoints {
  startPort: Point
  startStandoff: Point
  endStandoff: Point
  endEdge: Point
}

// Axis abstraction for generic routing
type Axis = 'x' | 'y'
const getAxis = (p: Point, axis: Axis): number => axis === 'x' ? p.x : p.y
const setAxis = (p: Point, axis: Axis, value: number): Point =>
  axis === 'x' ? { x: value, y: p.y } : { x: p.x, y: value }
const otherAxis = (axis: Axis): Axis => axis === 'x' ? 'y' : 'x'

/** Build SVG path string from points */
function buildSvgPath(path: Point[]): string {
  if (path.length === 0) return ''
  return `M${path[0].x},${path[0].y}` + path.slice(1).map(p => ` L${p.x},${p.y}`).join('')
}

/** Mark path segments in grid tracker */
function markPathSegments(path: Point[], gridTracker: GridTracker): void {
  for (let i = 0; i < path.length - 1; i++) {
    gridTracker.mark(path[i].x, path[i].y, path[i + 1].x, path[i + 1].y)
  }
}

/** Build complete routing result */
function buildResult(
  path: Point[],
  gridTracker: GridTracker,
  usedDetour: boolean
): OrthogonalRouteResult {
  markPathSegments(path, gridTracker)
  return { path, svgPath: buildSvgPath(path), usedDetour }
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

  // ==========================================================================
  // SPECIAL CASE: Adjacent nodes with crossing standoffs
  // ==========================================================================
  const endpoints: RouteEndpoints = { startPort, startStandoff, endStandoff, endEdge }
  const adjacentResult = tryAdjacentRoute(
    endpoints, endPort, sourceSide, isHorizontalStart, isHorizontalEnd, gridTracker
  )
  if (adjacentResult) return adjacentResult

  // ==========================================================================
  // TRY SIMPLE PATHS FIRST (fewer segments = fewer crossings)
  // ==========================================================================
  const simpleResult = trySimplePath(
    endpoints, isHorizontalStart, isHorizontalEnd, nodes, excludeIds, gridTracker
  )
  if (simpleResult) return simpleResult

  // ==========================================================================
  // FALLBACK: 3-segment path (U-shape or Z-shape)
  // ==========================================================================
  // Determine primary axis (direction of first segment)
  const primaryAxis: Axis = isHorizontalStart ? 'x' : 'y'
  const delta = primaryAxis === 'x' ? dx : dy

  return routeThreeSegment(
    endpoints, primaryAxis, delta, channelOffset, nodes, excludeIds, gridTracker
  )
}

/**
 * Try routing adjacent nodes with crossed standoffs
 */
function tryAdjacentRoute(
  endpoints: RouteEndpoints,
  endPort: Point,
  sourceSide: Side,
  isHorizontalStart: boolean,
  isHorizontalEnd: boolean,
  gridTracker: GridTracker
): OrthogonalRouteResult | null {
  const { startPort, startStandoff, endStandoff, endEdge } = endpoints

  const standoffsCrossedX = (sourceSide === 'right' && startStandoff.x > endStandoff.x) ||
                            (sourceSide === 'left' && startStandoff.x < endStandoff.x)
  const standoffsCrossedY = (sourceSide === 'bottom' && startStandoff.y > endStandoff.y) ||
                            (sourceSide === 'top' && startStandoff.y < endStandoff.y)

  if (standoffsCrossedX && isHorizontalStart && isHorizontalEnd) {
    const midX = (startPort.x + endPort.x) / 2
    const mid1: Point = { x: midX, y: startPort.y }
    const mid2: Point = { x: midX, y: endPort.y }
    return buildResult([startPort, mid1, mid2, endEdge], gridTracker, false)
  }

  if (standoffsCrossedY && !isHorizontalStart && !isHorizontalEnd) {
    const midY = (startPort.y + endPort.y) / 2
    const mid1: Point = { x: startPort.x, y: midY }
    const mid2: Point = { x: endPort.x, y: midY }
    return buildResult([startPort, mid1, mid2, endEdge], gridTracker, false)
  }

  return null
}

/**
 * Try simple paths: straight line or L-shape
 */
function trySimplePath(
  endpoints: RouteEndpoints,
  isHorizontalStart: boolean,
  isHorizontalEnd: boolean,
  nodes: NodeRect[] | Map<string, NodeRect>,
  excludeIds: Set<string>,
  gridTracker: GridTracker
): OrthogonalRouteResult | null {
  const { startPort, startStandoff, endStandoff, endEdge } = endpoints
  const alignedX = Math.abs(startStandoff.x - endStandoff.x) < ALIGNMENT_THRESHOLD
  const alignedY = Math.abs(startStandoff.y - endStandoff.y) < ALIGNMENT_THRESHOLD

  // Helper to check if straight path is clear
  const canUseStraightPath = (): boolean => {
    const obs = findObstacles(startStandoff.x, startStandoff.y, endStandoff.x, endStandoff.y, nodes, excludeIds)
    return obs.length === 0 && gridTracker.canPlace(startStandoff.x, startStandoff.y, endStandoff.x, endStandoff.y)
  }

  // Case 1: STRAIGHT LINE - standoffs are aligned
  if ((alignedX && !isHorizontalStart && !isHorizontalEnd) ||
      (alignedY && isHorizontalStart && isHorizontalEnd)) {
    if (canUseStraightPath()) {
      return buildResult([startPort, startStandoff, endStandoff, endEdge], gridTracker, false)
    }
  }

  // Case 2: L-SHAPE (2 segments)
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
        return buildResult([startPort, startStandoff, corner, endStandoff, endEdge], gridTracker, false)
      }
    }
  }

  return null
}

/**
 * Route with 3 segments - generic for both horizontal and vertical start
 */
function routeThreeSegment(
  endpoints: RouteEndpoints,
  primaryAxis: Axis,
  delta: number,
  channelOffset: number,
  nodes: NodeRect[] | Map<string, NodeRect>,
  excludeIds: Set<string>,
  gridTracker: GridTracker
): OrthogonalRouteResult {
  const { startPort, startStandoff, endStandoff, endEdge } = endpoints
  const secondaryAxis = otherAxis(primaryAxis)
  let usedDetour = false

  // Check for nearly-aligned connection on secondary axis
  const secondaryDiff = Math.abs(getAxis(startStandoff, secondaryAxis) - getAxis(endStandoff, secondaryAxis))

  if (secondaryDiff < NEAR_ALIGNMENT_THRESHOLD) {
    const result = tryNearlyAlignedRoute(
      endpoints, primaryAxis, nodes, excludeIds, gridTracker
    )
    if (result) return result
  }

  // Standard 3-segment routing
  const startPrimary = getAxis(startStandoff, primaryAxis)
  const endPrimary = getAxis(endStandoff, primaryAxis)

  // Ideal midpoint on primary axis
  let bestMid = gridTracker.snap(startPrimary + delta / 2)

  // Check for obstacles and find clear route
  const checkPath = (mid: number): NodeRect[] => {
    const mid1 = setAxis(startStandoff, primaryAxis, mid)
    const mid2 = setAxis(endStandoff, primaryAxis, mid)
    return [
      ...findObstacles(startStandoff.x, startStandoff.y, mid1.x, mid1.y, nodes, excludeIds),
      ...findObstacles(mid1.x, mid1.y, mid2.x, mid2.y, nodes, excludeIds),
      ...findObstacles(mid2.x, mid2.y, endStandoff.x, endStandoff.y, nodes, excludeIds),
    ]
  }

  let obstacles = checkPath(bestMid)
  if (obstacles.length > 0) {
    const result = findClearRoute(bestMid, delta, primaryAxis, checkPath, obstacles)
    bestMid = result.mid
    usedDetour = result.usedDetour
  }

  // Apply channel offset for parallel non-overlapping paths
  let adjustedMid = bestMid + channelOffset
  let adjustedObstacles = checkPath(adjustedMid)

  // Clamp to stay between source and target (prevents backwards paths)
  // But only if clamping doesn't cause obstacle collision
  const minBound = Math.min(startPrimary, endPrimary)
  const maxBound = Math.max(startPrimary, endPrimary)
  const clampedMid = Math.max(minBound, Math.min(maxBound, adjustedMid))

  if (adjustedMid !== clampedMid) {
    const clampedObstacles = checkPath(clampedMid)
    if (clampedObstacles.length === 0 || clampedObstacles.length <= adjustedObstacles.length) {
      adjustedMid = clampedMid
      adjustedObstacles = clampedObstacles
    }
  }

  // Try to route around remaining obstacles
  if (adjustedObstacles.length > 0) {
    const bounds = getObstacleBounds(adjustedObstacles, OBSTACLE_MARGIN + DETOUR_MARGIN)
    const tryLow = primaryAxis === 'x' ? bounds.minX : bounds.minY
    const tryHigh = primaryAxis === 'x' ? bounds.maxX : bounds.maxY

    const lowObs = checkPath(tryLow)
    const highObs = checkPath(tryHigh)

    if (lowObs.length === 0) {
      adjustedMid = tryLow
      usedDetour = true
    } else if (highObs.length === 0) {
      adjustedMid = tryHigh
      usedDetour = true
    } else if (lowObs.length < adjustedObstacles.length) {
      adjustedMid = tryLow
      usedDetour = true
    } else if (highObs.length < adjustedObstacles.length) {
      adjustedMid = tryHigh
      usedDetour = true
    }
  }

  // Build the path
  const mid1 = setAxis(startStandoff, primaryAxis, adjustedMid)
  const mid2 = setAxis(endStandoff, primaryAxis, adjustedMid)

  // Mark only the middle segments (not the standoff-to-port connections)
  gridTracker.mark(startStandoff.x, startStandoff.y, mid1.x, mid1.y)
  gridTracker.mark(mid1.x, mid1.y, mid2.x, mid2.y)
  gridTracker.mark(mid2.x, mid2.y, endStandoff.x, endStandoff.y)

  const path = [startPort, startStandoff, mid1, mid2, endStandoff, endEdge]
  return { path, svgPath: buildSvgPath(path), usedDetour }
}

/**
 * Try routing nearly-aligned connections with direct or detour path
 */
function tryNearlyAlignedRoute(
  endpoints: RouteEndpoints,
  primaryAxis: Axis,
  nodes: NodeRect[] | Map<string, NodeRect>,
  excludeIds: Set<string>,
  gridTracker: GridTracker
): OrthogonalRouteResult | null {
  const { startPort, startStandoff, endStandoff, endEdge } = endpoints
  const directObs = findObstacles(startStandoff.x, startStandoff.y, endStandoff.x, endStandoff.y, nodes, excludeIds)

  if (directObs.length === 0) {
    // No obstacles - use direct path with small jog
    const midPrimary = (getAxis(startStandoff, primaryAxis) + getAxis(endStandoff, primaryAxis)) / 2
    const mid1 = setAxis(startStandoff, primaryAxis, midPrimary)
    const mid2 = setAxis(endStandoff, primaryAxis, midPrimary)
    return buildResult([startPort, startStandoff, mid1, mid2, endStandoff, endEdge], gridTracker, false)
  }

  // Obstacles - route around on the secondary axis
  const secondaryAxis = otherAxis(primaryAxis)
  const bounds = getObstacleBounds(directObs, OBSTACLE_MARGIN + DETOUR_MARGIN)
  const avgSecondary = (getAxis(startStandoff, secondaryAxis) + getAxis(endStandoff, secondaryAxis)) / 2

  const lowBound = secondaryAxis === 'x' ? bounds.minX : bounds.minY
  const highBound = secondaryAxis === 'x' ? bounds.maxX : bounds.maxY
  const distLow = Math.abs(avgSecondary - lowBound)
  const distHigh = Math.abs(highBound - avgSecondary)
  const detourValue = distLow < distHigh ? lowBound : highBound

  const corner1 = setAxis(startStandoff, secondaryAxis, detourValue)
  const corner2 = setAxis(endStandoff, secondaryAxis, detourValue)
  return buildResult([startPort, startStandoff, corner1, corner2, endStandoff, endEdge], gridTracker, true)
}

/**
 * Find a clear route around obstacles
 */
function findClearRoute(
  bestMid: number,
  delta: number,
  primaryAxis: Axis,
  checkPath: (mid: number) => NodeRect[],
  obstacles: NodeRect[]
): { mid: number; usedDetour: boolean } {
  const allBounds = getObstacleBounds(obstacles, OBSTACLE_MARGIN + DETOUR_MARGIN)

  // Use the correct axis bounds
  const minBound = primaryAxis === 'x' ? allBounds.minX : allBounds.minY
  const maxBound = primaryAxis === 'x' ? allBounds.maxX : allBounds.maxY

  // Try going further in the direction of travel
  const tryFirst = delta > 0 ? maxBound : minBound
  const trySecond = delta > 0 ? minBound : maxBound

  const firstObs = checkPath(tryFirst)
  if (firstObs.length === 0) {
    return { mid: tryFirst, usedDetour: true }
  }

  const secondObs = checkPath(trySecond)
  if (secondObs.length === 0) {
    return { mid: trySecond, usedDetour: true }
  }

  // Use whichever clears more obstacles
  return {
    mid: firstObs.length <= secondObs.length ? tryFirst : trySecond,
    usedDetour: true,
  }
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
    if (Math.abs(dy) < 1) continue  // Horizontal
    if (Math.abs(dx) < 1) continue  // Vertical

    // Neither horizontal nor vertical - invalid
    return false
  }

  return true
}
