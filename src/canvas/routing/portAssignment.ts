/**
 * Port assignment logic for edge routing
 * Groups edges by node+side and assigns evenly-spaced port indices
 */

import type { NodeRect, EdgeDef, Side, PortAssignment } from './types'
import { getSide, getNodeCenter } from './geometry'

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

    // Skip duplicate pairs
    const pairKey = `${edge.source_node_id}:${edge.target_node_id}`
    const pairKeyRev = `${edge.target_node_id}:${edge.source_node_id}`
    if (seenPairs.has(pairKey) || seenPairs.has(pairKeyRev)) continue
    seenPairs.add(pairKey)

    const targetCenter = getNodeCenter(target)
    const sourceCenter = getNodeCenter(source)

    const sourceSide = getSide(source, targetCenter.x, targetCenter.y)
    const targetSide = getSide(target, sourceCenter.x, sourceCenter.y)

    edgeInfos.push({ edge, source, target, sourceSide, targetSide })
  }

  return edgeInfos
}

/**
 * Group edges by node+side and assign port indices
 */
export function assignPorts(edgeInfos: EdgeInfo[]): {
  sourceAssignments: Map<string, PortAssignment>
  targetAssignments: Map<string, PortAssignment>
} {
  const sourceGroups = new Map<string, EdgeInfo[]>()
  const targetGroups = new Map<string, EdgeInfo[]>()

  // Group edges by node+side
  for (const info of edgeInfos) {
    const srcKey = `${info.edge.source_node_id}:${info.sourceSide}`
    const tgtKey = `${info.edge.target_node_id}:${info.targetSide}`

    if (!sourceGroups.has(srcKey)) sourceGroups.set(srcKey, [])
    if (!targetGroups.has(tgtKey)) targetGroups.set(tgtKey, [])

    sourceGroups.get(srcKey)!.push(info)
    targetGroups.get(tgtKey)!.push(info)
  }

  const sourceAssignments = new Map<string, PortAssignment>()
  const targetAssignments = new Map<string, PortAssignment>()

  // Sort source groups by target position and assign indices
  for (const [key, group] of sourceGroups) {
    const side = key.split(':')[1] as Side
    const isHorizontalSide = side === 'left' || side === 'right'

    group.sort((a, b) => {
      const ay = a.target.canvas_y + (a.target.height || 120) / 2
      const by = b.target.canvas_y + (b.target.height || 120) / 2
      const ax = a.target.canvas_x + (a.target.width || 200) / 2
      const bx = b.target.canvas_x + (b.target.width || 200) / 2
      // For left/right sides, sort by Y (vertical spread)
      // For top/bottom sides, sort by X (horizontal spread)
      if (isHorizontalSide) {
        return ay !== by ? ay - by : ax - bx
      } else {
        return ax !== bx ? ax - bx : ay - by
      }
    })

    group.forEach((info, idx) => {
      sourceAssignments.set(info.edge.id, {
        edgeId: info.edge.id,
        node: info.source,
        side: info.sourceSide,
        index: idx,
        total: group.length
      })
    })
  }

  // Sort target groups by source position and assign indices
  for (const [key, group] of targetGroups) {
    const side = key.split(':')[1] as Side
    const isHorizontalSide = side === 'left' || side === 'right'

    group.sort((a, b) => {
      const ay = a.source.canvas_y + (a.source.height || 120) / 2
      const by = b.source.canvas_y + (b.source.height || 120) / 2
      const ax = a.source.canvas_x + (a.source.width || 200) / 2
      const bx = b.source.canvas_x + (b.source.width || 200) / 2
      // For left/right sides, sort by Y (vertical spread)
      // For top/bottom sides, sort by X (horizontal spread)
      if (isHorizontalSide) {
        return ay !== by ? ay - by : ax - bx
      } else {
        return ax !== bx ? ax - bx : ay - by
      }
    })

    group.forEach((info, idx) => {
      targetAssignments.set(info.edge.id, {
        edgeId: info.edge.id,
        node: info.target,
        side: info.targetSide,
        index: idx,
        total: group.length
      })
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
