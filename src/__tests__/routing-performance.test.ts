/**
 * Edge routing gets faster without changing any route
 * (PRODUCT_DESIGN.md > Routing cost).
 */
import { describe, it, expect } from 'vitest'
import { createHash } from 'node:crypto'
import { routeAllEdges, SpatialIndex, setRoutingSpatialIndex } from '../canvas/routing'

type Style = 'orthogonal' | 'straight' | 'curved' | 'diagonal' | 'hyperbolic' | 'direct'

/** A deterministic graph: nodes on a jittered grid, edges from a linear congruential sequence */
function graph(n: number, e: number, seed: number) {
  let s = seed
  const rand = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648
  const nodes = Array.from({ length: n }, (_, i) => ({
    id: `n${i}`,
    canvas_x: (i % 30) * 320 + Math.round(rand() * 80),
    canvas_y: Math.floor(i / 30) * 220 + Math.round(rand() * 60),
    width: 200 + Math.round(rand() * 60),
    height: 120,
  }))
  const edges = Array.from({ length: e }, (_, i) => ({
    id: `e${i}`,
    source_node_id: `n${Math.floor(rand() * n)}`,
    target_node_id: `n${Math.floor(rand() * n)}`,
  })).filter(x => x.source_node_id !== x.target_node_id)
  return { nodes, edges, map: new Map(nodes.map(x => [x.id, x])) }
}

/** Route as the canvas does: with the spatial index installed */
function route(g: ReturnType<typeof graph>, style: Style) {
  const index = new SpatialIndex()
  index.build(g.map)
  setRoutingSpatialIndex(index)
  try {
    return routeAllEdges(g.edges, g.nodes, g.map, style)
  } finally {
    setRoutingSpatialIndex(null)
  }
}

function fingerprint(): string {
  const hash = createHash('sha256')
  for (const [n, e, seed] of [[40, 60, 1], [150, 250, 2], [300, 500, 3]] as const) {
    const g = graph(n, e, seed)
    for (const style of ['orthogonal', 'straight', 'curved', 'diagonal', 'hyperbolic', 'direct'] as Style[]) {
      const routed = route(g, style)
      for (const id of [...routed.keys()].sort()) hash.update(`${style}|${id}|${routed.get(id)!.svgPath}\n`)
    }
  }
  return hash.digest('hex')
}

describe('edge routing', () => {
  it('routes exactly as before the lane tracker and spatial index were rewritten', () => {
    expect(fingerprint()).toBe(BASELINE)
  })
})

const BASELINE = '6910b89c83b5222148fee179413f6ffc0fa479f3451a174a9ec00cbe3a4d13ee'
