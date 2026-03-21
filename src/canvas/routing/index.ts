/**
 * Edge routing module
 * Orchestrates port assignment, path generation, and obstacle avoidance
 */

// Re-export types
export * from './types'

// Re-export utilities
export { pathToSvg } from './svgPath'
export { getSide, getPortPoint, getStandoff, getAngledStandoff, getNodeCenter, CORNER_MARGIN } from './geometry'
export { analyzeEdges, assignPorts, calculatePortOffset, PORT_SPACING } from './portAssignment'
export { createOrthogonalPath, cleanPath, findOrthogonalPath } from './pathBuilder'

// Export new routing modules
export { GridTracker, DEFAULT_GRID_SIZE, type Direction } from './gridTracker'
export {
  segmentIntersectsNode,
  findObstacles,
  findObstaclesInRegion,
  pathIntersectsObstacles,
  findDetourRoutes,
  findBestDetour,
  routeAroundObstacles,
  getObstacleBounds,
  setRoutingSpatialIndex,
  OBSTACLE_MARGIN,
} from './obstacleAvoider'
export { SpatialIndex, getSpatialIndex, invalidateSpatialIndex } from './spatialIndex'
export { routeDiagonal, validateDiagonalPath, type DiagonalRouteParams, type DiagonalRouteResult } from './diagonalRouter'
export { routeOrthogonal, validateOrthogonalPath, type OrthogonalRouteParams, type OrthogonalRouteResult } from './orthogonalRouter'

// Internal imports
import type { NodeRect, EdgeDef, RoutedEdge, Point, EdgeStyle, Side } from './types'
import { getPortPoint, getStandoff } from './geometry'
import { analyzeEdges, assignPorts, calculatePortOffset, PORT_SPACING } from './portAssignment'
import { GridTracker } from './gridTracker'
import { routeDiagonal } from './diagonalRouter'
import { routeOrthogonal } from './orthogonalRouter'
import { findObstacles, getObstacleBounds, OBSTACLE_MARGIN, segmentIntersectsNode } from './obstacleAvoider'

// Minimum orthogonal standoff distance from node edge
// Larger standoff = more room for edge routing lanes
const STANDOFF = 80

// Lane width for edge separation (like PCB trace spacing)
const LANE_WIDTH = 12

/**
 * Find obstacles along a straight line
 */
function findObstaclesOnLine(
  start: Point,
  end: Point,
  nodes: NodeRect[],
  excludeIds: Set<string>
): NodeRect[] {
  return findObstacles(start.x, start.y, end.x, end.y, nodes, excludeIds)
}

/**
 * Find obstacles along a cubic bezier curve by sampling points
 */
function findObstaclesOnCurve(
  p0: Point,
  p1: Point,
  p2: Point,
  p3: Point,
  nodes: NodeRect[],
  excludeIds: Set<string>
): NodeRect[] {
  const obstacles = new Set<NodeRect>()
  const samples = 10

  // Sample points along the bezier curve
  for (let i = 0; i < samples; i++) {
    const t1 = i / samples
    const t2 = (i + 1) / samples

    const pt1 = bezierPoint(p0, p1, p2, p3, t1)
    const pt2 = bezierPoint(p0, p1, p2, p3, t2)

    const segmentObstacles = findObstacles(pt1.x, pt1.y, pt2.x, pt2.y, nodes, excludeIds)
    for (const obs of segmentObstacles) {
      obstacles.add(obs)
    }
  }

  return Array.from(obstacles)
}

/**
 * Calculate point on cubic bezier curve at parameter t
 */
function bezierPoint(p0: Point, p1: Point, p2: Point, p3: Point, t: number): Point {
  const mt = 1 - t
  const mt2 = mt * mt
  const mt3 = mt2 * mt
  const t2 = t * t
  const t3 = t2 * t

  return {
    x: mt3 * p0.x + 3 * mt2 * t * p1.x + 3 * mt * t2 * p2.x + t3 * p3.x,
    y: mt3 * p0.y + 3 * mt2 * t * p1.y + 3 * mt * t2 * p2.y + t3 * p3.y,
  }
}

