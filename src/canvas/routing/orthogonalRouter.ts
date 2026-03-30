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
import { cleanPath } from './pathBuilder'

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
  // Remove redundant collinear points to minimize turns
  const cleaned = cleanPath(path)
  markPathSegments(cleaned, gridTracker)
  return { path: cleaned, svgPath: buildSvgPath(cleaned), usedDetour }
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

  // Adjust end port for arrow head - move endpoint AWAY from node so arrow is visible
  const endEdge = { ...endPort }
  if (arrowOffset > 0) {
    if (targetSide === 'left') endEdge.x -= arrowOffset      // Move left (away from node)
    else if (targetSide === 'right') endEdge.x += arrowOffset // Move right (away from node)
    else if (targetSide === 'top') endEdge.y -= arrowOffset   // Move up (away from node)
    else if (targetSide === 'bottom') endEdge.y += arrowOffset // Move down (away from node)
  }

  // ==========================================================================
  // SPECIAL CASE: Adjacent nodes with crossing standoffs
  // ==========================================================================
  const endpoints: RouteEndpoints = { startPort, startStandoff, endStandoff, endEdge }
  const adjacentResult = tryAdjacentRoute(
    endpoints, endPort, sourceSide, isHorizontalStart, isHorizontalEnd, gridTracker
  )
  if (adjacentResult) {
    // Validate no 180-degree turns
    if (!has180DegreeTurn(adjacentResult.path)) {
      return adjacentResult
    }
  }

  // ==========================================================================
  // TRY SIMPLE PATHS FIRST (fewer segments = fewer crossings)
  // ==========================================================================
  const simpleResult = trySimplePath(
    endpoints, isHorizontalStart, isHorizontalEnd, nodes, excludeIds, gridTracker
  )
  if (simpleResult) {
    // Validate no 180-degree turns
    if (!has180DegreeTurn(simpleResult.path)) {
      return simpleResult
    }
  }

  // ==========================================================================
  // FALLBACK: 3-segment path (U-shape or Z-shape)
  // ==========================================================================
  // Determine primary axis (direction of first segment)
  const primaryAxis: Axis = isHorizontalStart ? 'x' : 'y'
  const delta = primaryAxis === 'x' ? dx : dy

  const threeSegResult = routeThreeSegment(
    endpoints, primaryAxis, delta, channelOffset, nodes, excludeIds, gridTracker
  )

  // Final validation - if still has 180-degree turn, use direct path
  if (has180DegreeTurn(threeSegResult.path)) {
    return createDirectPath(startPort, endEdge, sourceSide, gridTracker)
  }

  return threeSegResult
}

/**
 * Try routing adjacent nodes with crossed standoffs
 * Handles all cases where going to the standoff first would create a 180-degree turn
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

  // No crossing - normal routing can proceed
  if (!standoffsCrossedX && !standoffsCrossedY) {
    return null
  }

  const midX = (startPort.x + endPort.x) / 2
  const midY = (startPort.y + endPort.y) / 2

  // Case 1: Both horizontal exits with X crossing
  if (standoffsCrossedX && isHorizontalStart && isHorizontalEnd) {
    const mid1: Point = { x: midX, y: startPort.y }
    const mid2: Point = { x: midX, y: endPort.y }
    return buildResult([startPort, mid1, mid2, endEdge], gridTracker, false)
  }

  // Case 2: Both vertical exits with Y crossing
  if (standoffsCrossedY && !isHorizontalStart && !isHorizontalEnd) {
    const mid1: Point = { x: startPort.x, y: midY }
    const mid2: Point = { x: endPort.x, y: midY }
    return buildResult([startPort, mid1, mid2, endEdge], gridTracker, false)
  }

  // Case 3: Horizontal start, vertical end with crossing
  // Go perpendicular first to avoid 180-degree turn
  if ((standoffsCrossedX || standoffsCrossedY) && isHorizontalStart && !isHorizontalEnd) {
    // Start goes horizontal, so go vertical first to avoid backtracking
    const mid1: Point = { x: startPort.x, y: midY }
    const mid2: Point = { x: endPort.x, y: midY }
    return buildResult([startPort, mid1, mid2, endEdge], gridTracker, false)
  }

  // Case 4: Vertical start, horizontal end with crossing
  if ((standoffsCrossedX || standoffsCrossedY) && !isHorizontalStart && isHorizontalEnd) {
    // Start goes vertical, so go horizontal first to avoid backtracking
    const mid1: Point = { x: midX, y: startPort.y }
    const mid2: Point = { x: midX, y: endPort.y }
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
 * Route a segment around obstacles - finds shortest detour
 * Returns waypoints between start and end (not including start/end)
 */
