/**
 * Compaction of a ranked layout (PRODUCT_DESIGN.md > Hierarchical layout
 * spacing).
 *
 * dagre reserves room in every rank for the edges it would draw through it:
 * an edge that spans several ranks gets a placeholder in each rank between.
 * The canvas routes its own edges and never uses dagre's, so on a graph with
 * many long edges most of a rank is empty space between cards. This pass
 * keeps dagre's ranks and its order within each rank, and re-places the cards
 * along the rank: packed to the gap, each centred over the cards it connects
 * to in the neighbouring ranks as far as the packing allows.
 */

export interface RankedNode {
  id: string
  /** Centre along the rank axis (y for a top-to-bottom layout) */
  rankPos: number
  /** Centre along the in-rank axis (x for a top-to-bottom layout) */
  pos: number
  /** Extent along the in-rank axis */
  size: number
}

export interface RankedEdge {
  source: string
  target: string
}

const SWEEPS = 3

/**
 * Least-squares placement of ordered items with minimum separations: each
 * item moves as little as possible from where it wants to be, in order.
 * Pool-adjacent-violators on the positions relative to a tight packing.
 */
function placeInOrder(desired: number[], sizes: number[], gap: number): number[] {
  const n = desired.length
  if (n === 0) return []
  // Where each item would sit if every item were packed from the first one at 0
  const packed: number[] = [0]
  for (let i = 1; i < n; i++) packed.push(packed[i - 1] + sizes[i - 1] / 2 + gap + sizes[i] / 2)
  // Relative to the packing the constraint is simply non-decreasing
  const target = desired.map((d, i) => d - packed[i])
  const blocks: { sum: number; count: number; start: number }[] = []
  for (let i = 0; i < n; i++) {
    let block = { sum: target[i], count: 1, start: i }
    while (blocks.length && blocks[blocks.length - 1].sum / blocks[blocks.length - 1].count > block.sum / block.count) {
      const prev = blocks.pop()!
      block = { sum: prev.sum + block.sum, count: prev.count + block.count, start: prev.start }
    }
    blocks.push(block)
  }
  const out = new Array<number>(n)
  for (const b of blocks) {
    const value = b.sum / b.count
    for (let i = b.start; i < b.start + b.count; i++) out[i] = value + packed[i]
  }
  return out
}

/**
 * Re-places every node along its rank. Returns the new in-rank centre per id.
 * Ranks are read from `rankPos`; the order within a rank from `pos`.
 */
export function compactRanks(nodes: RankedNode[], edges: RankedEdge[], gap: number): Map<string, number> {
  const byRank = new Map<number, RankedNode[]>()
  for (const n of nodes) {
    const key = Math.round(n.rankPos)
    if (!byRank.has(key)) byRank.set(key, [])
    byRank.get(key)!.push(n)
  }
  const ranks = [...byRank.entries()].sort((a, b) => a[0] - b[0]).map(([, list]) => list.sort((a, b) => a.pos - b.pos))
  const rankOf = new Map<string, number>()
  ranks.forEach((list, r) => list.forEach(n => rankOf.set(n.id, r)))

  const neighbours = new Map<string, string[]>()
  const link = (a: string, b: string) => {
    if (!neighbours.has(a)) neighbours.set(a, [])
    neighbours.get(a)!.push(b)
  }
  for (const e of edges) {
    if (!rankOf.has(e.source) || !rankOf.has(e.target) || e.source === e.target) continue
    link(e.source, e.target)
    link(e.target, e.source)
  }

  const pos = new Map<string, number>()
  for (const list of ranks) {
    let x = 0
    for (const n of list) {
      pos.set(n.id, x + n.size / 2)
      x += n.size + gap
    }
  }

  const meanOf = (id: string, pick: (r: number) => boolean): number | null => {
    const own = rankOf.get(id)!
    let sum = 0, count = 0
    for (const other of neighbours.get(id) ?? []) {
      if (pick(rankOf.get(other)! - own)) { sum += pos.get(other)!; count++ }
    }
    return count ? sum / count : null
  }

  const place = (list: RankedNode[], pick: (delta: number) => boolean) => {
    const desired = list.map(n => meanOf(n.id, pick) ?? pos.get(n.id)!)
    const placed = placeInOrder(desired, list.map(n => n.size), gap)
    list.forEach((n, i) => pos.set(n.id, placed[i]))
  }

  for (let sweep = 0; sweep < SWEEPS; sweep++) {
    for (let r = 1; r < ranks.length; r++) place(ranks[r], d => d < 0)
    for (let r = ranks.length - 2; r >= 0; r--) place(ranks[r], d => d > 0)
  }
  // A last pass down so every child sits under its parents where the packing allows
  for (let r = 1; r < ranks.length; r++) place(ranks[r], d => d < 0)

  return pos
}