/**
 * Route around obstacles with a simple orthogonal detour for straight edges
 */
function routeAroundObstaclesSimple(
  start: Point,
  end: Point,
  obstacles: NodeRect[],
  sourceSide: Side,
  targetSide: Side
): Point[] {
  const bounds = getObstacleBounds(obstacles, OBSTACLE_MARGIN + 20)
  const dx = end.x - start.x
  const dy = end.y - start.y

  // Determine primary direction
  const isHorizontal = Math.abs(dx) > Math.abs(dy)

  if (isHorizontal) {
    // Edge is primarily horizontal - route vertically around obstacle
    const goAbove = start.y < bounds.minY || (start.y < (bounds.minY + bounds.maxY) / 2)
    const midY = goAbove ? bounds.minY : bounds.maxY

    return [
      start,
      { x: start.x, y: midY },
      { x: end.x, y: midY },
      end,
    ]
  } else {
    // Edge is primarily vertical - route horizontally around obstacle
    const goLeft = start.x < bounds.minX || (start.x < (bounds.minX + bounds.maxX) / 2)
    const midX = goLeft ? bounds.minX : bounds.maxX

    return [
      start,
      { x: midX, y: start.y },
      { x: midX, y: end.y },
      end,
    ]
  }
}

/**
 * Convert path points to SVG path string
 */
function pathToSvgString(path: Point[]): string {
  if (path.length === 0) return ''
  let svg = `M ${path[0].x} ${path[0].y}`
  for (let i = 1; i < path.length; i++) {
    svg += ` L ${path[i].x} ${path[i].y}`
  }
  return svg
}

/**
 * Route all edges with proper port spreading, grid tracking, and obstacle avoidance
 */
