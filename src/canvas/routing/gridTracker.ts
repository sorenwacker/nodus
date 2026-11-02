/**
 * Grid-based edge tracking to prevent overlapping edges
 *
 * Each grid point tracks which directions have edges passing through:
 * - 'h': horizontal (90°)
 * - 'v': vertical (90°)
 * - 'd+': diagonal up-right (45° ↗)
 * - 'd-': diagonal down-right (45° ↘)
 */

export type Direction = 'h' | 'v' | 'd+' | 'd-'

export interface Segment {
  x1: number
  y1: number
  x2: number
  y2: number
  direction: Direction
}

export const DEFAULT_GRID_SIZE = 20

/**
 * GridTracker manages edge occupancy on a grid to prevent overlapping paths
 */
/** One bit per direction, so a cell's occupancy is a small integer */
const DIRECTION_BIT: Record<Direction, number> = { h: 1, v: 2, 'd+': 4, 'd-': 8 }

export class GridTracker {
  /**
   * Occupied directions per cell: row index -> column index -> direction
   * bits. Small-integer keys and bitmasks, not strings and Sets: routing walks
   * every cell of every segment, often several times while it looks for a
   * free lane, and allocating a key and a point per cell cost more than the
   * routing itself (PRODUCT_DESIGN.md > Routing cost).
   */
  private grid: Map<number, Map<number, number>> = new Map()
  private gridSize: number

  constructor(gridSize: number = DEFAULT_GRID_SIZE) {
    this.gridSize = gridSize
  }

  /**
   * Snap a coordinate to the nearest grid point
   */
  snap(val: number): number {
    return Math.round(val / this.gridSize) * this.gridSize
  }

  private index(val: number): number {
    return Math.round(val / this.gridSize)
  }

  private bits(ix: number, iy: number): number {
    return this.grid.get(iy)?.get(ix) ?? 0
  }

  private setBits(ix: number, iy: number, bits: number): void {
    let row = this.grid.get(iy)
    if (!row) {
      row = new Map()
      this.grid.set(iy, row)
    }
    row.set(ix, bits)
  }

  /**
   * Determine the direction of a segment
   */
  getDirection(x1: number, y1: number, x2: number, y2: number): Direction {
    const dx = x2 - x1
    const dy = y2 - y1

    // Horizontal segment
    if (Math.abs(dy) < 1) return 'h'
    // Vertical segment
    if (Math.abs(dx) < 1) return 'v'

    // Diagonal: d+ means both increase or both decrease (same sign)
    // d- means opposite signs
    return (dx >= 0) === (dy >= 0) ? 'd+' : 'd-'
  }

  /**
   * Check if a segment can be placed (no conflicts on the grid)
   */
  canPlace(x1: number, y1: number, x2: number, y2: number): boolean {
    const dir = this.getDirection(x1, y1, x2, y2)
    return this.canPlaceWithDirection(x1, y1, x2, y2, dir)
  }

  /**
   * Check if a segment with known direction can be placed
   */
  canPlaceWithDirection(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    dir: Direction
  ): boolean {
    const bit = DIRECTION_BIT[dir]
    return this.forEachCell(x1, y1, x2, y2, dir, (ix, iy) => (this.bits(ix, iy) & bit) === 0)
  }

  /**
   * Mark a segment as used on the grid
   */
  mark(x1: number, y1: number, x2: number, y2: number): void {
    const dir = this.getDirection(x1, y1, x2, y2)
    this.markWithDirection(x1, y1, x2, y2, dir)
  }

  /**
   * Mark a segment with known direction as used
   */
  markWithDirection(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    dir: Direction
  ): void {
    const bit = DIRECTION_BIT[dir]
    this.forEachCell(x1, y1, x2, y2, dir, (ix, iy) => {
      this.setBits(ix, iy, this.bits(ix, iy) | bit)
      return true
    })
  }

