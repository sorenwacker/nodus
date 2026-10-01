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
 * The placed rectangles, bucketed by grid cell for overlap tests.
 *
 * Every candidate position was tested against every placed rectangle, and a
 * node's candidates grow with the square of what is placed, so the layout cost
 * grew with the fourth power of the node count: 2 s at 300 nodes, 100 s at 800
 * (PRODUCT_DESIGN.md > Grid layout cost). Each rectangle is filed under the
 * cells its gap-extended extent covers, so a query returns every rectangle
 * that can overlap, and the original test decides.
 */
class PlacedIndex {
  readonly all: PlacedRect[] = []
  private cells = new Map<number, Map<number, PlacedRect[]>>()

  constructor(
    private readonly cellSize: number,
    private readonly gap: number
  ) {}

  add(rect: PlacedRect): void {
    this.all.push(rect)
    const c0 = Math.floor(rect.x / this.cellSize)
    const c1 = Math.floor((rect.x + rect.w + this.gap) / this.cellSize)
    const r0 = Math.floor(rect.y / this.cellSize)
    const r1 = Math.floor((rect.y + rect.h + this.gap) / this.cellSize)
    for (let r = r0; r <= r1; r++) {
      let row = this.cells.get(r)
      if (!row) {
        row = new Map()
        this.cells.set(r, row)
      }
      for (let c = c0; c <= c1; c++) {
        const list = row.get(c)
        if (list) list.push(rect)
        else row.set(c, [rect])
      }
    }
  }

  /** Whether a w x h box at (x, y) comes within `gap` of a placed rectangle */
  overlaps(x: number, y: number, w: number, h: number): boolean {
    const gap = this.gap
    const c0 = Math.floor(x / this.cellSize)
    const c1 = Math.floor((x + w + gap) / this.cellSize)
    const r0 = Math.floor(y / this.cellSize)
    const r1 = Math.floor((y + h + gap) / this.cellSize)
    for (let r = r0; r <= r1; r++) {
      const row = this.cells.get(r)
      if (!row) continue
      for (let c = c0; c <= c1; c++) {
        const list = row.get(c)
        if (!list) continue
        for (const rect of list) {
          if (x < rect.x + rect.w + gap &&
              x + w + gap > rect.x &&
              y < rect.y + rect.h + gap &&
              y + h + gap > rect.y) {
            return true
          }
        }
      }
    }
    return false
  }
}

/**
 * Calculate average distance to connected placed nodes
 */
function calculateDistanceToConnected(
  x: number,
  y: number,
  w: number,
  h: number,
  connectedPlaced: PlacedRect[]
): number {
  let totalDist = 0
  let count = 0
  const cx = x + w / 2
  const cy = y + h / 2

  // In placement order, so the sum is the same floating-point sum as before
  for (const rect of connectedPlaced) {
    const rcx = rect.x + rect.w / 2
    const rcy = rect.y + rect.h / 2
    totalDist += Math.sqrt((cx - rcx) ** 2 + (cy - rcy) ** 2)
    count++
  }

  return count > 0 ? totalDist / count : 0
}

/**
 * Find the best position for a node using tetris-style packing
 * Prioritizes filling gaps and packing tightly
 */
