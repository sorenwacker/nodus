/**
 * Grid layout strategy
 * Fast grid-based layout for large node sets
 */
import type { LayoutStrategy, LayoutNode, LayoutEdge, LayoutOptions } from '../types'
import { fastGridLayout } from '../fastGrid'
import { NODE_DEFAULTS } from '../../constants'

export interface GridLayoutStrategyOptions extends LayoutOptions {
  /** Gap between nodes */
  gap?: number
  /** Number of columns (auto-calculated if not specified) */
  columns?: number
  /** Use edge-aware placement (slower but better for connected graphs) */
  edgeAware?: boolean
}

/**
 * Tetris-style bin packing for grid layout with edge-aware placement
 * Places connected nodes closer together to minimize total edge length
 */
function tetrisGridLayout(
  nodes: LayoutNode[],
  edges: LayoutEdge[],
  startX: number,
  startY: number,
  gap: number
): Map<string, { x: number; y: number }> {
  const targets = new Map<string, { x: number; y: number }>()

  if (nodes.length === 0) return targets

  // Build adjacency map for edge-aware placement
  const nodeIds = new Set(nodes.map((n) => n.id))
  const adjacency = new Map<string, Set<string>>()
  for (const node of nodes) {
    adjacency.set(node.id, new Set())
  }
  for (const edge of edges) {
    if (nodeIds.has(edge.source) && nodeIds.has(edge.target)) {
      adjacency.get(edge.source)?.add(edge.target)
      adjacency.get(edge.target)?.add(edge.source)
    }
  }

  // Calculate total area to estimate ideal dimensions
  let totalArea = 0
  let maxNodeWidth = 0
  let maxNodeHeight = 0
  for (const node of nodes) {
    const w = node.width || NODE_DEFAULTS.WIDTH
    const h = node.height || NODE_DEFAULTS.HEIGHT
    totalArea += (w + gap) * (h + gap)
    maxNodeWidth = Math.max(maxNodeWidth, w)
    maxNodeHeight = Math.max(maxNodeHeight, h)
  }

  // Target a roughly square layout
  const idealSide = Math.sqrt(totalArea) * 1.2
  const maxWidth = Math.max(idealSide, maxNodeWidth + gap)

  // Sort nodes: prioritize by connectivity (most connected first), then by area
  const sorted = [...nodes].sort((a, b) => {
    const connA = adjacency.get(a.id)?.size || 0
    const connB = adjacency.get(b.id)?.size || 0
    if (connA !== connB) return connB - connA
    const areaA = (a.width || NODE_DEFAULTS.WIDTH) * (a.height || NODE_DEFAULTS.HEIGHT)
    const areaB = (b.width || NODE_DEFAULTS.WIDTH) * (b.height || NODE_DEFAULTS.HEIGHT)
    return areaB - areaA
  })

  // Track placed rectangles with node IDs
  const placed: { id: string; x: number; y: number; w: number; h: number }[] = []

  function overlaps(x: number, y: number, w: number, h: number): boolean {
    for (const rect of placed) {
      if (
        x < rect.x + rect.w + gap &&
        x + w + gap > rect.x &&
        y < rect.y + rect.h + gap &&
        y + h + gap > rect.y
      ) {
        return true
      }
    }
    return false
  }

  function distanceToConnected(
    nodeId: string,
    x: number,
    y: number,
    w: number,
    h: number
  ): number {
    const connected = adjacency.get(nodeId)
    if (!connected || connected.size === 0) return 0

    let totalDist = 0
    let count = 0
    const cx = x + w / 2
    const cy = y + h / 2

    for (const rect of placed) {
      if (connected.has(rect.id)) {
        const rcx = rect.x + rect.w / 2
        const rcy = rect.y + rect.h / 2
        totalDist += Math.sqrt((cx - rcx) ** 2 + (cy - rcy) ** 2)
        count++
      }
    }

    return count > 0 ? totalDist / count : 0
  }

  function findBestPosition(
    nodeId: string,
    w: number,
    h: number
  ): { x: number; y: number } {
    const candidates: { x: number; y: number; packScore: number; edgeScore: number }[] = []

    candidates.push({ x: startX, y: startY, packScore: 0, edgeScore: 0 })

    for (const rect of placed) {
      const rightX = rect.x + rect.w + gap
      if (rightX + w <= startX + maxWidth) {
        candidates.push({
          x: rightX,
          y: rect.y,
          packScore: rect.y * 10000 + rightX,
          edgeScore: 0,
        })
      }

      candidates.push({
        x: rect.x,
        y: rect.y + rect.h + gap,
        packScore: (rect.y + rect.h + gap) * 10000 + rect.x,
        edgeScore: 0,
      })
      candidates.push({
        x: startX,
        y: rect.y + rect.h + gap,
        packScore: (rect.y + rect.h + gap) * 10000,
        edgeScore: 0,
      })

      if (rightX + w <= startX + maxWidth) {
        candidates.push({
          x: rightX,
          y: startY,
          packScore: startY * 10000 + rightX,
          edgeScore: 0,
        })
      }
    }

    // Calculate edge distance scores for valid candidates
    const validCandidates: typeof candidates = []
    for (const cand of candidates) {
      if (
        cand.x >= startX &&
        cand.y >= startY &&
        cand.x + w <= startX + maxWidth &&
        !overlaps(cand.x, cand.y, w, h)
      ) {
        cand.edgeScore = distanceToConnected(nodeId, cand.x, cand.y, w, h)
        validCandidates.push(cand)
      }
    }

    if (validCandidates.length === 0) {
      let maxBottom = startY
      for (const rect of placed) {
        maxBottom = Math.max(maxBottom, rect.y + rect.h + gap)
      }
      return { x: startX, y: maxBottom }
    }

    // Sort by edge distance first, then by packing score
    validCandidates.sort((a, b) => {
      if (a.edgeScore > 0 || b.edgeScore > 0) {
        const edgeDiff = a.edgeScore - b.edgeScore
        if (Math.abs(edgeDiff) > 50) return edgeDiff
      }
      return a.packScore - b.packScore
    })

    return { x: validCandidates[0].x, y: validCandidates[0].y }
  }

  for (const node of sorted) {
    const w = node.width || NODE_DEFAULTS.WIDTH
    const h = node.height || NODE_DEFAULTS.HEIGHT
    const pos = findBestPosition(node.id, w, h)
    targets.set(node.id, pos)
    placed.push({ id: node.id, x: pos.x, y: pos.y, w, h })
  }

  return targets
}

