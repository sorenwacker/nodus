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
 * Route edges with bundling - edges going to the same node share a trunk
 * Creates "lanes" where multiple edges merge into a single thick line before branching
 */
export function routeEdgesWithBundling(
  edges: EdgeDef[],
  nodes: NodeRect[],
  nodeMap: Map<string, NodeRect>,
  style: EdgeStyle = 'orthogonal'
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
