/**
 * Port assignment logic for edge routing
 * Groups edges by node+side and assigns evenly-spaced port indices
 */

import type { NodeRect, EdgeDef, Side, PortAssignment } from './types'
import { getSide, getNodeCenter } from './geometry'

// Spacing between ports on the same node side (like PCB trace spacing)
export const PORT_SPACING = 25

/**
 * Cache for optimized port indices
 * Key: "edgeId:source" or "edgeId:target"
 * Value: { index, total }
 */
const optimizedPortCache = new Map<string, { index: number; total: number }>()

/**
 * Store optimized port index in cache
 */
export function cachePortIndex(edgeId: string, isSource: boolean, index: number, total: number): void {
  const key = `${edgeId}:${isSource ? 'source' : 'target'}`
  optimizedPortCache.set(key, { index, total })
}

/**
 * Get cached port index if available
 */
export function getCachedPortIndex(edgeId: string, isSource: boolean): { index: number; total: number } | null {
  const key = `${edgeId}:${isSource ? 'source' : 'target'}`
  return optimizedPortCache.get(key) || null
}

/**
 * Clear the port cache (call after routing completes)
 */
export function clearPortCache(): void {
  optimizedPortCache.clear()
}

interface EdgeInfo {
  edge: EdgeDef
  source: NodeRect
  target: NodeRect
  sourceSide: Side
  targetSide: Side
}

/**
 * Analyze edges and determine sides for each endpoint
 */
export function analyzeEdges(
  edges: EdgeDef[],
  nodeMap: Map<string, NodeRect>
): EdgeInfo[] {
  const edgeInfos: EdgeInfo[] = []
  const seenPairs = new Set<string>()

  for (const edge of edges) {
    const source = nodeMap.get(edge.source_node_id)
    const target = nodeMap.get(edge.target_node_id)
    if (!source || !target) continue

    // Skip duplicate edge IDs (same edge processed twice), but NOT duplicate node pairs
    // Multiple edges between the same nodes are valid and should all be routed
    const edgeKey = edge.id
    if (seenPairs.has(edgeKey)) continue
    seenPairs.add(edgeKey)

    const targetCenter = getNodeCenter(target)
    const sourceCenter = getNodeCenter(source)

    const sourceSide = getSide(source, targetCenter.x, targetCenter.y)
    const targetSide = getSide(target, sourceCenter.x, sourceCenter.y)

    edgeInfos.push({ edge, source, target, sourceSide, targetSide })
  }

  return edgeInfos
}

/**
 * Unified edge entry for port assignment
 * Combines both outgoing (source) and incoming (target) edges at a node+side
 */
interface PortEntry {
  edgeId: string
  info: EdgeInfo
  isSource: boolean  // true = outgoing edge, false = incoming edge
  otherNodeY: number // Y position of the node at the other end
  otherNodeX: number // X position of the node at the other end
}

/**
 * Group edges by node+side and assign port indices
 *
 * CRITICAL: Both outgoing and incoming edges at the same node+side must be
 * assigned ports from the SAME pool to prevent overlapping/crossing.
 */