export const GridLayoutStrategy: LayoutStrategy = {
  name: 'grid',
  displayName: 'Grid',
  description: 'Compact grid layout with optional edge-aware placement',
  icon: 'grid',
  supportsEdges: true,
  recommendedFor: 'disconnected',
  maxRecommendedNodes: 10000,

  async calculate(
    nodes: LayoutNode[],
    edges: LayoutEdge[],
    options: GridLayoutStrategyOptions
  ): Promise<Map<string, { x: number; y: number }>> {
    if (nodes.length === 0) {
      return new Map()
    }

    const gap = options.gap ?? 30

    // Use fast grid for very large graphs or when edge-aware is disabled
    const useFastGrid = nodes.length > 500 || options.edgeAware === false

    if (useFastGrid) {
      const fastNodes = nodes.map((n) => ({
        id: n.id,
        width: n.width || NODE_DEFAULTS.WIDTH,
        height: n.height || NODE_DEFAULTS.HEIGHT,
      }))

      return fastGridLayout(fastNodes, {
        centerX: options.centerX,
        centerY: options.centerY,
        gap,
        columns: options.columns,
      })
    }

    // Use tetris layout for smaller graphs (edge-aware placement)
    const trialTargets = tetrisGridLayout(nodes, edges, 0, 0, gap)

    if (trialTargets.size === 0) {
      return new Map()
    }

    // Calculate bounds and center the result
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity
    for (const node of nodes) {
      const pos = trialTargets.get(node.id)
      if (!pos) continue
      const w = node.width || NODE_DEFAULTS.WIDTH
      const h = node.height || NODE_DEFAULTS.HEIGHT
      minX = Math.min(minX, pos.x)
      minY = Math.min(minY, pos.y)
      maxX = Math.max(maxX, pos.x + w)
      maxY = Math.max(maxY, pos.y + h)
    }

    const layoutCenterX = (minX + maxX) / 2
    const layoutCenterY = (minY + maxY) / 2
    const offsetX = options.centerX - layoutCenterX
    const offsetY = options.centerY - layoutCenterY

    const centeredPositions = new Map<string, { x: number; y: number }>()
    for (const [id, pos] of trialTargets) {
      centeredPositions.set(id, { x: pos.x + offsetX, y: pos.y + offsetY })
    }

    return centeredPositions
  },
}
