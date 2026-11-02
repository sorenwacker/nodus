/**
 * Spatial Index for fast obstacle lookups
 * Uses a grid-based spatial hash for O(1) average case lookups
 */

import type { NodeRect } from './types'

const DEFAULT_CELL_SIZE = 200 // Roughly average node size

export class SpatialIndex {
  private cellSize: number
  /**
   * Nodes per cell: row -> column -> nodes. Numeric keys, not "col,row"
   * strings: a long edge's query region spans hundreds of cells, and building a
   * string per cell per query dominated routing (PRODUCT_DESIGN.md > Routing cost).
   */
  private grid: Map<number, Map<number, NodeRect[]>> = new Map()
  private allNodes: NodeRect[] = []

  constructor(cellSize: number = DEFAULT_CELL_SIZE) {
    this.cellSize = cellSize
  }

  /**
   * Build index from nodes
   */
  build(nodes: NodeRect[] | Map<string, NodeRect>): void {
    this.grid.clear()
    this.allNodes = nodes instanceof Map ? Array.from(nodes.values()) : nodes

    for (const node of this.allNodes) {
      const startCol = Math.floor(node.canvas_x / this.cellSize)
      const endCol = Math.floor((node.canvas_x + (node.width || 200)) / this.cellSize)
      const startRow = Math.floor(node.canvas_y / this.cellSize)
      const endRow = Math.floor((node.canvas_y + (node.height || 120)) / this.cellSize)

      for (let row = startRow; row <= endRow; row++) {
        let cols = this.grid.get(row)
        if (!cols) {
          cols = new Map()
          this.grid.set(row, cols)
        }
        for (let col = startCol; col <= endCol; col++) {
          const existing = cols.get(col)
          if (existing) {
            existing.push(node)
          } else {
            cols.set(col, [node])
          }
        }
      }
    }
  }

  /**
   * Query nodes in a bounding box region
   * Returns unique nodes that potentially intersect the region, in row-major
   * cell order
   */
  queryRegion(minX: number, minY: number, maxX: number, maxY: number, excludeIds?: Set<string>): NodeRect[] {
    const startCol = Math.floor(minX / this.cellSize)
    const endCol = Math.floor(maxX / this.cellSize)
    const startRow = Math.floor(minY / this.cellSize)
    const endRow = Math.floor(maxY / this.cellSize)
    const seen = new Set<string>()
    const results: NodeRect[] = []

    for (let row = startRow; row <= endRow; row++) {
      const cols = this.grid.get(row)
      if (!cols) continue
      for (let col = startCol; col <= endCol; col++) {
        const nodes = cols.get(col)
        if (!nodes) continue

        for (const node of nodes) {
          if (node.id && seen.has(node.id)) continue
          if (node.id && excludeIds?.has(node.id)) continue

          // Verify actual intersection with region
          const nodeLeft = node.canvas_x
          const nodeRight = node.canvas_x + (node.width || 200)
          const nodeTop = node.canvas_y
          const nodeBottom = node.canvas_y + (node.height || 120)

          if (nodeLeft < maxX && nodeRight > minX && nodeTop < maxY && nodeBottom > minY) {
            if (node.id) seen.add(node.id)
            results.push(node)
          }
        }
      }
    }

    return results
  }

  /**
   * Query nodes along a line segment
   * Returns nodes that potentially intersect the segment
   */
  querySegment(x1: number, y1: number, x2: number, y2: number, excludeIds?: Set<string>): NodeRect[] {
    const minX = Math.min(x1, x2)
    const maxX = Math.max(x1, x2)
    const minY = Math.min(y1, y2)
    const maxY = Math.max(y1, y2)

    return this.queryRegion(minX, minY, maxX, maxY, excludeIds)
  }

  /**
   * Check if index is empty
   */
  isEmpty(): boolean {
    return this.allNodes.length === 0
  }

  /**
   * Get total node count
   */
  get size(): number {
    return this.allNodes.length
  }
}

// Singleton instance for reuse
let cachedIndex: SpatialIndex | null = null
let cachedNodeCount = 0

/**
 * Get or create a spatial index for the given nodes
 * Reuses cached index if node count hasn't changed
 */
export function getSpatialIndex(nodes: NodeRect[] | Map<string, NodeRect>): SpatialIndex {
  const nodeList = nodes instanceof Map ? Array.from(nodes.values()) : nodes

  if (!cachedIndex || cachedNodeCount !== nodeList.length) {
    cachedIndex = new SpatialIndex()
    cachedIndex.build(nodes)
    cachedNodeCount = nodeList.length
  }

  return cachedIndex
}

/**
 * Invalidate the cached spatial index
 * Call when nodes move or change
 */
export function invalidateSpatialIndex(): void {
  cachedIndex = null
  cachedNodeCount = 0
}