export function assignPorts(edgeInfos: EdgeInfo[]): {
  sourceAssignments: Map<string, PortAssignment>
  targetAssignments: Map<string, PortAssignment>
} {
  // Unified groups: all edges (both outgoing and incoming) at each node+side
  const unifiedGroups = new Map<string, PortEntry[]>()

  // Group edges by node+side, tracking both source and target endpoints
  for (const info of edgeInfos) {
    const srcKey = `${info.edge.source_node_id}:${info.sourceSide}`
    const tgtKey = `${info.edge.target_node_id}:${info.targetSide}`

    // Add as outgoing edge at source node
    if (!unifiedGroups.has(srcKey)) unifiedGroups.set(srcKey, [])
    const targetCy = info.target.canvas_y + (info.target.height || 120) / 2
    const targetCx = info.target.canvas_x + (info.target.width || 200) / 2
    unifiedGroups.get(srcKey)!.push({
      edgeId: info.edge.id,
      info,
      isSource: true,
      otherNodeY: targetCy,
      otherNodeX: targetCx,
    })

    // Add as incoming edge at target node
    if (!unifiedGroups.has(tgtKey)) unifiedGroups.set(tgtKey, [])
    const sourceCy = info.source.canvas_y + (info.source.height || 120) / 2
    const sourceCx = info.source.canvas_x + (info.source.width || 200) / 2
    unifiedGroups.get(tgtKey)!.push({
      edgeId: info.edge.id,
      info,
      isSource: false,
      otherNodeY: sourceCy,
      otherNodeX: sourceCx,
    })
  }

  const sourceAssignments = new Map<string, PortAssignment>()
  const targetAssignments = new Map<string, PortAssignment>()

  // Assign ports for each node+side, considering ALL edges (both directions)
  for (const [key, entries] of unifiedGroups) {
    const [, sideStr] = key.split(':')
    const side = sideStr as Side
    const isHorizontalSide = side === 'left' || side === 'right'

    // Get this node's center for angle calculation
    const firstEntry = entries[0]
    const thisNode = firstEntry.isSource ? firstEntry.info.source : firstEntry.info.target
    const nodeCx = thisNode.canvas_x + (thisNode.width || 200) / 2
    const nodeCy = thisNode.canvas_y + (thisNode.height || 120) / 2

    // Sort by ANGLE from this node to the other node
    // This ensures edges fan out in angular order, minimizing immediate crossings
    entries.sort((a, b) => {
      const angleA = Math.atan2(a.otherNodeY - nodeCy, a.otherNodeX - nodeCx)
      const angleB = Math.atan2(b.otherNodeY - nodeCy, b.otherNodeX - nodeCx)

      // For different sides, we need different angular orderings:
      // RIGHT side (-π/4 to π/4): sort by angle ascending (top to bottom)
      // BOTTOM side (π/4 to 3π/4): sort by angle ascending (left to right)
      // LEFT side (3π/4 to -3π/4): sort by angle ascending (bottom to top)
      // TOP side (-3π/4 to -π/4): sort by angle ascending (right to left)

      // Normalize angles based on side to get consistent port ordering
      let normA = angleA
      let normB = angleB

      if (side === 'left') {
        // For left side, edges going up should be at top, edges going down at bottom
        // Angle to up-left is around -3π/4, angle to down-left is around 3π/4
        // We want up (-Y) to get smaller index, so sort by Y component
        return a.otherNodeY - b.otherNodeY
      } else if (side === 'right') {
        // For right side, edges going up should be at top
        // Angle to up-right is around -π/4, angle to down-right is around π/4
        return a.otherNodeY - b.otherNodeY
      } else if (side === 'top') {
        // For top side, edges going left should be at left
        return a.otherNodeX - b.otherNodeX
      } else {
        // For bottom side, edges going left should be at left
        return a.otherNodeX - b.otherNodeX
      }
    })


    // Assign indices from the unified pool
    // Check cache for optimized indices first
    const total = entries.length
    entries.forEach((entry, idx) => {
      const node = entry.isSource ? entry.info.source : entry.info.target

      // Check if we have a cached optimized index for this edge
      const cached = getCachedPortIndex(entry.edgeId, entry.isSource)
      const finalIndex = cached ? cached.index : idx
      const finalTotal = cached ? cached.total : total

      const assignment: PortAssignment = {
        edgeId: entry.edgeId,
        node,
        side,
        index: finalIndex,
        total: finalTotal,
      }

      if (entry.isSource) {
        sourceAssignments.set(entry.edgeId, assignment)
      } else {
        targetAssignments.set(entry.edgeId, assignment)
      }
    })
  }

  return { sourceAssignments, targetAssignments }
}

/**
 * Calculate port offset from center based on index and total count
 */
export function calculatePortOffset(index: number, total: number): number {
  if (total <= 1) return 0
  return (index - (total - 1) / 2) * PORT_SPACING
}

/**
 * Result of crossing detection
 */
export interface CrossingReport {
  /** Total number of edge crossings */
  totalCrossings: number
  /** Edges involved in crossings, sorted by crossing count */
  edgesByCrossings: Array<{ edgeId: string; crossings: number }>
  /** Nodes with most crossing edges, sorted by count */
  nodesByCrossings: Array<{ nodeId: string; crossings: number }>
  /** Pairs of crossing edges */
  crossingPairs: Array<{ edge1: string; edge2: string }>
}

/**
 * Detect edge crossings for a specific node's neighborhood
 * Only checks edges connected to the focus node and its neighbors
 * @param focusNodeId - The node to analyze (if undefined, analyzes all - use with caution on large graphs)
 */