function routeSegmentAroundObstacles(
  start: Point,
  end: Point,
  isHorizontal: boolean,
  nodes: NodeRect[] | Map<string, NodeRect>,
  excludeIds: Set<string>,
  depth: number = 0
): Point[] {
  const MAX_DEPTH = 2 // Limit recursion to avoid overly complex paths

  if (depth >= MAX_DEPTH) return []

  const obstacles = findObstacles(start.x, start.y, end.x, end.y, nodes, excludeIds)

  if (obstacles.length === 0) return []

  // Get obstacle bounds with extra margin for clearance
  const EXTRA_MARGIN = 30
  const bounds = getObstacleBounds(obstacles, OBSTACLE_MARGIN + EXTRA_MARGIN)

  if (isHorizontal) {
    // Horizontal segment blocked - find shortest vertical detour
    // Calculate distance to go above vs below
    const distAbove = Math.abs(start.y - bounds.minY) + Math.abs(end.y - bounds.minY)
    const distBelow = Math.abs(start.y - bounds.maxY) + Math.abs(end.y - bounds.maxY)

    const detourY = distAbove <= distBelow ? bounds.minY : bounds.maxY

    // Simple 2-point detour: go to detour level, then back
    const wp1: Point = { x: start.x, y: detourY }
    const wp2: Point = { x: end.x, y: detourY }

    // Check if this detour is clear
    const seg1Obs = findObstacles(start.x, start.y, wp1.x, wp1.y, nodes, excludeIds)
    const seg2Obs = findObstacles(wp1.x, wp1.y, wp2.x, wp2.y, nodes, excludeIds)
    const seg3Obs = findObstacles(wp2.x, wp2.y, end.x, end.y, nodes, excludeIds)

    if (seg1Obs.length === 0 && seg2Obs.length === 0 && seg3Obs.length === 0) {
      return [wp1, wp2]
    }

    // Try the other side
    const altDetourY = distAbove <= distBelow ? bounds.maxY : bounds.minY
    const altWp1: Point = { x: start.x, y: altDetourY }
    const altWp2: Point = { x: end.x, y: altDetourY }

    const altSeg1Obs = findObstacles(start.x, start.y, altWp1.x, altWp1.y, nodes, excludeIds)
    const altSeg2Obs = findObstacles(altWp1.x, altWp1.y, altWp2.x, altWp2.y, nodes, excludeIds)
    const altSeg3Obs = findObstacles(altWp2.x, altWp2.y, end.x, end.y, nodes, excludeIds)

    if (altSeg1Obs.length === 0 && altSeg2Obs.length === 0 && altSeg3Obs.length === 0) {
      return [altWp1, altWp2]
    }

    // Use the path with fewer obstacles
    const firstTotal = seg1Obs.length + seg2Obs.length + seg3Obs.length
    const altTotal = altSeg1Obs.length + altSeg2Obs.length + altSeg3Obs.length
    return firstTotal <= altTotal ? [wp1, wp2] : [altWp1, altWp2]

  } else {
    // Vertical segment blocked - find shortest horizontal detour
    const distLeft = Math.abs(start.x - bounds.minX) + Math.abs(end.x - bounds.minX)
    const distRight = Math.abs(start.x - bounds.maxX) + Math.abs(end.x - bounds.maxX)

    const detourX = distLeft <= distRight ? bounds.minX : bounds.maxX

    const wp1: Point = { x: detourX, y: start.y }
    const wp2: Point = { x: detourX, y: end.y }

    // Check if this detour is clear
    const seg1Obs = findObstacles(start.x, start.y, wp1.x, wp1.y, nodes, excludeIds)
    const seg2Obs = findObstacles(wp1.x, wp1.y, wp2.x, wp2.y, nodes, excludeIds)
    const seg3Obs = findObstacles(wp2.x, wp2.y, end.x, end.y, nodes, excludeIds)

    if (seg1Obs.length === 0 && seg2Obs.length === 0 && seg3Obs.length === 0) {
      return [wp1, wp2]
    }

    // Try the other side
    const altDetourX = distLeft <= distRight ? bounds.maxX : bounds.minX
    const altWp1: Point = { x: altDetourX, y: start.y }
    const altWp2: Point = { x: altDetourX, y: end.y }

    const altSeg1Obs = findObstacles(start.x, start.y, altWp1.x, altWp1.y, nodes, excludeIds)
    const altSeg2Obs = findObstacles(altWp1.x, altWp1.y, altWp2.x, altWp2.y, nodes, excludeIds)
    const altSeg3Obs = findObstacles(altWp2.x, altWp2.y, end.x, end.y, nodes, excludeIds)

    if (altSeg1Obs.length === 0 && altSeg2Obs.length === 0 && altSeg3Obs.length === 0) {
      return [altWp1, altWp2]
    }

    // Use the path with fewer obstacles
    const firstTotal = seg1Obs.length + seg2Obs.length + seg3Obs.length
    const altTotal = altSeg1Obs.length + altSeg2Obs.length + altSeg3Obs.length
    return firstTotal <= altTotal ? [wp1, wp2] : [altWp1, altWp2]
  }
}

