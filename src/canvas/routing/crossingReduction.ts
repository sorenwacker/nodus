/**
 * Edge crossing reduction algorithms
 * Modular design allows swapping different strategies
 */

import type { Side, NodeRect, EdgeDef, PortAssignment } from './types'

interface EdgeInfo {
  edge: EdgeDef
  source: NodeRect
  target: NodeRect
  sourceSide: Side
  targetSide: Side
}

export interface CrossingReductionResult {
  improved: boolean
  initialCrossings: number
  finalCrossings: number
  swapsPerformed: number
}

/**
 * Strategy interface for crossing reduction algorithms
 */
export interface CrossingReductionStrategy {
  name: string
  reduce(
    edgeInfos: EdgeInfo[],
    sourceAssignments: Map<string, PortAssignment>,
    targetAssignments: Map<string, PortAssignment>
  ): CrossingReductionResult
}

/**
 * Check if two orthogonal edges would cross based on their port assignments.
 * For edges sharing a node side, they cross if port order doesn't match target order.
 *
 * Key insight: For orthogonal routing, two edges A and B entering the SAME side of a node
 * will cross if:
 * - A's source is to the LEFT of B's source (for top/bottom entry)
 * - But A's port is to the RIGHT of B's port
 *
 * This is because the orthogonal path goes: source → horizontal → turn → vertical → port
 * If the port order is reversed from source order, the vertical segments must cross.
 */
function edgesCrossOrthogonal(
  info1: EdgeInfo,
  info2: EdgeInfo,
  sourceAssignments: Map<string, PortAssignment>,
  targetAssignments: Map<string, PortAssignment>
): boolean {
  // Check source side crossing (both edges exit from same side of same node)
  if (info1.edge.source_node_id === info2.edge.source_node_id &&
      info1.sourceSide === info2.sourceSide) {
    const assign1 = sourceAssignments.get(info1.edge.id)
    const assign2 = sourceAssignments.get(info2.edge.id)
    if (assign1 && assign2) {
      const isHorizontalSide = info1.sourceSide === 'left' || info1.sourceSide === 'right'
      // Compare target positions
      const pos1 = isHorizontalSide
        ? info1.target.canvas_y + (info1.target.height || 120) / 2
        : info1.target.canvas_x + (info1.target.width || 200) / 2
      const pos2 = isHorizontalSide
        ? info2.target.canvas_y + (info2.target.height || 120) / 2
        : info2.target.canvas_x + (info2.target.width || 200) / 2
      // Crossing if port order doesn't match target order
      const portOrder = assign1.index < assign2.index
      const targetOrder = pos1 < pos2
      if (portOrder !== targetOrder && Math.abs(pos1 - pos2) > 30) {
        return true
      }
    }
  }

  // Check target side crossing (both edges enter same side of same node)
  if (info1.edge.target_node_id === info2.edge.target_node_id &&
      info1.targetSide === info2.targetSide) {
    const assign1 = targetAssignments.get(info1.edge.id)
    const assign2 = targetAssignments.get(info2.edge.id)
    if (assign1 && assign2) {
      const isHorizontalSide = info1.targetSide === 'left' || info1.targetSide === 'right'
      // Compare source positions
      const pos1 = isHorizontalSide
        ? info1.source.canvas_y + (info1.source.height || 120) / 2
        : info1.source.canvas_x + (info1.source.width || 200) / 2
      const pos2 = isHorizontalSide
        ? info2.source.canvas_y + (info2.source.height || 120) / 2
        : info2.source.canvas_x + (info2.source.width || 200) / 2
      // Crossing if port order doesn't match source order
      const portOrder = assign1.index < assign2.index
      const sourceOrder = pos1 < pos2
      if (portOrder !== sourceOrder && Math.abs(pos1 - pos2) > 30) {
        return true
      }
    }
  }

  return false
}

/**
 * Barycenter method - order ports by the average position of connected nodes
 * Classic graph drawing algorithm for crossing minimization
 */
export class BarycentricReduction implements CrossingReductionStrategy {
  name = 'barycentric'

