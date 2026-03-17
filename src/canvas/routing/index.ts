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
import type { NodeRect, EdgeDef, RoutedEdge, Point, EdgeStyle } from './types'
import { getPortPoint, getStandoff } from './geometry'
import { analyzeEdges, assignPorts, calculatePortOffset, PORT_SPACING } from './portAssignment'
import { GridTracker } from './gridTracker'
import { routeDiagonal } from './diagonalRouter'
import { routeOrthogonal } from './orthogonalRouter'

// Minimum orthogonal standoff distance from node edge
// Larger standoff = more room for edge routing lanes
const STANDOFF = 80

// Lane width for edge separation (like PCB trace spacing)
const LANE_WIDTH = 12

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
      // Direct line from port to port
      const path = [sourcePort, targetPort]
      const svgPath = `M ${sourcePort.x} ${sourcePort.y} L ${targetPort.x} ${targetPort.y}`
      routeResult = { path, svgPath }
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

      const path = [sourcePort, { x: cp1x, y: cp1y }, { x: cp2x, y: cp2y }, targetPort]
      const svgPath = `M ${sourcePort.x} ${sourcePort.y} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${targetPort.x} ${targetPort.y}`
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
 * Legacy export for compatibility - now includes style parameter
 */
export function routeEdgesWithBundling(
  edges: EdgeDef[],
  nodes: NodeRect[],
  nodeMap: Map<string, NodeRect>,
  style: EdgeStyle = 'orthogonal'
): Map<string, RoutedEdge & { strokeWidth: number; bundleSize: number }> {
  const routed = routeAllEdges(edges, nodes, nodeMap, style)
  const result = new Map<string, RoutedEdge & { strokeWidth: number; bundleSize: number }>()

  for (const [id, edge] of routed) {
    result.set(id, { ...edge, strokeWidth: 1.5, bundleSize: 1 })
  }

  return result
}
