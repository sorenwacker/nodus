/**
 * Fast grid layout using typed arrays for large node sets
 * No collision detection - pure grid placement
 */

export interface FastGridNode {
  id: string
  width: number
  height: number
}

export interface FastGridOptions {
  centerX: number
  centerY: number
  gap?: number
  columns?: number
}

/**
 * Fast grid layout - O(n) complexity
 * Uses typed arrays for position calculation
 */
export function fastGridLayout(
  nodes: FastGridNode[],
  options: FastGridOptions
): Map<string, { x: number; y: number }> {
  const n = nodes.length
  if (n === 0) return new Map()

  const gap = options.gap ?? 30
  const cols = options.columns ?? Math.ceil(Math.sqrt(n))
  const rows = Math.ceil(n / cols)

  // Use typed arrays for position calculation
  const xs = new Float64Array(n)
  const ys = new Float64Array(n)

  // Calculate average node size
  let totalWidth = 0
  let totalHeight = 0
  for (let i = 0; i < n; i++) {
    totalWidth += nodes[i].width
    totalHeight += nodes[i].height
  }
  const avgWidth = totalWidth / n
  const avgHeight = totalHeight / n

  const cellWidth = avgWidth + gap
  const cellHeight = avgHeight + gap

  // Calculate grid dimensions
  const gridWidth = cols * cellWidth
  const gridHeight = rows * cellHeight

  // Starting position (centered)
  const startX = options.centerX - gridWidth / 2
  const startY = options.centerY - gridHeight / 2

  // Calculate all positions in a single pass
  for (let i = 0; i < n; i++) {
    const col = i % cols
    const row = Math.floor(i / cols)
    xs[i] = startX + col * cellWidth
    ys[i] = startY + row * cellHeight
  }

  // Build result map
  const result = new Map<string, { x: number; y: number }>()
  for (let i = 0; i < n; i++) {
    result.set(nodes[i].id, { x: xs[i], y: ys[i] })
  }

  return result
}

/**
 * Batch update positions - minimizes store calls
 */
export function batchUpdatePositions(
  positions: Map<string, { x: number; y: number }>,
  updateFn: (id: string, x: number, y: number) => void,
  batchSize = 100
): Promise<void> {
  return new Promise((resolve) => {
    const entries = Array.from(positions.entries())
    let index = 0

    function processBatch() {
      const end = Math.min(index + batchSize, entries.length)

      for (let i = index; i < end; i++) {
        const [id, pos] = entries[i]
        updateFn(id, pos.x, pos.y)
      }

      index = end

      if (index < entries.length) {
        // Use requestAnimationFrame to avoid blocking UI
        requestAnimationFrame(processBatch)
      } else {
        resolve()
      }
    }

    processBatch()
  })
}
