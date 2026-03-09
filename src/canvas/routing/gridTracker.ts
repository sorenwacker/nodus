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
export class GridTracker {
  private grid: Map<string, Set<Direction>> = new Map()
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

  /**
   * Get grid key for a point
   */
  private getKey(x: number, y: number): string {
    return `${this.snap(x)},${this.snap(y)}`
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
    const points = this.getSegmentPoints(x1, y1, x2, y2, dir)

    for (const { x, y } of points) {
      const key = this.getKey(x, y)
      const dirs = this.grid.get(key)
      if (dirs && dirs.has(dir)) {
        return false
      }
    }
    return true
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
    const points = this.getSegmentPoints(x1, y1, x2, y2, dir)

    for (const { x, y } of points) {
      const key = this.getKey(x, y)
      if (!this.grid.has(key)) {
        this.grid.set(key, new Set())
      }
      this.grid.get(key)!.add(dir)
    }
  }

  /**
   * Get all grid points along a segment
   */
  private getSegmentPoints(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    dir: Direction
  ): Array<{ x: number; y: number }> {
    const points: Array<{ x: number; y: number }> = []

    if (dir === 'h') {
      // Horizontal: iterate X, fixed Y
      const gx1 = this.snap(Math.min(x1, x2))
      const gx2 = this.snap(Math.max(x1, x2))
      const gy = this.snap(y1)

      for (let gx = gx1; gx <= gx2; gx += this.gridSize) {
        points.push({ x: gx, y: gy })
      }
    } else if (dir === 'v') {
      // Vertical: iterate Y, fixed X
      const gx = this.snap(x1)
      const gy1 = this.snap(Math.min(y1, y2))
      const gy2 = this.snap(Math.max(y1, y2))

      for (let gy = gy1; gy <= gy2; gy += this.gridSize) {
        points.push({ x: gx, y: gy })
      }
    } else {
      // Diagonal: step along both axes
      const dx = x2 - x1
      const dy = y2 - y1
      const steps = Math.round(Math.max(Math.abs(dx), Math.abs(dy)) / this.gridSize)
      const stepX = dx >= 0 ? this.gridSize : -this.gridSize
      const stepY = dy >= 0 ? this.gridSize : -this.gridSize

      for (let i = 0; i <= steps; i++) {
        const gx = this.snap(x1 + i * stepX)
        const gy = this.snap(y1 + i * stepY)
        points.push({ x: gx, y: gy })
      }
    }

    return points
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
    for (const dirs of this.grid.values()) {
      count += dirs.size
    }
    return count
  }
}