function findBestPosition(
  nodeId: string,
  w: number,
  h: number,
  startX: number,
  startY: number,
  maxWidth: number,
  gap: number,
  index: PlacedIndex,
  adjacency: Map<string, Set<string>>
): { x: number; y: number } {
  const placed = index.all
  interface Candidate {
    x: number
    y: number
    packScore: number
    edgeScore: number
    fillsGap: boolean
  }

  // Candidates are tested as they are generated and only valid ones kept, in
  // generation order: the same list the old generate-then-filter produced,
  // without allocating the invalid ones (most of them)
  const connected = adjacency.get(nodeId)
  const connectedPlaced = connected && connected.size > 0 ? placed.filter(r => connected.has(r.id)) : []
  const validCandidates: Candidate[] = []
  const candidates = {
    push(cand: Candidate): void {
      if (cand.x >= startX && cand.y >= startY &&
          cand.x + w <= startX + maxWidth &&
          !index.overlaps(cand.x, cand.y, w, h)) {
        cand.edgeScore = calculateDistanceToConnected(cand.x, cand.y, w, h, connectedPlaced)
        validCandidates.push(cand)
      }
    },
  }

  // Start position
  candidates.push({ x: startX, y: startY, packScore: 0, edgeScore: 0, fillsGap: false })

  // Generate candidates from placed rectangles - tetris style
  for (const rect of placed) {
    // Right of this rectangle (same row)
    const rightX = rect.x + rect.w + gap
    if (rightX + w <= startX + maxWidth) {
      candidates.push({ x: rightX, y: rect.y, packScore: rect.y * 10000 + rightX, edgeScore: 0, fillsGap: false })
    }

    // Below this rectangle
    candidates.push({ x: rect.x, y: rect.y + rect.h + gap, packScore: (rect.y + rect.h + gap) * 10000 + rect.x, edgeScore: 0, fillsGap: false })

    // Start of row below
    candidates.push({ x: startX, y: rect.y + rect.h + gap, packScore: (rect.y + rect.h + gap) * 10000, edgeScore: 0, fillsGap: false })

    // Top of layout, right of placed
    if (rightX + w <= startX + maxWidth) {
      candidates.push({ x: rightX, y: startY, packScore: startY * 10000 + rightX, edgeScore: 0, fillsGap: false })
    }

    // Check for gaps between placed rectangles (tetris-style gap filling)
    for (const other of placed) {
      if (other === rect) continue

      // Vertical gap below rect
      if (other.y > rect.y + rect.h + gap) {
        const gapTop = rect.y + rect.h + gap
        const gapHeight = other.y - gapTop - gap
        if (gapHeight >= h) {
          candidates.push({ x: rect.x, y: gapTop, packScore: gapTop * 10000 + rect.x, edgeScore: 0, fillsGap: true })
        }
      }

      // Horizontal gap to the right of rect
      if (other.x > rect.x + rect.w + gap &&
          Math.max(rect.y, other.y) < Math.min(rect.y + rect.h, other.y + other.h)) {
        const gapLeft = rect.x + rect.w + gap
        const gapWidth = other.x - gapLeft - gap
        if (gapWidth >= w) {
          const gapY = Math.max(rect.y, other.y)
          candidates.push({ x: gapLeft, y: gapY, packScore: gapY * 10000 + gapLeft, edgeScore: 0, fillsGap: true })
        }
      }
    }
  }

  // Also try positions aligned with existing rectangle edges
  for (const rect of placed) {
    // Try aligning left edge
    if (!index.overlaps(rect.x, rect.y + rect.h + gap, w, h)) {
      candidates.push({ x: rect.x, y: rect.y + rect.h + gap, packScore: (rect.y + rect.h + gap) * 10000 + rect.x, edgeScore: 0, fillsGap: false })
    }
    // Try aligning right edge
    const rightAligned = rect.x + rect.w - w
    if (rightAligned >= startX && !index.overlaps(rightAligned, rect.y + rect.h + gap, w, h)) {
      candidates.push({ x: rightAligned, y: rect.y + rect.h + gap, packScore: (rect.y + rect.h + gap) * 10000 + rightAligned, edgeScore: 0, fillsGap: false })
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

  // Sort: prioritize gap filling, then edge proximity, then tight packing (top-left)
  validCandidates.sort((a, b) => {
    // Prefer filling gaps
    if (a.fillsGap !== b.fillsGap) return a.fillsGap ? -1 : 1

    // Consider edge proximity for connected nodes
    if (a.edgeScore > 0 || b.edgeScore > 0) {
      const edgeDiff = a.edgeScore - b.edgeScore
      if (Math.abs(edgeDiff) > 50) return edgeDiff
    }

    // Pack tightly (prefer top-left positions)
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

  // Track placed rectangles; cells as large as the largest card
  const index = new PlacedIndex(Math.max(maxNodeWidth, maxNodeHeight) + gap, gap)

  for (const node of sorted) {
    const w = node.width || NODE_DEFAULTS.WIDTH
    const h = node.height || NODE_DEFAULTS.HEIGHT
    const pos = findBestPosition(node.id, w, h, startX, startY, maxWidth, gap, index, adjacency)
    targets.set(node.id, pos)
    index.add({ id: node.id, x: pos.x, y: pos.y, w, h })
  }

  return targets
}