  reduce(
    edgeInfos: EdgeInfo[],
    sourceAssignments: Map<string, PortAssignment>,
    targetAssignments: Map<string, PortAssignment>
  ): CrossingReductionResult {
    if (edgeInfos.length < 2) {
      return { improved: false, initialCrossings: 0, finalCrossings: 0, swapsPerformed: 0 }
    }

    // Count crossings using orthogonal-aware detection
    const countCrossings = (): number => {
      let count = 0
      for (let i = 0; i < edgeInfos.length; i++) {
        for (let j = i + 1; j < edgeInfos.length; j++) {
          if (edgesCrossOrthogonal(edgeInfos[i], edgeInfos[j], sourceAssignments, targetAssignments)) {
            count++
          }
        }
      }
      return count
    }

    const initialCrossings = countCrossings()
    if (initialCrossings === 0) {
      return { improved: false, initialCrossings: 0, finalCrossings: 0, swapsPerformed: 0 }
    }

    // Group edges by node+side
    const groups = new Map<string, Array<{ edgeId: string; isSource: boolean; otherPos: number }>>()

    for (const info of edgeInfos) {
      const srcKey = `${info.edge.source_node_id}:${info.sourceSide}`
      const tgtKey = `${info.edge.target_node_id}:${info.targetSide}`

      // For source side, "other" is the target position
      const isHorizSrc = info.sourceSide === 'left' || info.sourceSide === 'right'
      const targetPos = isHorizSrc
        ? info.target.canvas_y + (info.target.height || 120) / 2
        : info.target.canvas_x + (info.target.width || 200) / 2

      if (!groups.has(srcKey)) groups.set(srcKey, [])
      groups.get(srcKey)!.push({ edgeId: info.edge.id, isSource: true, otherPos: targetPos })

      // For target side, "other" is the source position
      const isHorizTgt = info.targetSide === 'left' || info.targetSide === 'right'
      const sourcePos = isHorizTgt
        ? info.source.canvas_y + (info.source.height || 120) / 2
        : info.source.canvas_x + (info.source.width || 200) / 2

      if (!groups.has(tgtKey)) groups.set(tgtKey, [])
      groups.get(tgtKey)!.push({ edgeId: info.edge.id, isSource: false, otherPos: sourcePos })
    }

    let swapsPerformed = 0

    // Sort each group by barycenter (position of connected node)
    // For orthogonal routing: separate by approach direction, reverse within each
    for (const [key, entries] of groups) {
      if (entries.length < 2) continue

      // Determine the node+side this group represents
      const [nodeId, side] = key.split(':') as [string, Side]
      const isHorizontalSide = side === 'left' || side === 'right'

      // Find the node's center position
      const nodeInfo = edgeInfos.find(e =>
        e.edge.source_node_id === nodeId || e.edge.target_node_id === nodeId
      )
      if (!nodeInfo) continue

      const nodeRect = nodeInfo.edge.source_node_id === nodeId ? nodeInfo.source : nodeInfo.target
      const nodeCenterPos = isHorizontalSide
        ? nodeRect.canvas_y + (nodeRect.height || 120) / 2
        : nodeRect.canvas_x + (nodeRect.width || 200) / 2

      // Separate entries by approach direction
      const negative: typeof entries = []  // left of center (for top/bottom) or above center (for left/right)
      const positive: typeof entries = []  // right of center or below center

      for (const entry of entries) {
        if (entry.otherPos < nodeCenterPos) {
          negative.push(entry)
        } else {
          positive.push(entry)
        }
      }

      // Sort each group: REVERSE order within each approach direction
      // This ensures: leftmost source → rightmost port (among left-approachers)
      // And: rightmost source → leftmost port (among right-approachers)
      negative.sort((a, b) => b.otherPos - a.otherPos)  // reverse: more negative → higher index
      positive.sort((a, b) => a.otherPos - b.otherPos)  // reverse: more positive → higher index

      // Combine: negative side gets lower indices (left/top ports), positive gets higher (right/bottom)
      // But WITHIN each group, inner sources get outer positions
      const combined = [...negative, ...positive]
      entries.length = 0
      entries.push(...combined)

      // Reassign indices based on sorted order
      console.log(`[Barycentric] Group ${key}: reassigning ${entries.length} edges`)
      entries.forEach((entry, idx) => {
        const assignments = entry.isSource ? sourceAssignments : targetAssignments
        const assign = assignments.get(entry.edgeId)
        if (assign) {
          const oldIdx = assign.index
          if (oldIdx !== idx) {
            assign.index = idx
            swapsPerformed++
            console.log(`[Barycentric] Edge ${entry.edgeId}: index ${oldIdx} -> ${idx}`)
          }
          assign.total = entries.length
        } else {
          console.warn(`[Barycentric] No assignment for edge ${entry.edgeId}`)
        }
      })
    }

    const finalCrossings = countCrossings()
    const improved = finalCrossings < initialCrossings

    console.log(`[Barycentric] ${initialCrossings} -> ${finalCrossings} crossings (${swapsPerformed} reassignments)`)

    return { improved, initialCrossings, finalCrossings, swapsPerformed }
  }
}

/**
 * Greedy swap method - try pairwise swaps and keep improvements
 */
export class GreedySwapReduction implements CrossingReductionStrategy {
  name = 'greedy-swap'

