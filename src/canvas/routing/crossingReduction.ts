/**
 * Edge crossing reduction algorithms
 * Modular design allows swapping different strategies
 */

import type { Side, NodeRect, EdgeDef, PortAssignment } from './types'
import { calculatePortOffset } from './portAssignment'

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
 * Count crossings between two specific edges
 */
function edgesCross(
  e1: { x1: number; y1: number; x2: number; y2: number },
  e2: { x1: number; y1: number; x2: number; y2: number }
): boolean {
  const d1x = e1.x2 - e1.x1, d1y = e1.y2 - e1.y1
  const d2x = e2.x2 - e2.x1, d2y = e2.y2 - e2.y1
  const cross = d1x * d2y - d1y * d2x
  if (Math.abs(cross) < 0.0001) return false

  const dx = e2.x1 - e1.x1, dy = e2.y1 - e1.y1
  const t = (dx * d2y - dy * d2x) / cross
  const u = (dx * d1y - dy * d1x) / cross

  return t > 0.01 && t < 0.99 && u > 0.01 && u < 0.99
}

/**
 * Get edge path considering port offsets
 */
function getEdgePath(
  info: EdgeInfo,
  sourceAssignments: Map<string, PortAssignment>,
  targetAssignments: Map<string, PortAssignment>
): { x1: number; y1: number; x2: number; y2: number } {
  const srcAssign = sourceAssignments.get(info.edge.id)
  const tgtAssign = targetAssignments.get(info.edge.id)

  const srcCx = info.source.canvas_x + (info.source.width || 200) / 2
  const srcCy = info.source.canvas_y + (info.source.height || 120) / 2
  const tgtCx = info.target.canvas_x + (info.target.width || 200) / 2
  const tgtCy = info.target.canvas_y + (info.target.height || 120) / 2

  const srcOffset = srcAssign ? calculatePortOffset(srcAssign.index, srcAssign.total) : 0
  const tgtOffset = tgtAssign ? calculatePortOffset(tgtAssign.index, tgtAssign.total) : 0

  let x1 = srcCx, y1 = srcCy, x2 = tgtCx, y2 = tgtCy

  if (info.sourceSide === 'left' || info.sourceSide === 'right') {
    y1 += srcOffset
  } else {
    x1 += srcOffset
  }
  if (info.targetSide === 'left' || info.targetSide === 'right') {
    y2 += tgtOffset
  } else {
    x2 += tgtOffset
  }

  return { x1, y1, x2, y2 }
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

    // Count initial crossings
    const countCrossings = (): number => {
      let count = 0
      for (let i = 0; i < edgeInfos.length; i++) {
        for (let j = i + 1; j < edgeInfos.length; j++) {
          const p1 = getEdgePath(edgeInfos[i], sourceAssignments, targetAssignments)
          const p2 = getEdgePath(edgeInfos[j], sourceAssignments, targetAssignments)
          if (edgesCross(p1, p2)) count++
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

    const edgePaths = new Map<string, { x1: number; y1: number; x2: number; y2: number }>()
    const rebuildPaths = () => {
      for (const info of edgeInfos) {
        edgePaths.set(info.edge.id, getEdgePath(info, sourceAssignments, targetAssignments))
      }
    }
    rebuildPaths()

    const countCrossings = (): number => {
      let count = 0
      const ids = Array.from(edgePaths.keys())
      for (let i = 0; i < ids.length; i++) {
        for (let j = i + 1; j < ids.length; j++) {
          if (edgesCross(edgePaths.get(ids[i])!, edgePaths.get(ids[j])!)) count++
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

      for (const [_key, entries] of groups) {
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

            // Swap
            a.assign.index = origB
            b.assign.index = origA
            edgePaths.set(a.edgeId, getEdgePath(edgeInfos.find(e => e.edge.id === a.edgeId)!, sourceAssignments, targetAssignments))
            edgePaths.set(b.edgeId, getEdgePath(edgeInfos.find(e => e.edge.id === b.edgeId)!, sourceAssignments, targetAssignments))

            const after = countCrossings()

            if (after < before) {
              improved = true
              swapsPerformed++
            } else {
              // Revert
              a.assign.index = origA
              b.assign.index = origB
              edgePaths.set(a.edgeId, getEdgePath(edgeInfos.find(e => e.edge.id === a.edgeId)!, sourceAssignments, targetAssignments))
              edgePaths.set(b.edgeId, getEdgePath(edgeInfos.find(e => e.edge.id === b.edgeId)!, sourceAssignments, targetAssignments))
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
