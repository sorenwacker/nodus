/**
 * The grid layout gets faster without moving any node
 * (PRODUCT_DESIGN.md > Grid layout cost).
 */
import { describe, it, expect } from 'vitest'
import { createHash } from 'node:crypto'
import { tetrisGridLayout } from '../canvas/composables/layout/useTetrisLayout'

/** A deterministic graph with varied card sizes */
function graph(n: number, e: number, seed: number) {
  let s = seed
  const rand = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648
  const nodes = Array.from({ length: n }, (_, i) => ({
    id: `n${i}`,
    canvas_x: 0,
    canvas_y: 0,
    width: 160 + Math.round(rand() * 5) * 40,
    height: 100 + Math.round(rand() * 4) * 40,
  }))
  const edges = Array.from({ length: e }, (_, i) => ({
    id: `e${i}`,
    source_node_id: `n${Math.floor(rand() * n)}`,
    target_node_id: `n${Math.floor(rand() * n)}`,
  }))
  return { nodes, edges }
}

function fingerprint(): string {
  const hash = createHash('sha256')
  for (const [n, e, seed] of [[12, 10, 1], [60, 80, 2], [150, 220, 3]] as const) {
    const g = graph(n, e, seed)
    const placed = tetrisGridLayout(g.nodes, g.edges, 0, 0, 24)
    for (const id of [...placed.keys()].sort()) {
      const p = placed.get(id)!
      hash.update(`${n}|${id}|${p.x}|${p.y}\n`)
    }
  }
  return hash.digest('hex')
}

describe('grid layout', () => {
  it('places every node exactly as before its search was made faster', () => {
    expect(fingerprint()).toBe(BASELINE)
  })
})

const BASELINE = 'b91910c70d101b7078893505ec54f76a118200f65b4b96e25f26a257022bd74b'