  reduce(
    edgeInfos: EdgeInfo[],
    sourceAssignments: Map<string, PortAssignment>,
    targetAssignments: Map<string, PortAssignment>
  ): CrossingReductionResult {
    if (edgeInfos.length < 2) {
      return { improved: false, initialCrossings: 0, finalCrossings: 0, swapsPerformed: 0 }
    }

    // Use orthogonal-aware crossing detection
    const countCrossings = (): number => {
      let count = 0
      for (let i = 0; i < edgeInfos.length; i++) {
        for (let j = i + 1; j < edgeInfos.length; j++) {
          if (edgesCrossOrthogonal(edgeInfos[i], edgeInfos[j], sourceAssignments, targetAssignments)) {
            count++
          }
        }
      }
      return count
    }

    const initialCrossings = countCrossings()
    if (initialCrossings === 0) {
      return { improved: false, initialCrossings: 0, finalCrossings: 0, swapsPerformed: 0 }
    }

    // Group edges by node+side
    const groups = new Map<string, Array<{ edgeId: string; isSource: boolean }>>()
    for (const info of edgeInfos) {
      const srcKey = `${info.edge.source_node_id}:${info.sourceSide}`
      const tgtKey = `${info.edge.target_node_id}:${info.targetSide}`
      if (!groups.has(srcKey)) groups.set(srcKey, [])
      if (!groups.has(tgtKey)) groups.set(tgtKey, [])
      groups.get(srcKey)!.push({ edgeId: info.edge.id, isSource: true })
      groups.get(tgtKey)!.push({ edgeId: info.edge.id, isSource: false })
    }

    let swapsPerformed = 0
    let iterations = 0
    const maxIterations = 50
    let improved = true

    while (improved && iterations < maxIterations) {
      improved = false
      iterations++

      for (const [, entries] of groups) {
        if (entries.length < 2) continue

        const groupAssigns = entries
          .map(e => ({
            edgeId: e.edgeId,
            isSource: e.isSource,
            assign: (e.isSource ? sourceAssignments : targetAssignments).get(e.edgeId)!
          }))
          .filter(a => a.assign)
          .sort((a, b) => a.assign.index - b.assign.index)

        // Try all pairs
        for (let i = 0; i < groupAssigns.length; i++) {
          for (let j = i + 1; j < groupAssigns.length; j++) {
            const before = countCrossings()

            const a = groupAssigns[i]
            const b = groupAssigns[j]
            const origA = a.assign.index
            const origB = b.assign.index

            // Swap indices
            a.assign.index = origB
            b.assign.index = origA

            const after = countCrossings()

            if (after < before) {
              improved = true
              swapsPerformed++
              console.log(`[GreedySwap] Swap improved: ${before} -> ${after} crossings`)
            } else {
              // Revert
              a.assign.index = origA
              b.assign.index = origB
            }
          }
        }
      }
    }

    const finalCrossings = countCrossings()
    console.log(`[GreedySwap] ${initialCrossings} -> ${finalCrossings} crossings (${swapsPerformed} swaps, ${iterations} iterations)`)

    return {
      improved: finalCrossings < initialCrossings,
      initialCrossings,
      finalCrossings,
      swapsPerformed
    }
  }
}

/**
 * Combined strategy - barycentric first, then greedy refinement
 */
export class CombinedReduction implements CrossingReductionStrategy {
  name = 'combined'

  private barycentric = new BarycentricReduction()
  private greedy = new GreedySwapReduction()

  reduce(
    edgeInfos: EdgeInfo[],
    sourceAssignments: Map<string, PortAssignment>,
    targetAssignments: Map<string, PortAssignment>
  ): CrossingReductionResult {
    // First pass: barycentric ordering
    const baryResult = this.barycentric.reduce(edgeInfos, sourceAssignments, targetAssignments)

    // Second pass: greedy refinement to find swaps barycentric missed
    const greedyResult = this.greedy.reduce(edgeInfos, sourceAssignments, targetAssignments)

    return {
      improved: baryResult.improved || greedyResult.improved,
      initialCrossings: baryResult.initialCrossings,
      finalCrossings: greedyResult.finalCrossings,
      swapsPerformed: baryResult.swapsPerformed + greedyResult.swapsPerformed
    }
  }
}

// Default strategy
let currentStrategy: CrossingReductionStrategy = new CombinedReduction()

export function setStrategy(strategy: CrossingReductionStrategy): void {
  currentStrategy = strategy
  console.log(`[CrossingReduction] Strategy set to: ${strategy.name}`)
}

export function getStrategy(): CrossingReductionStrategy {
  return currentStrategy
}

export function reduceCrossings(
  edgeInfos: EdgeInfo[],
  sourceAssignments: Map<string, PortAssignment>,
  targetAssignments: Map<string, PortAssignment>
): CrossingReductionResult {
  console.log(`[CrossingReduction] Running ${currentStrategy.name} on ${edgeInfos.length} edges`)
  return currentStrategy.reduce(edgeInfos, sourceAssignments, targetAssignments)
}