export function detectCrossings(
  edgeInfos: EdgeInfo[],
  sourceAssignments: Map<string, PortAssignment>,
  targetAssignments: Map<string, PortAssignment>,
  focusNodeId?: string
): CrossingReport {
  // Filter to neighborhood if focus node provided
  let relevantEdges = edgeInfos

  if (focusNodeId) {
    // Find edges connected to focus node
    const directEdges = edgeInfos.filter(
      e => e.source.id === focusNodeId || e.target.id === focusNodeId
    )

    // Find neighbor node IDs
    const neighborIds = new Set<string>()
    for (const e of directEdges) {
      if (e.source.id) neighborIds.add(e.source.id)
      if (e.target.id) neighborIds.add(e.target.id)
    }

    // Include edges between neighbors (2-hop neighborhood)
    relevantEdges = edgeInfos.filter(e => {
      const srcId = e.source.id || ''
      const tgtId = e.target.id || ''
      return neighborIds.has(srcId) || neighborIds.has(tgtId)
    })
  }
  const crossingPairs: Array<{ edge1: string; edge2: string }> = []
  const edgeCrossings = new Map<string, number>()
  const nodeCrossings = new Map<string, number>()

  // Get edge endpoints with port offsets
  const edgeEndpoints = new Map<string, { x1: number; y1: number; x2: number; y2: number }>()

  for (const info of relevantEdges) {
    const srcAssign = sourceAssignments.get(info.edge.id)
    const tgtAssign = targetAssignments.get(info.edge.id)

    const srcOffset = srcAssign ? calculatePortOffset(srcAssign.index, srcAssign.total) : 0
    const tgtOffset = tgtAssign ? calculatePortOffset(tgtAssign.index, tgtAssign.total) : 0

    const srcCx = info.source.canvas_x + (info.source.width || 200) / 2
    const srcCy = info.source.canvas_y + (info.source.height || 120) / 2
    const tgtCx = info.target.canvas_x + (info.target.width || 200) / 2
    const tgtCy = info.target.canvas_y + (info.target.height || 120) / 2

    // Approximate port positions (simplified - actual port is on node edge)
    const x1 = srcCx + (info.sourceSide === 'left' ? -50 : info.sourceSide === 'right' ? 50 : srcOffset)
    const y1 = srcCy + (info.sourceSide === 'top' ? -50 : info.sourceSide === 'bottom' ? 50 : srcOffset)
    const x2 = tgtCx + (info.targetSide === 'left' ? -50 : info.targetSide === 'right' ? 50 : tgtOffset)
    const y2 = tgtCy + (info.targetSide === 'top' ? -50 : info.targetSide === 'bottom' ? 50 : tgtOffset)

    edgeEndpoints.set(info.edge.id, { x1, y1, x2, y2 })
    edgeCrossings.set(info.edge.id, 0)
  }

  // Check all pairs for crossings
  const edgeIds = Array.from(edgeEndpoints.keys())

  for (let i = 0; i < edgeIds.length; i++) {
    for (let j = i + 1; j < edgeIds.length; j++) {
      const id1 = edgeIds[i]
      const id2 = edgeIds[j]
      const e1 = edgeEndpoints.get(id1)!
      const e2 = edgeEndpoints.get(id2)!

      if (segmentsIntersect(e1.x1, e1.y1, e1.x2, e1.y2, e2.x1, e2.y1, e2.x2, e2.y2)) {
        crossingPairs.push({ edge1: id1, edge2: id2 })
        edgeCrossings.set(id1, (edgeCrossings.get(id1) || 0) + 1)
        edgeCrossings.set(id2, (edgeCrossings.get(id2) || 0) + 1)

        // Track node crossings
        const info1 = relevantEdges.find(e => e.edge.id === id1)
        const info2 = relevantEdges.find(e => e.edge.id === id2)
        if (info1) {
          nodeCrossings.set(info1.source.id || '', (nodeCrossings.get(info1.source.id || '') || 0) + 1)
          nodeCrossings.set(info1.target.id || '', (nodeCrossings.get(info1.target.id || '') || 0) + 1)
        }
        if (info2) {
          nodeCrossings.set(info2.source.id || '', (nodeCrossings.get(info2.source.id || '') || 0) + 1)
          nodeCrossings.set(info2.target.id || '', (nodeCrossings.get(info2.target.id || '') || 0) + 1)
        }
      }
    }
  }

  // Sort results
  const edgesByCrossings = Array.from(edgeCrossings.entries())
    .filter(([_, count]) => count > 0)
    .map(([edgeId, crossings]) => ({ edgeId, crossings }))
    .sort((a, b) => b.crossings - a.crossings)

  const nodesByCrossings = Array.from(nodeCrossings.entries())
    .filter(([id, count]) => id && count > 0)
    .map(([nodeId, crossings]) => ({ nodeId, crossings }))
    .sort((a, b) => b.crossings - a.crossings)

  return {
    totalCrossings: crossingPairs.length,
    edgesByCrossings,
    nodesByCrossings,
    crossingPairs,
  }
}

/**
 * Check if two line segments intersect
 */
