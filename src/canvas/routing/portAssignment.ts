/**
 * Port assignment logic for edge routing
 * Groups edges by node+side and assigns evenly-spaced port indices
 */

import type { NodeRect, EdgeDef, Side, PortAssignment } from './types'
import { getSide, getNodeCenter } from './geometry'

// Spacing between ports on the same node side (like PCB trace spacing)
export const PORT_SPACING = 25

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

    // Sort by perpendicular position of the other node to minimize crossings.
    // For left/right sides: primary sort by Y, secondary by X (for same-Y sources)
    // For top/bottom sides: primary sort by X, secondary by Y (for same-X sources)
    entries.sort((a, b) => {
      const posA = isHorizontalSide ? a.otherNodeY : a.otherNodeX
      const posB = isHorizontalSide ? b.otherNodeY : b.otherNodeX

      if (Math.abs(posA - posB) > 1) {
        return posA - posB
      }

      // Secondary sort: when primary positions are similar, sort by the OTHER axis.
      // This creates a natural "fan" pattern for sources at the same level:
      // - For LEFT side: sources further LEFT (smaller X) get HIGHER ports (smaller index)
      // - For RIGHT side: sources further RIGHT (larger X) get HIGHER ports (smaller index)
      // - For TOP side: sources further UP (smaller Y) get LEFT ports (smaller index)
      // - For BOTTOM side: sources further DOWN (larger Y) get LEFT ports (smaller index)
      const secondaryA = isHorizontalSide ? a.otherNodeX : a.otherNodeY
      const secondaryB = isHorizontalSide ? b.otherNodeX : b.otherNodeY

      // For RIGHT side, reverse the X ordering (larger X = smaller index)
      // For BOTTOM side, reverse the Y ordering (larger Y = smaller index)
      if (side === 'right' || side === 'bottom') {
        if (Math.abs(secondaryA - secondaryB) > 1) {
          return secondaryB - secondaryA  // Reversed
        }
      } else {
        if (Math.abs(secondaryA - secondaryB) > 1) {
          return secondaryA - secondaryB  // Normal
        }
      }

      // Final tie-breaker: edge ID for stability
      return a.edgeId.localeCompare(b.edgeId)
    })


    // Assign indices from the unified pool
    const total = entries.length
    entries.forEach((entry, idx) => {
      const node = entry.isSource ? entry.info.source : entry.info.target
      const assignment: PortAssignment = {
        edgeId: entry.edgeId,
        node,
        side,
        index: idx,
        total,
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
 * Uses a greedy approach: for each node side, try swapping adjacent ports
 * and keep swaps that reduce the total crossing count
 */
export function optimizePortAssignments(
  edgeInfos: EdgeInfo[],
  sourceAssignments: Map<string, PortAssignment>,
  targetAssignments: Map<string, PortAssignment>
): void {
  // Build lookup maps for quick access
  const edgeInfoMap = new Map<string, EdgeInfo>()
  for (const info of edgeInfos) {
    edgeInfoMap.set(info.edge.id, info)
  }

  // Group assignments by node+side
  const nodeGroups = new Map<string, { assignments: PortAssignment[]; isSource: boolean }[]>()

  for (const [edgeId, assignment] of sourceAssignments) {
    const key = `${assignment.node.id}:${assignment.side}`
    if (!nodeGroups.has(key)) nodeGroups.set(key, [])
    const group = nodeGroups.get(key)!
    let found = group.find(g => g.isSource === true)
    if (!found) {
      found = { assignments: [], isSource: true }
      group.push(found)
    }
    found.assignments.push(assignment)
  }

  for (const [edgeId, assignment] of targetAssignments) {
    const key = `${assignment.node.id}:${assignment.side}`
    if (!nodeGroups.has(key)) nodeGroups.set(key, [])
    const group = nodeGroups.get(key)!
    let found = group.find(g => g.isSource === false)
    if (!found) {
      found = { assignments: [], isSource: false }
      group.push(found)
    }
    found.assignments.push(assignment)
  }

  // For each node side, optimize port order
  for (const [key, groups] of nodeGroups) {
    // Combine all assignments for this node+side
    const allAssignments: { assignment: PortAssignment; isSource: boolean }[] = []
    for (const g of groups) {
      for (const a of g.assignments) {
        allAssignments.push({ assignment: a, isSource: g.isSource })
      }
    }

    if (allAssignments.length <= 2) continue // Nothing to optimize

    // Sort by current index
    allAssignments.sort((a, b) => a.assignment.index - b.assignment.index)

    // Try to minimize crossings using bubble-sort style swaps
    let improved = true
    let iterations = 0
    const maxIterations = allAssignments.length * 2

    while (improved && iterations < maxIterations) {
      improved = false
      iterations++

      for (let i = 0; i < allAssignments.length - 1; i++) {
        const a = allAssignments[i]
        const b = allAssignments[i + 1]

        // Count crossings with current order
        const currentCrossings = countCrossingsForPair(
          a, b, i, i + 1, allAssignments, edgeInfoMap, sourceAssignments, targetAssignments
        )

        // Count crossings if we swap
        const swappedCrossings = countCrossingsForPair(
          b, a, i, i + 1, allAssignments, edgeInfoMap, sourceAssignments, targetAssignments
        )

        if (swappedCrossings < currentCrossings) {
          // Swap improves crossings - apply it
          allAssignments[i] = b
          allAssignments[i + 1] = a

          // Update the actual assignments
          const aIdx = a.assignment.index
          const bIdx = b.assignment.index
          a.assignment.index = bIdx
          b.assignment.index = aIdx

          improved = true
        }
      }
    }
  }
}

/**
 * Count crossings involving a pair of edges at adjacent port positions
 */
function countCrossingsForPair(
  entryA: { assignment: PortAssignment; isSource: boolean },
  entryB: { assignment: PortAssignment; isSource: boolean },
  idxA: number,
  idxB: number,
  allAssignments: { assignment: PortAssignment; isSource: boolean }[],
  edgeInfoMap: Map<string, EdgeInfo>,
  sourceAssignments: Map<string, PortAssignment>,
  targetAssignments: Map<string, PortAssignment>
): number {
  let crossings = 0

  const infoA = edgeInfoMap.get(entryA.assignment.edgeId)
  const infoB = edgeInfoMap.get(entryB.assignment.edgeId)
  if (!infoA || !infoB) return 0

  // Get the "other end" positions for both edges
  const otherA = getOtherEndPosition(infoA, entryA.isSource, sourceAssignments, targetAssignments)
  const otherB = getOtherEndPosition(infoB, entryB.isSource, sourceAssignments, targetAssignments)

  // A crossing occurs when the port order doesn't match the other-end order
  // If A is above B at ports but A's other end is below B's other end, they cross
  const side = entryA.assignment.side
  const isHorizontalSide = side === 'left' || side === 'right'

  if (isHorizontalSide) {
    // Ports are ordered by Y, check if other ends have opposite Y order
    const portOrderAFirst = idxA < idxB
    const otherOrderAFirst = otherA.y < otherB.y

    // If port order and other-end order disagree, count as crossing
    if (portOrderAFirst !== otherOrderAFirst && Math.abs(otherA.y - otherB.y) > 20) {
      crossings++
    }
  } else {
    // Ports are ordered by X, check if other ends have opposite X order
    const portOrderAFirst = idxA < idxB
    const otherOrderAFirst = otherA.x < otherB.x

    if (portOrderAFirst !== otherOrderAFirst && Math.abs(otherA.x - otherB.x) > 20) {
      crossings++
    }
  }

  return crossings
}

/**
 * Get the position of the other end of an edge
 */
function getOtherEndPosition(
  info: EdgeInfo,
  isSource: boolean,
  sourceAssignments: Map<string, PortAssignment>,
  targetAssignments: Map<string, PortAssignment>
): { x: number; y: number } {
  // If this is a source endpoint, the other end is the target
  const otherNode = isSource ? info.target : info.source
  const otherAssignment = isSource
    ? targetAssignments.get(info.edge.id)
    : sourceAssignments.get(info.edge.id)

  const cx = otherNode.canvas_x + (otherNode.width || 200) / 2
  const cy = otherNode.canvas_y + (otherNode.height || 120) / 2

  // Adjust for port offset if available
  if (otherAssignment) {
    const offset = calculatePortOffset(otherAssignment.index, otherAssignment.total)
    const side = otherAssignment.side
    if (side === 'left' || side === 'right') {
      return { x: cx, y: cy + offset }
    } else {
      return { x: cx + offset, y: cy }
    }
  }

  return { x: cx, y: cy }
}
