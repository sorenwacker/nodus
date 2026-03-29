/**
 * Tetris-style bin packing layout algorithm
 * Places nodes in a grid with edge-aware placement to minimize edge length
 */
import { NODE_DEFAULTS } from '../../constants'

interface LayoutNode {
  id: string
  width?: number
  height?: number
}

interface LayoutEdge {
  source_node_id: string
  target_node_id: string
}

interface PlacedRect {
  id: string
  x: number
  y: number
  w: number
  h: number
}

/**
 * Build adjacency map from nodes and edges for connectivity analysis
 */
function buildAdjacencyMap(
  nodes: LayoutNode[],
  edges: LayoutEdge[]
): Map<string, Set<string>> {
  const nodeIds = new Set(nodes.map(n => n.id))
  const adjacency = new Map<string, Set<string>>()

  for (const node of nodes) {
    adjacency.set(node.id, new Set())
  }

  for (const edge of edges) {
    if (nodeIds.has(edge.source_node_id) && nodeIds.has(edge.target_node_id)) {
      adjacency.get(edge.source_node_id)?.add(edge.target_node_id)
      adjacency.get(edge.target_node_id)?.add(edge.source_node_id)
    }
  }

  return adjacency
}

/**
 * Check if a rectangle overlaps with any placed rectangles
 */
function checkOverlap(
  x: number,
  y: number,
  w: number,
  h: number,
  gap: number,
  placed: PlacedRect[]
): boolean {
  for (const rect of placed) {
    if (x < rect.x + rect.w + gap &&
        x + w + gap > rect.x &&
        y < rect.y + rect.h + gap &&
        y + h + gap > rect.y) {
      return true
    }
  }
  return false
}

/**
 * Calculate average distance to connected placed nodes
 */
function calculateDistanceToConnected(
  nodeId: string,
  x: number,
  y: number,
  w: number,
  h: number,
  adjacency: Map<string, Set<string>>,
  placed: PlacedRect[]
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

/**
 * Find the best position for a node considering packing and edge proximity
 */
function findBestPosition(
  nodeId: string,
  w: number,
  h: number,
  startX: number,
  startY: number,
  maxWidth: number,
  gap: number,
  placed: PlacedRect[],
  adjacency: Map<string, Set<string>>
): { x: number; y: number } {
  interface Candidate {
    x: number
    y: number
    packScore: number
    edgeScore: number
  }

  const candidates: Candidate[] = []

  // Start position
  candidates.push({ x: startX, y: startY, packScore: 0, edgeScore: 0 })

  // Generate candidates from placed rectangles
  for (const rect of placed) {
    const rightX = rect.x + rect.w + gap
    if (rightX + w <= startX + maxWidth) {
      candidates.push({ x: rightX, y: rect.y, packScore: rect.y * 10000 + rightX, edgeScore: 0 })
    }

    candidates.push({ x: rect.x, y: rect.y + rect.h + gap, packScore: (rect.y + rect.h + gap) * 10000 + rect.x, edgeScore: 0 })
    candidates.push({ x: startX, y: rect.y + rect.h + gap, packScore: (rect.y + rect.h + gap) * 10000, edgeScore: 0 })

    if (rightX + w <= startX + maxWidth) {
      candidates.push({ x: rightX, y: startY, packScore: startY * 10000 + rightX, edgeScore: 0 })
    }

    // Check gaps between placed rectangles
    for (const other of placed) {
      if (other === rect) continue
      if (other.y > rect.y + rect.h + gap) {
        const gapTop = rect.y + rect.h + gap
        const gapHeight = other.y - gapTop - gap
        if (gapHeight >= h) {
          candidates.push({ x: rect.x, y: gapTop, packScore: gapTop * 10000 + rect.x, edgeScore: 0 })
        }
      }
    }
  }

  // Filter valid candidates and calculate edge scores
  const validCandidates: Candidate[] = []
  for (const cand of candidates) {
    if (cand.x >= startX && cand.y >= startY &&
        cand.x + w <= startX + maxWidth &&
        !checkOverlap(cand.x, cand.y, w, h, gap, placed)) {
      cand.edgeScore = calculateDistanceToConnected(nodeId, cand.x, cand.y, w, h, adjacency, placed)
      validCandidates.push(cand)
    }
  }

  if (validCandidates.length === 0) {
    // No valid position found - place at bottom
    let maxBottom = startY
    for (const rect of placed) {
      maxBottom = Math.max(maxBottom, rect.y + rect.h + gap)
    }
    return { x: startX, y: maxBottom }
  }

  // Sort by edge distance first (minimize edge length), then by packing score
  validCandidates.sort((a, b) => {
    if (a.edgeScore > 0 || b.edgeScore > 0) {
      const edgeDiff = a.edgeScore - b.edgeScore
      if (Math.abs(edgeDiff) > 50) return edgeDiff
    }
    return a.packScore - b.packScore
  })

  return { x: validCandidates[0].x, y: validCandidates[0].y }
}

/**
 * Tetris-style bin packing for grid layout with edge-aware placement.
 * Places connected nodes closer together to minimize total edge length.
 */
export function tetrisGridLayout(
  nodes: LayoutNode[],
  edges: LayoutEdge[],
  startX: number,
  startY: number,
  gap: number
): Map<string, { x: number; y: number }> {
  const targets = new Map<string, { x: number; y: number }>()

  if (nodes.length === 0) return targets

  const adjacency = buildAdjacencyMap(nodes, edges)

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

  // Track placed rectangles
  const placed: PlacedRect[] = []

  for (const node of sorted) {
    const w = node.width || NODE_DEFAULTS.WIDTH
    const h = node.height || NODE_DEFAULTS.HEIGHT
    const pos = findBestPosition(node.id, w, h, startX, startY, maxWidth, gap, placed, adjacency)
    targets.set(node.id, pos)
    placed.push({ id: node.id, x: pos.x, y: pos.y, w, h })
  }

  return targets
}
