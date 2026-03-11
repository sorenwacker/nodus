/**
 * Spatial Index for fast obstacle lookups
 * Uses a grid-based spatial hash for O(1) average case lookups
 */

import type { NodeRect } from './types'

const DEFAULT_CELL_SIZE = 200 // Roughly average node size

export class SpatialIndex {
  private cellSize: number
  private grid: Map<string, NodeRect[]> = new Map()
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
      const cells = this.getNodeCells(node)
      for (const cell of cells) {
        const existing = this.grid.get(cell)
        if (existing) {
          existing.push(node)
        } else {
          this.grid.set(cell, [node])
        }
      }
    }
  }

  /**
   * Get all cells that a node occupies
   */
  private getNodeCells(node: NodeRect): string[] {
    const cells: string[] = []
    const left = node.canvas_x
    const right = node.canvas_x + (node.width || 200)
    const top = node.canvas_y
    const bottom = node.canvas_y + (node.height || 120)

    const startCol = Math.floor(left / this.cellSize)
    const endCol = Math.floor(right / this.cellSize)
    const startRow = Math.floor(top / this.cellSize)
    const endRow = Math.floor(bottom / this.cellSize)

    for (let row = startRow; row <= endRow; row++) {
      for (let col = startCol; col <= endCol; col++) {
        cells.push(`${col},${row}`)
      }
    }

    return cells
  }

  /**
   * Get cells for a bounding box region
   */
  private getRegionCells(minX: number, minY: number, maxX: number, maxY: number): string[] {
    const cells: string[] = []
    const startCol = Math.floor(minX / this.cellSize)
    const endCol = Math.floor(maxX / this.cellSize)
    const startRow = Math.floor(minY / this.cellSize)
    const endRow = Math.floor(maxY / this.cellSize)

    for (let row = startRow; row <= endRow; row++) {
      for (let col = startCol; col <= endCol; col++) {
        cells.push(`${col},${row}`)
      }
    }

    return cells
  }

  /**
   * Query nodes in a bounding box region
   * Returns unique nodes that potentially intersect the region
   */
  queryRegion(minX: number, minY: number, maxX: number, maxY: number, excludeIds?: Set<string>): NodeRect[] {
    const cells = this.getRegionCells(minX, minY, maxX, maxY)
    const seen = new Set<string>()
    const results: NodeRect[] = []

    for (const cell of cells) {
      const nodes = this.grid.get(cell)
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