export function routeAllEdges(
  edges: EdgeDef[],
  nodes: NodeRect[],
  nodeMap: Map<string, NodeRect>,
  style: EdgeStyle = 'orthogonal'
): Map<string, RoutedEdge> {
  const result = new Map<string, RoutedEdge>()

  // Analyze edges and determine sides
  const edgeInfos = analyzeEdges(edges, nodeMap)

  // Assign port indices for spreading
  const { sourceAssignments, targetAssignments } = assignPorts(edgeInfos)

  // Create grid tracker for edge overlap prevention (PCB-style lane routing)
  // Grid size determines minimum spacing between parallel edges
  const gridTracker = new GridTracker(LANE_WIDTH)

  // Sort edges to minimize crossings
  // Strategy: Group edges by direction (down, up, right, left), then by position
  // This processes edges flowing in similar directions together, reducing crossings
  const sortedInfos = [...edgeInfos].sort((a, b) => {
    const srcAx = a.source.canvas_x + (a.source.width || 200) / 2
    const srcAy = a.source.canvas_y + (a.source.height || 120) / 2
    const tgtAx = a.target.canvas_x + (a.target.width || 200) / 2
    const tgtAy = a.target.canvas_y + (a.target.height || 120) / 2

    const srcBx = b.source.canvas_x + (b.source.width || 200) / 2
    const srcBy = b.source.canvas_y + (b.source.height || 120) / 2
    const tgtBx = b.target.canvas_x + (b.target.width || 200) / 2
    const tgtBy = b.target.canvas_y + (b.target.height || 120) / 2

    // Calculate primary direction for each edge
    const dxA = tgtAx - srcAx
    const dyA = tgtAy - srcAy
    const dxB = tgtBx - srcBx
    const dyB = tgtBy - srcBy

    // Classify into quadrants (0=right, 1=down, 2=left, 3=up)
    const getQuadrant = (dx: number, dy: number) => {
      if (Math.abs(dx) > Math.abs(dy)) {
        return dx > 0 ? 0 : 2  // Right or Left
      } else {
        return dy > 0 ? 1 : 3  // Down or Up
      }
    }

    const quadA = getQuadrant(dxA, dyA)
    const quadB = getQuadrant(dxB, dyB)

    // Sort by quadrant first (process downward edges, then rightward, etc.)
    if (quadA !== quadB) return quadA - quadB

    // Within same quadrant, sort for symmetric fan-out:
    // Process INNER edges first (closer to source center line), OUTER edges last
    // This way inner edges get offset 0, outer edges get larger offsets
    if (quadA === 1 || quadA === 3) {
      // Vertical edges (down/up): sort by distance from source center X
      // Inner edges (target X close to source X) first
      const distA = Math.abs(tgtAx - srcAx)
      const distB = Math.abs(tgtBx - srcBx)
      if (Math.abs(distA - distB) > 30) return distA - distB
      // Tie-breaker: left-to-right for consistent ordering
      return tgtAx - tgtBx
    } else {
      // Horizontal edges (left/right): sort by distance from source center Y
      const distA = Math.abs(tgtAy - srcAy)
      const distB = Math.abs(tgtBy - srcBy)
      if (Math.abs(distA - distB) > 30) return distA - distB
      return tgtAy - tgtBy
    }
  })

  // Route each edge
  for (const info of sortedInfos) {
    const { edge, source, target, sourceSide, targetSide } = info

    const srcAssign = sourceAssignments.get(edge.id)
    const tgtAssign = targetAssignments.get(edge.id)

    const srcOffset = srcAssign ? calculatePortOffset(srcAssign.index, srcAssign.total) : 0
    const tgtOffset = tgtAssign ? calculatePortOffset(tgtAssign.index, tgtAssign.total) : 0

    const sourcePort = getPortPoint(source, sourceSide, srcOffset)
    const targetPort = getPortPoint(target, targetSide, tgtOffset)
    const sourceStandoff = getStandoff(sourcePort, sourceSide, STANDOFF)
    const targetStandoff = getStandoff(targetPort, targetSide, STANDOFF)

    // Exclude source and target nodes from obstacle detection
    const excludeIds = new Set([edge.source_node_id, edge.target_node_id])

    let routeResult: { path: Point[]; svgPath: string }

    if (style === 'straight') {
      // Direct line from port to port with obstacle avoidance
      const obstacles = findObstaclesOnLine(sourcePort, targetPort, nodes, excludeIds)

      if (obstacles.length === 0) {
        // No obstacles - use direct line
        const path = [sourcePort, targetPort]
        const svgPath = `M ${sourcePort.x} ${sourcePort.y} L ${targetPort.x} ${targetPort.y}`
        routeResult = { path, svgPath }
      } else {
        // Route around obstacles with simple detour
        const detourPath = routeAroundObstaclesSimple(sourcePort, targetPort, obstacles, sourceSide, targetSide)
        const svgPath = pathToSvgString(detourPath)
        routeResult = { path: detourPath, svgPath }
      }
    } else if (style === 'curved') {
      // Bezier curve with control points based on distance
      const dx = targetPort.x - sourcePort.x
      const dy = targetPort.y - sourcePort.y
      const dist = Math.sqrt(dx * dx + dy * dy)
      const curvature = Math.min(dist * 0.4, 100)

      // Control points extend in the direction of the port's side
      let cp1x = sourcePort.x, cp1y = sourcePort.y
      let cp2x = targetPort.x, cp2y = targetPort.y

      if (sourceSide === 'right') cp1x += curvature
      else if (sourceSide === 'left') cp1x -= curvature
      else if (sourceSide === 'bottom') cp1y += curvature
      else if (sourceSide === 'top') cp1y -= curvature

      if (targetSide === 'right') cp2x += curvature
      else if (targetSide === 'left') cp2x -= curvature
      else if (targetSide === 'bottom') cp2y += curvature
      else if (targetSide === 'top') cp2y -= curvature

      // Check for obstacles along the curve path (sample points along bezier)
      const curveObstacles = findObstaclesOnCurve(
        sourcePort, { x: cp1x, y: cp1y }, { x: cp2x, y: cp2y }, targetPort,
        nodes, excludeIds
      )

      if (curveObstacles.length > 0) {
        // Obstacles found - increase curvature to route around them
        const bounds = getObstacleBounds(curveObstacles, OBSTACLE_MARGIN + 30)
        const midX = (sourcePort.x + targetPort.x) / 2
        const midY = (sourcePort.y + targetPort.y) / 2

        // Determine which direction to curve away from obstacles
        const obsCenterX = (bounds.minX + bounds.maxX) / 2
        const obsCenterY = (bounds.minY + bounds.maxY) / 2

        // Curve perpendicular to the edge direction, away from obstacles
        const perpX = -(targetPort.y - sourcePort.y)
        const perpY = targetPort.x - sourcePort.x
        const perpLen = Math.sqrt(perpX * perpX + perpY * perpY) || 1

        // Determine which side of the edge the obstacle is on
        const obsSide = perpX * (obsCenterX - midX) + perpY * (obsCenterY - midY)
        const detourSign = obsSide > 0 ? -1 : 1

        // Calculate detour distance
        const detourDist = Math.max(curvature * 1.5, 80)

        // Adjust control points to curve away from obstacles
        cp1x = sourcePort.x + (perpX / perpLen) * detourDist * detourSign
        cp1y = sourcePort.y + (perpY / perpLen) * detourDist * detourSign
        if (sourceSide === 'right') cp1x = Math.max(cp1x, sourcePort.x + curvature)
        else if (sourceSide === 'left') cp1x = Math.min(cp1x, sourcePort.x - curvature)
        else if (sourceSide === 'bottom') cp1y = Math.max(cp1y, sourcePort.y + curvature)
        else if (sourceSide === 'top') cp1y = Math.min(cp1y, sourcePort.y - curvature)

        cp2x = targetPort.x + (perpX / perpLen) * detourDist * detourSign
        cp2y = targetPort.y + (perpY / perpLen) * detourDist * detourSign
        if (targetSide === 'right') cp2x = Math.max(cp2x, targetPort.x + curvature)
        else if (targetSide === 'left') cp2x = Math.min(cp2x, targetPort.x - curvature)
        else if (targetSide === 'bottom') cp2y = Math.max(cp2y, targetPort.y + curvature)
        else if (targetSide === 'top') cp2y = Math.min(cp2y, targetPort.y - curvature)
      }

      const path = [sourcePort, { x: cp1x, y: cp1y }, { x: cp2x, y: cp2y }, targetPort]
      const svgPath = `M ${sourcePort.x} ${sourcePort.y} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${targetPort.x} ${targetPort.y}`
      routeResult = { path, svgPath }
    } else if (style === 'hyperbolic') {
      // Hyperbolic: smooth S-curve with orthogonal exits using standoffs
      // Calculate orthogonal exit direction (from port to standoff)
      const startDirX = sourceStandoff.x - sourcePort.x
      const startDirY = sourceStandoff.y - sourcePort.y
      const startDirLen = Math.sqrt(startDirX * startDirX + startDirY * startDirY) || 1

      const endDirX = targetStandoff.x - targetPort.x
      const endDirY = targetStandoff.y - targetPort.y
      const endDirLen = Math.sqrt(endDirX * endDirX + endDirY * endDirY) || 1

      // Distance between standoffs determines control point extension
      const dist = Math.sqrt(
        (targetStandoff.x - sourceStandoff.x) ** 2 +
        (targetStandoff.y - sourceStandoff.y) ** 2
      )
      let extension = Math.min(dist * 0.7, 180)

      // Control points extend orthogonally from each standoff
      let cp1x = sourceStandoff.x + (startDirX / startDirLen) * extension
      let cp1y = sourceStandoff.y + (startDirY / startDirLen) * extension
      let cp2x = targetStandoff.x + (endDirX / endDirLen) * extension
      let cp2y = targetStandoff.y + (endDirY / endDirLen) * extension

      // Check for obstacles along the curve path
      const curveObstacles = findObstaclesOnCurve(
        sourceStandoff, { x: cp1x, y: cp1y }, { x: cp2x, y: cp2y }, targetStandoff,
        nodes, excludeIds
      )

      if (curveObstacles.length > 0) {
        // Obstacles found - increase extension to route around them
        const bounds = getObstacleBounds(curveObstacles, OBSTACLE_MARGIN + 30)
        const midX = (sourceStandoff.x + targetStandoff.x) / 2
        const midY = (sourceStandoff.y + targetStandoff.y) / 2

        // Determine which direction to curve away from obstacles
        const obsCenterX = (bounds.minX + bounds.maxX) / 2
        const obsCenterY = (bounds.minY + bounds.maxY) / 2

        // Curve perpendicular to the edge direction, away from obstacles
        const perpX = -(targetStandoff.y - sourceStandoff.y)
        const perpY = targetStandoff.x - sourceStandoff.x
        const perpLen = Math.sqrt(perpX * perpX + perpY * perpY) || 1

        // Determine which side of the edge the obstacle is on
        const obsSide = perpX * (obsCenterX - midX) + perpY * (obsCenterY - midY)
        const detourSign = obsSide > 0 ? -1 : 1

        // Increase extension to route around
        extension = Math.max(extension * 1.5, 120)

        // Adjust control points to curve away from obstacles
        const offsetX = (perpX / perpLen) * 60 * detourSign
        const offsetY = (perpY / perpLen) * 60 * detourSign

        cp1x = sourceStandoff.x + (startDirX / startDirLen) * extension + offsetX
        cp1y = sourceStandoff.y + (startDirY / startDirLen) * extension + offsetY
        cp2x = targetStandoff.x + (endDirX / endDirLen) * extension + offsetX
        cp2y = targetStandoff.y + (endDirY / endDirLen) * extension + offsetY
      }

      const path = [sourcePort, sourceStandoff, { x: cp1x, y: cp1y }, { x: cp2x, y: cp2y }, targetStandoff, targetPort]
      const svgPath = `M ${sourcePort.x} ${sourcePort.y} L ${sourceStandoff.x} ${sourceStandoff.y} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${targetStandoff.x} ${targetStandoff.y} L ${targetPort.x} ${targetPort.y}`
      routeResult = { path, svgPath }
    } else if (style === 'diagonal') {
      routeResult = routeDiagonal({
        startPort: sourcePort,
        startStandoff: sourceStandoff,
        endPort: targetPort,
        endStandoff: targetStandoff,
        sourceSide,
        targetSide,
        nodes,
        excludeIds,
        gridTracker,
      })
    } else {
      // orthogonal (default)
      // Calculate channel offset to create non-crossing parallel paths.
      // Each edge gets assigned to a different "lane" based on port offsets.
      // Multiply by LANE_WIDTH to ensure proper visual separation.
      const sourceCenter = source.canvas_x + (source.width || 200) / 2
      const targetCenter = target.canvas_x + (target.width || 200) / 2
      const sourceLeftOfTarget = sourceCenter < targetCenter

      // Use whichever offset is larger (more edges sharing that endpoint)
      // Scale by lane width for proper visual separation
      const baseOffset = Math.abs(srcOffset) > Math.abs(tgtOffset) ? srcOffset : tgtOffset
      const scaledOffset = (baseOffset / PORT_SPACING) * LANE_WIDTH
      const channelOffset = sourceLeftOfTarget ? -scaledOffset : scaledOffset

      routeResult = routeOrthogonal({
        startPort: sourcePort,
        startStandoff: sourceStandoff,
        endPort: targetPort,
        endStandoff: targetStandoff,
        sourceSide,
        targetSide,
        nodes,
        excludeIds,
        gridTracker,
        channelOffset,
      })
    }

    result.set(edge.id, {
      id: edge.id,
      path: routeResult.path,
      svgPath: routeResult.svgPath,
      debugInfo: { srcOffset, tgtOffset, srcSide: sourceSide, tgtSide: targetSide },
    })
  }

  return result
}

