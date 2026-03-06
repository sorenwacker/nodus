/**
 * Edge routing module
 * Orchestrates port assignment and path generation
 */

export * from './types'
export { pathToSvg } from './svgPath'
export { getSide, getPortPoint, getStandoff, getNodeCenter, CORNER_MARGIN } from './geometry'
export { analyzeEdges, assignPorts, calculatePortOffset, PORT_SPACING } from './portAssignment'
export { createOrthogonalPath, cleanPath, findOrthogonalPath } from './pathBuilder'

import type { NodeRect, EdgeDef, RoutedEdge } from './types'
import { getPortPoint, getStandoff } from './geometry'
import { analyzeEdges, assignPorts, calculatePortOffset } from './portAssignment'
import { createOrthogonalPath, cleanPath } from './pathBuilder'
import { pathToSvg } from './svgPath'

const STANDOFF = 20

/**
 * Route all edges with proper port spreading
 */
export function routeAllEdges(
  edges: EdgeDef[],
  _nodes: NodeRect[],
  nodeMap: Map<string, NodeRect>
): Map<string, RoutedEdge> {
  const result = new Map<string, RoutedEdge>()

  // Analyze edges and determine sides
  const edgeInfos = analyzeEdges(edges, nodeMap)


  // Assign port indices for spreading
  const { sourceAssignments, targetAssignments } = assignPorts(edgeInfos)

  // Route each edge
  for (const info of edgeInfos) {
    const { edge, source, target, sourceSide, targetSide } = info

    const srcAssign = sourceAssignments.get(edge.id)
    const tgtAssign = targetAssignments.get(edge.id)

    const srcOffset = srcAssign ? calculatePortOffset(srcAssign.index, srcAssign.total) : 0
    const tgtOffset = tgtAssign ? calculatePortOffset(tgtAssign.index, tgtAssign.total) : 0

    const sourcePort = getPortPoint(source, sourceSide, srcOffset)
    const targetPort = getPortPoint(target, targetSide, tgtOffset)
    const sourceStandoff = getStandoff(sourcePort, sourceSide, STANDOFF)
    const targetStandoff = getStandoff(targetPort, targetSide, STANDOFF)

    const rawPath = createOrthogonalPath(
      sourcePort, sourceStandoff, sourceSide,
      targetPort, targetStandoff, targetSide
    )
    const path = cleanPath(rawPath)
    const svgPath = pathToSvg(path)

    result.set(edge.id, {
      id: edge.id,
      path,
      svgPath,
      debugInfo: { srcOffset, tgtOffset, srcSide: sourceSide, tgtSide: targetSide }
    })
  }

  return result
}

/**
 * Legacy export for compatibility
 */
export function routeEdgesWithBundling(
  edges: EdgeDef[],
  nodes: NodeRect[],
  nodeMap: Map<string, NodeRect>
): Map<string, RoutedEdge & { strokeWidth: number; bundleSize: number }> {
  const routed = routeAllEdges(edges, nodes, nodeMap)
  const result = new Map<string, RoutedEdge & { strokeWidth: number; bundleSize: number }>()

  for (const [id, edge] of routed) {
    result.set(id, { ...edge, strokeWidth: 1.5, bundleSize: 1 })
  }

  return result
}
