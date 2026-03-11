/**
 * Port assignment logic for edge routing
 * Groups edges by node+side and assigns evenly-spaced port indices
 */

import type { NodeRect, EdgeDef, Side, PortAssignment } from './types'
import { getSide, getNodeCenter } from './geometry'

export const PORT_SPACING = 20

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