/**
 * Route edges with bundling - edges going to the same node share a trunk
 * Creates "lanes" where multiple edges merge into a single thick line before branching
 */
export function routeEdgesWithBundling(
  edges: EdgeDef[],
  nodes: NodeRect[],
  nodeMap: Map<string, NodeRect>,
  _style: EdgeStyle = 'orthogonal'
): Map<string, RoutedEdge & { strokeWidth: number; bundleSize: number; trunkPath?: string; trunkStrokeWidth?: number; isTrunkOwner?: boolean }> {
  const result = new Map<string, RoutedEdge & { strokeWidth: number; bundleSize: number; trunkPath?: string; trunkStrokeWidth?: number; isTrunkOwner?: boolean }>()

  // Group edges by target node (edges flowing INTO the same node get bundled)
  const edgesByTarget = new Map<string, EdgeDef[]>()
  for (const edge of edges) {
    const targetId = edge.target_node_id
    if (!edgesByTarget.has(targetId)) {
      edgesByTarget.set(targetId, [])
    }
    edgesByTarget.get(targetId)!.push(edge)
  }

  // Also group by source (edges flowing OUT of the same node)
  const edgesBySource = new Map<string, EdgeDef[]>()
  for (const edge of edges) {
    const sourceId = edge.source_node_id
    if (!edgesBySource.has(sourceId)) {
      edgesBySource.set(sourceId, [])
    }
    edgesBySource.get(sourceId)!.push(edge)
  }

  // Process each edge
  for (const edge of edges) {
    const source = nodeMap.get(edge.source_node_id)
    const target = nodeMap.get(edge.target_node_id)
    if (!source || !target) continue

    const sourceCenter = { x: source.canvas_x + (source.width || 200) / 2, y: source.canvas_y + (source.height || 120) / 2 }
    const targetCenter = { x: target.canvas_x + (target.width || 200) / 2, y: target.canvas_y + (target.height || 120) / 2 }

    // Count how many edges share this target (bundle size)
    const targetBundle = edgesByTarget.get(edge.target_node_id) || []
    const bundleSize = targetBundle.length

    // Calculate stroke width based on bundle size (thicker for more edges)
    // Base width 1.5, max 4 for bundles of 5+
    const strokeWidth = bundleSize > 1 ? Math.min(1.5 + Math.log2(bundleSize) * 0.8, 4) : 1.5

    // For bundles of 3+, create a shared trunk path
    let trunkPath: string | undefined
    let trunkStrokeWidth: number | undefined
    let isTrunkOwner = false

    if (bundleSize >= 3) {
      // Find the "first" edge in the bundle (will draw the trunk)
      const bundleIndex = targetBundle.findIndex(e => e.id === edge.id)
      isTrunkOwner = bundleIndex === 0

      if (isTrunkOwner) {
        // Calculate merge point - 80px from target, in the direction of centroid of sources
        let sumX = 0, sumY = 0
        for (const e of targetBundle) {
          const src = nodeMap.get(e.source_node_id)
          if (src) {
            sumX += src.canvas_x + (src.width || 200) / 2
            sumY += src.canvas_y + (src.height || 120) / 2
          }
        }
        const centroidX = sumX / bundleSize
        const centroidY = sumY / bundleSize

        // Direction from target to centroid
        const dx = centroidX - targetCenter.x
        const dy = centroidY - targetCenter.y
        const dist = Math.sqrt(dx * dx + dy * dy)
        const mergeDistance = Math.min(80, dist * 0.3)

        const mergeX = targetCenter.x + (dx / dist) * mergeDistance
        const mergeY = targetCenter.y + (dy / dist) * mergeDistance

        // Trunk path from merge point to target
        trunkPath = `M ${mergeX} ${mergeY} L ${targetCenter.x} ${targetCenter.y}`
        trunkStrokeWidth = Math.min(2 + bundleSize * 0.5, 6)
      }
    }

    // Create simple straight line path (bundled edges use direct lines)
    const svgPath = `M ${sourceCenter.x} ${sourceCenter.y} L ${targetCenter.x} ${targetCenter.y}`

    result.set(edge.id, {
      id: edge.id,
      path: [sourceCenter, targetCenter],
      svgPath,
      strokeWidth,
      bundleSize,
      trunkPath,
      trunkStrokeWidth,
      isTrunkOwner,
    })
  }

  return result
}