/**
 * Route with multiple segments - adds turns as needed to avoid obstacles
 * Uses lane-based routing to prevent edge overlaps (like PCB traces)
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

  // Standard 3-segment routing with obstacle avoidance
  const startPrimary = getAxis(startStandoff, primaryAxis)
  const startSecondary = getAxis(startStandoff, secondaryAxis)
  const endSecondary = getAxis(endStandoff, secondaryAxis)

  // Ideal midpoint on primary axis
  const idealMid = gridTracker.snap(startPrimary + delta / 2 + channelOffset)

  // Find a free channel using the grid tracker
  const isHorizontalMid = primaryAxis === 'y'
  const rangeStart = Math.min(startSecondary, endSecondary)
  const rangeEnd = Math.max(startSecondary, endSecondary)

  let adjustedMid = gridTracker.findFreeChannel(
    idealMid,
    isHorizontalMid,
    rangeStart,
    rangeEnd,
    15
  )

  // Build initial 3-segment path
  let mid1 = setAxis(startStandoff, primaryAxis, adjustedMid)
  let mid2 = setAxis(endStandoff, primaryAxis, adjustedMid)

  // Check if the middle channel goes through obstacles and find a clear one
  const nodeList = nodes instanceof Map ? Array.from(nodes.values()) : nodes
  const checkMidClear = (): boolean => {
    for (const node of nodeList) {
      if (node.id && excludeIds.has(node.id)) continue
      const left = node.canvas_x - OBSTACLE_MARGIN
      const right = node.canvas_x + (node.width || 200) + OBSTACLE_MARGIN
      const top = node.canvas_y - OBSTACLE_MARGIN
      const bottom = node.canvas_y + (node.height || 120) + OBSTACLE_MARGIN

      // Check if mid1->mid2 segment goes through this node
      const midLeft = Math.min(mid1.x, mid2.x)
      const midRight = Math.max(mid1.x, mid2.x)
      const midTop = Math.min(mid1.y, mid2.y)
      const midBottom = Math.max(mid1.y, mid2.y)

      if (midRight >= left && midLeft <= right && midBottom >= top && midTop <= bottom) {
        return false
      }
    }
    return true
  }

  // Try to find a clear channel by moving the midpoint
  if (!checkMidClear()) {
    // Find obstacles in the region between start and end
    const regionMinX = Math.min(startStandoff.x, endStandoff.x) - 50
    const regionMaxX = Math.max(startStandoff.x, endStandoff.x) + 50
    const regionMinY = Math.min(startStandoff.y, endStandoff.y) - 50
    const regionMaxY = Math.max(startStandoff.y, endStandoff.y) + 50

    const obstaclesInRegion = nodeList.filter(node => {
      if (node.id && excludeIds.has(node.id)) return false
      const nodeRight = node.canvas_x + (node.width || 200)
      const nodeBottom = node.canvas_y + (node.height || 120)
      return nodeRight >= regionMinX && node.canvas_x <= regionMaxX &&
             nodeBottom >= regionMinY && node.canvas_y <= regionMaxY
    })

    if (obstaclesInRegion.length > 0) {
      const bounds = getObstacleBounds(obstaclesInRegion, OBSTACLE_MARGIN + 20)
      // Try routing above or below all obstacles
      const tryAbove = primaryAxis === 'x' ? bounds.minX - 20 : bounds.minY - 20
      const tryBelow = primaryAxis === 'x' ? bounds.maxX + 20 : bounds.maxY + 20

      // Pick the one closer to the current mid
      if (Math.abs(adjustedMid - tryAbove) < Math.abs(adjustedMid - tryBelow)) {
        adjustedMid = tryAbove
      } else {
        adjustedMid = tryBelow
      }

      mid1 = setAxis(startStandoff, primaryAxis, adjustedMid)
      mid2 = setAxis(endStandoff, primaryAxis, adjustedMid)
    }
  }

  // Check each segment for obstacles and add waypoints as needed
  const isFirstSegHorizontal = primaryAxis === 'x'
  const seg1Extra = routeSegmentAroundObstacles(startStandoff, mid1, !isFirstSegHorizontal, nodes, excludeIds)
  const seg2Extra = routeSegmentAroundObstacles(mid1, mid2, isFirstSegHorizontal, nodes, excludeIds)
  const seg3Extra = routeSegmentAroundObstacles(mid2, endStandoff, !isFirstSegHorizontal, nodes, excludeIds)

  usedDetour = seg1Extra.length > 0 || seg2Extra.length > 0 || seg3Extra.length > 0

  // Build complete path with all waypoints
  const path = [
    startPort,
    startStandoff,
    ...seg1Extra,
    mid1,
    ...seg2Extra,
    mid2,
    ...seg3Extra,
    endStandoff,
    endEdge
  ]

  // Mark all segments in the grid tracker
  for (let i = 0; i < path.length - 1; i++) {
    gridTracker.mark(path[i].x, path[i].y, path[i + 1].x, path[i + 1].y)
  }

  return { path: cleanPath(path), svgPath: buildSvgPath(cleanPath(path)), usedDetour }
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
    // Horizontal reversal: both segments horizontal but opposite directions
    if (Math.abs(dy1) < 1 && Math.abs(dy2) < 1) {
      if ((dx1 > 0 && dx2 < 0) || (dx1 < 0 && dx2 > 0)) {
        return true
      }
    }
    // Vertical reversal: both segments vertical but opposite directions
    if (Math.abs(dx1) < 1 && Math.abs(dx2) < 1) {
      if ((dy1 > 0 && dy2 < 0) || (dy1 < 0 && dy2 > 0)) {
        return true
      }
    }
  }
  return false
}

/**
 * Create a simple direct path avoiding 180-degree turns
 * Used as fallback when standard routing produces bad results
 */
function createDirectPath(
  startPort: Point,
  endEdge: Point,
  sourceSide: Side,
  gridTracker: GridTracker
): OrthogonalRouteResult {
  const midX = (startPort.x + endEdge.x) / 2
  const midY = (startPort.y + endEdge.y) / 2
  const isHorizontalStart = sourceSide === 'left' || sourceSide === 'right'

  let path: Point[]
  if (isHorizontalStart) {
    // Start horizontal, then vertical
    path = [startPort, { x: midX, y: startPort.y }, { x: midX, y: endEdge.y }, endEdge]
  } else {
    // Start vertical, then horizontal
    path = [startPort, { x: startPort.x, y: midY }, { x: endEdge.x, y: midY }, endEdge]
  }

  markPathSegments(path, gridTracker)
  return { path, svgPath: buildSvgPath(path), usedDetour: true }
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