function segmentsIntersect(
  x1: number, y1: number, x2: number, y2: number,
  x3: number, y3: number, x4: number, y4: number
): boolean {
  // Calculate direction vectors
  const d1x = x2 - x1
  const d1y = y2 - y1
  const d2x = x4 - x3
  const d2y = y4 - y3

  const cross = d1x * d2y - d1y * d2x

  // Parallel lines
  if (Math.abs(cross) < 0.0001) return false

  const dx = x3 - x1
  const dy = y3 - y1

  const t = (dx * d2y - dy * d2x) / cross
  const u = (dx * d1y - dy * d1x) / cross

  // Check if intersection point is within both segments
  // Use small margin to avoid counting shared endpoints
  return t > 0.01 && t < 0.99 && u > 0.01 && u < 0.99
}

/**
 * Optimize port assignments to minimize edge crossings
 * Uses angular sorting at each node to ensure edges fan out without crossing
 */
export function optimizePortAssignments(
  edgeInfos: EdgeInfo[],
  sourceAssignments: Map<string, PortAssignment>,
  targetAssignments: Map<string, PortAssignment>
): void {
  // Build edge info lookup
  const edgeInfoMap = new Map<string, EdgeInfo>()
  for (const info of edgeInfos) {
    edgeInfoMap.set(info.edge.id, info)
  }

  // Group all edges by node+side (combining source and target assignments)
  const nodeSideEdges = new Map<string, Array<{
    edgeId: string
    isSource: boolean
    otherX: number
    otherY: number
    assignment: PortAssignment
  }>>()

  for (const [edgeId, assignment] of sourceAssignments) {
    const key = `${assignment.node.id}:${assignment.side}`
    if (!nodeSideEdges.has(key)) nodeSideEdges.set(key, [])
    const info = edgeInfoMap.get(edgeId)
    if (info) {
      const otherCx = info.target.canvas_x + (info.target.width || 200) / 2
      const otherCy = info.target.canvas_y + (info.target.height || 120) / 2
      nodeSideEdges.get(key)!.push({ edgeId, isSource: true, otherX: otherCx, otherY: otherCy, assignment })
    }
  }

  for (const [edgeId, assignment] of targetAssignments) {
    const key = `${assignment.node.id}:${assignment.side}`
    if (!nodeSideEdges.has(key)) nodeSideEdges.set(key, [])
    const info = edgeInfoMap.get(edgeId)
    if (info) {
      const otherCx = info.source.canvas_x + (info.source.width || 200) / 2
      const otherCy = info.source.canvas_y + (info.source.height || 120) / 2
      nodeSideEdges.get(key)!.push({ edgeId, isSource: false, otherX: otherCx, otherY: otherCy, assignment })
    }
  }

  // Re-sort and re-assign indices for each node+side
  for (const [key, edges] of nodeSideEdges) {
    if (edges.length <= 1) continue

    const [nodeId, sideStr] = key.split(':')
    const side = sideStr as Side
    const isHorizontalSide = side === 'left' || side === 'right'

    // Get node center
    const firstEdge = edges[0]
    const node = firstEdge.assignment.node
    const nodeCx = node.canvas_x + (node.width || 200) / 2
    const nodeCy = node.canvas_y + (node.height || 120) / 2

    // Sort by angle from node center to other node
    edges.sort((a, b) => {
      const angleA = Math.atan2(a.otherY - nodeCy, a.otherX - nodeCx)
      const angleB = Math.atan2(b.otherY - nodeCy, b.otherX - nodeCx)

      // Map angles to port order based on side
      // For right side: angles from -π/2 (up) to π/2 (down), map to top-to-bottom ports
      // For left side: angles from π/2 (down) to -π/2 (up), but edges point left so reverse
      // For top side: angles from -π (left) to 0 (right), map to left-to-right ports
      // For bottom side: angles from 0 (right) to π (left), map to left-to-right ports

      if (side === 'right') {
        // Right side: -π/2 to π/2, ascending angle = top to bottom
        return angleA - angleB
      } else if (side === 'left') {
        // Left side: π to π/2 (up) and -π to -π/2 (down)
        // We want up (small Y) at top port, down (large Y) at bottom port
        return a.otherY - b.otherY
      } else if (side === 'top') {
        // Top side: left (small X) to right (large X)
        return a.otherX - b.otherX
      } else {
        // Bottom side: left (small X) to right (large X)
        return a.otherX - b.otherX
      }
    })

    // Reassign indices based on sorted order
    edges.forEach((edge, idx) => {
      edge.assignment.index = idx
      edge.assignment.total = edges.length
    })
  }
}