  /**
   * Visit every grid cell along a segment, in order, until the visitor
   * returns false. Returns whether every visit returned true.
   */
  private forEachCell(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    dir: Direction,
    visit: (ix: number, iy: number) => boolean
  ): boolean {
    if (dir === 'h') {
      // Horizontal: iterate X, fixed Y
      const iy = this.index(y1)
      const last = this.index(Math.max(x1, x2))
      for (let ix = this.index(Math.min(x1, x2)); ix <= last; ix++) {
        if (!visit(ix, iy)) return false
      }
    } else if (dir === 'v') {
      // Vertical: iterate Y, fixed X
      const ix = this.index(x1)
      const last = this.index(Math.max(y1, y2))
      for (let iy = this.index(Math.min(y1, y2)); iy <= last; iy++) {
        if (!visit(ix, iy)) return false
      }
    } else {
      // Diagonal: step along both axes
      const dx = x2 - x1
      const dy = y2 - y1
      const steps = Math.round(Math.max(Math.abs(dx), Math.abs(dy)) / this.gridSize)
      const stepX = dx >= 0 ? this.gridSize : -this.gridSize
      const stepY = dy >= 0 ? this.gridSize : -this.gridSize
      for (let i = 0; i <= steps; i++) {
        if (!visit(this.index(x1 + i * stepX), this.index(y1 + i * stepY))) return false
      }
    }
    return true
  }

  /**
   * Find a free channel by trying offset values
   * Returns the offset that produces a conflict-free path
   */
  findFreeChannel(
    idealValue: number,
    isHorizontal: boolean,
    rangeStart: number,
    rangeEnd: number,
    maxAttempts: number = 10
  ): number {
    const gridVal = this.snap(idealValue)
    const dir: Direction = isHorizontal ? 'h' : 'v'

    for (let offset = 0; offset <= maxAttempts; offset++) {
      // Alternate between positive and negative offsets
      const tryVal =
        offset === 0
          ? gridVal
          : gridVal + (offset % 2 === 1 ? 1 : -1) * Math.ceil(offset / 2) * this.gridSize

      const canPlace = isHorizontal
        ? this.canPlaceWithDirection(rangeStart, tryVal, rangeEnd, tryVal, dir)
        : this.canPlaceWithDirection(tryVal, rangeStart, tryVal, rangeEnd, dir)

      if (canPlace) {
        return tryVal
      }
    }

    // Fallback to ideal value
    return gridVal
  }

  /**
   * Find and mark a free channel in one operation
   */
  findAndMarkChannel(
    idealValue: number,
    isHorizontal: boolean,
    rangeStart: number,
    rangeEnd: number,
    maxAttempts: number = 10
  ): number {
    const channel = this.findFreeChannel(idealValue, isHorizontal, rangeStart, rangeEnd, maxAttempts)

    if (isHorizontal) {
      this.markWithDirection(rangeStart, channel, rangeEnd, channel, 'h')
    } else {
      this.markWithDirection(channel, rangeStart, channel, rangeEnd, 'v')
    }

    return channel
  }

  /**
   * Check if a diagonal segment (45°) can be placed
   */
  canPlaceDiagonal(x1: number, y1: number, x2: number, y2: number): boolean {
    const dir = this.getDirection(x1, y1, x2, y2)
    if (dir !== 'd+' && dir !== 'd-') {
      // Not a diagonal - use regular check
      return this.canPlace(x1, y1, x2, y2)
    }
    return this.canPlaceWithDirection(x1, y1, x2, y2, dir)
  }

  /**
   * Mark a diagonal segment as used
   */
  markDiagonal(x1: number, y1: number, x2: number, y2: number): void {
    const dir = this.getDirection(x1, y1, x2, y2)
    this.markWithDirection(x1, y1, x2, y2, dir)
  }

  /**
   * Clear all tracked segments
   */
  reset(): void {
    this.grid.clear()
  }

  /**
   * Get the grid size
   */
  getGridSize(): number {
    return this.gridSize
  }

  /**
   * Get count of used grid points (for debugging)
   */
  getUsedCount(): number {
    let count = 0
    for (const row of this.grid.values()) {
      for (const bits of row.values()) {
        for (let b = bits; b; b &= b - 1) count++
      }
    }
    return count
  }
}
