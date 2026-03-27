/**
 * Grid-based spatial index for efficient viewport culling
 *
 * Divides canvas into fixed-size cells for O(k) viewport queries
 * where k = nodes in visible cells, instead of O(n) full scan
 */

import type { Node } from '../../types'
import { NODE_DEFAULTS } from '../constants'

export interface SpatialGridOptions {
  cellSize?: number // Size of each grid cell in canvas coordinates
}

export class SpatialGrid {
  private cellSize: number
  private cells: Map<string, Set<string>> = new Map()
  private nodePositions: Map<
    string,
    { minCellX: number; minCellY: number; maxCellX: number; maxCellY: number }
  > = new Map()

  constructor(options: SpatialGridOptions = {}) {
    this.cellSize = options.cellSize || 500
  }

  /**
   * Build the spatial index from a list of nodes
   */
  build(nodes: Node[]): void {
    this.cells.clear()
    this.nodePositions.clear()

    for (const node of nodes) {
      this.insert(node)
    }
  }

  /**
   * Insert a single node into the grid
   */
  private insert(node: Node): void {
    const width = node.width || NODE_DEFAULTS.WIDTH
    const height = node.height || NODE_DEFAULTS.HEIGHT

    const minCellX = Math.floor(node.canvas_x / this.cellSize)
    const minCellY = Math.floor(node.canvas_y / this.cellSize)
    const maxCellX = Math.floor((node.canvas_x + width) / this.cellSize)
    const maxCellY = Math.floor((node.canvas_y + height) / this.cellSize)

    this.nodePositions.set(node.id, { minCellX, minCellY, maxCellX, maxCellY })

    // Add node to all cells it overlaps
    for (let cx = minCellX; cx <= maxCellX; cx++) {
      for (let cy = minCellY; cy <= maxCellY; cy++) {
        const key = `${cx},${cy}`
        let cell = this.cells.get(key)
        if (!cell) {
          cell = new Set()
          this.cells.set(key, cell)
        }
        cell.add(node.id)
      }
    }
  }

  /**
   * Query nodes that intersect a viewport rectangle
   * Returns node IDs that are potentially visible (may include false positives at cell boundaries)
   */
  queryViewport(
    viewLeft: number,
    viewTop: number,
    viewRight: number,
    viewBottom: number
  ): Set<string> {
    const minCellX = Math.floor(viewLeft / this.cellSize)
    const minCellY = Math.floor(viewTop / this.cellSize)
    const maxCellX = Math.floor(viewRight / this.cellSize)
    const maxCellY = Math.floor(viewBottom / this.cellSize)

    const result = new Set<string>()

    // Collect all nodes from cells that intersect the viewport
    for (let cx = minCellX; cx <= maxCellX; cx++) {
      for (let cy = minCellY; cy <= maxCellY; cy++) {
        const cell = this.cells.get(`${cx},${cy}`)
        if (cell) {
          for (const nodeId of cell) {
            result.add(nodeId)
          }
        }
      }
    }

    return result
  }

  /**
   * Get statistics for debugging
   */
  getStats(): { cellCount: number; nodeCount: number; avgNodesPerCell: number } {
    const cellCount = this.cells.size
    const nodeCount = this.nodePositions.size
    let totalNodes = 0
    for (const cell of this.cells.values()) {
      totalNodes += cell.size
    }
    return {
      cellCount,
      nodeCount,
      avgNodesPerCell: cellCount > 0 ? totalNodes / cellCount : 0,
    }
  }
}
