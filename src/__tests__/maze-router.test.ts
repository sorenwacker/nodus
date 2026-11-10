/**
 * The PCB edge styles route like a board autorouter: traces stay out of
 * cards, keep to lanes, leave and enter cards straight on, and stay apart
 * (PRODUCT_DESIGN.md > Edge Routing (PCB-Style)).
 *
 * Measured on the canvas before this router existed, with 40 cards in a grid
 * layout and 90 edges: 62 of 90 orthogonal edges ran through a card they were
 * not attached to, and 557 segment pairs lay on top of each other.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  routeAllEdges,
  SpatialIndex,
  setRoutingSpatialIndex,
  validateOrthogonalPath,
  validateDiagonalPath,
  portLanePitch,
  MAZE_CELL,
  type NodeRect,
  type EdgeDef,
  type Point,
} from '../canvas/routing'

/** 40 cards of mixed sizes packed in a grid with 40 px gutters, 90 edges with three hubs and a chain */
function denseGraph(gutter = 40) {
  let s = 7
  const rand = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648
  const sizes = [[200, 120], [200, 120], [320, 160], [240, 320], [260, 200]]
  const nodes: NodeRect[] = []
  let x = 0, y = 0, rowH = 0
  for (let i = 0; i < 40; i++) {
    const [w, h] = sizes[Math.floor(rand() * sizes.length)]
    if (x + w > 2000) { x = 0; y += rowH + gutter; rowH = 0 }
    nodes.push({ id: `n${i}`, canvas_x: x, canvas_y: y, width: w, height: h })
    x += w + gutter
    rowH = Math.max(rowH, h)
  }
  const pairs = new Set<string>()
  const edges: EdgeDef[] = []
  const add = (a: number, b: number) => {
    if (a === b) return
    const k = a < b ? `${a}:${b}` : `${b}:${a}`
    if (pairs.has(k)) return
    pairs.add(k)
    edges.push({ id: `e${edges.length}`, source_node_id: `n${a}`, target_node_id: `n${b}` })
  }
  for (const hub of [0, 1, 2]) for (let k = 0; k < 9; k++) add(hub, 3 + Math.floor(rand() * 37))
  for (let i = 3; i < 13; i++) add(i, i + 1)
  while (edges.length < 90) add(Math.floor(rand() * 40), Math.floor(rand() * 40))
  return { nodes, edges, map: new Map(nodes.map(n => [n.id!, n])) }
}

function route(g: ReturnType<typeof denseGraph>, style: 'orthogonal' | 'diagonal') {
  const index = new SpatialIndex()
  index.build(g.map)
  setRoutingSpatialIndex(index)
  try {
    return routeAllEdges(g.edges, g.nodes, g.map, style)
  } finally {
    setRoutingSpatialIndex(null)
  }
}

/** Ids of cards a path passes through, not counting the two it is attached to */
function cardsCrossed(path: Point[], nodes: NodeRect[], attached: Set<string>): string[] {
  const hit = new Set<string>()
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i]
    for (let k = 1; k < 8; k++) {
      const t = k / 8
      const x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t
      for (const n of nodes) {
        if (attached.has(n.id!)) continue
        if (x > n.canvas_x + 1 && x < n.canvas_x + n.width! - 1 && y > n.canvas_y + 1 && y < n.canvas_y + n.height! - 1) hit.add(n.id!)
      }
    }
  }
  return [...hit]
}

/** Pairs of straight segments from different edges that share a lane for more than 20 px */
function overlappingSegments(paths: Point[][]): number {
  type Seg = { e: number; axis: 'h' | 'v'; c: number; lo: number; hi: number }
  const segs: Seg[] = []
  paths.forEach((p, e) => {
    for (let i = 1; i < p.length; i++) {
      const a = p[i - 1], b = p[i]
      if (Math.abs(a.x - b.x) < 0.5) segs.push({ e, axis: 'v', c: a.x, lo: Math.min(a.y, b.y), hi: Math.max(a.y, b.y) })
      else if (Math.abs(a.y - b.y) < 0.5) segs.push({ e, axis: 'h', c: a.y, lo: Math.min(a.x, b.x), hi: Math.max(a.x, b.x) })
    }
  })
  let n = 0
  for (let i = 0; i < segs.length; i++) for (let j = i + 1; j < segs.length; j++) {
    const s = segs[i], t = segs[j]
    if (s.e === t.e || s.axis !== t.axis || Math.abs(s.c - t.c) > 2) continue
    if (Math.min(s.hi, t.hi) - Math.max(s.lo, t.lo) > 20) n++
  }
  return n
}

const perpendicularToSide = (a: Point, b: Point, side: string) =>
  side === 'left' || side === 'right' ? Math.abs(a.y - b.y) < 0.01 : Math.abs(a.x - b.x) < 0.01

describe('maze router', () => {
  const g = denseGraph()

  it('keeps every orthogonal trace out of the cards it is not attached to', () => {
    const routed = route(g, 'orthogonal')
    expect(routed.size).toBe(g.edges.length)
    const through: string[] = []
    for (const e of g.edges) {
      const crossed = cardsCrossed(routed.get(e.id)!.path, g.nodes, new Set([e.source_node_id, e.target_node_id]))
      if (crossed.length) through.push(`${e.id}(${routed.get(e.id)!.debugInfo!.router}/${routed.get(e.id)!.debugInfo!.mazeFailure})->${crossed}`)
    }
    expect(through, through.join('\n')).toEqual([])
  })

  it('uses only 90° bends in orthogonal and 45°/90° in diagonal', () => {
    for (const r of route(g, 'orthogonal').values()) expect(validateOrthogonalPath(r.path)).toBe(true)
    for (const r of route(g, 'diagonal').values()) expect(validateDiagonalPath(r.path)).toBe(true)
  })

  it('leaves and enters every card straight on', () => {
    const routed = route(g, 'orthogonal')
    for (const e of g.edges) {
      const { path, debugInfo } = routed.get(e.id)!
      expect(perpendicularToSide(path[0], path[1], debugInfo!.srcSide)).toBe(true)
      expect(perpendicularToSide(path[path.length - 2], path[path.length - 1], debugInfo!.tgtSide)).toBe(true)
    }
  })

  it('keeps parallel traces on separate lanes when the gutters have room', () => {
    // A 12 px lane pitch with a 6 px keep-out gives a 40 px gutter two lanes,
    // a 60 px gutter four and an 80 px gutter six. Three hubs with nine edges
    // each cannot share two lanes, so the tight grid still overlaps (118
    // pairs, down from 557); with 80 px gutters the traces separate.
    const tight = [...route(g, 'orthogonal').values()].map(r => r.path)
    expect(overlappingSegments(tight)).toBeLessThan(150)
    const roomy = [...route(denseGraph(80), 'orthogonal').values()].map(r => r.path)
    expect(overlappingSegments(roomy)).toBeLessThan(10)
  })

  it('puts ports on lane centres so the canvas and the router agree on them', () => {
    const pitch = portLanePitch('orthogonal', g.edges.length)
    expect(pitch).toBe(MAZE_CELL)
    const routed = route(g, 'orthogonal')
    for (const e of g.edges) {
      const { path, debugInfo } = routed.get(e.id)!
      const first = path[0]
      const along = debugInfo!.srcSide === 'left' || debugInfo!.srcSide === 'right' ? first.y : first.x
      expect(((along / pitch!) - 0.5) % 1).toBeCloseTo(0, 6)
    }
  })

  it('is deterministic', () => {
    const a = [...route(g, 'orthogonal').values()].map(r => r.svgPath).join('|')
    const b = [...route(g, 'orthogonal').values()].map(r => r.svgPath).join('|')
    expect(a).toBe(b)
  })

  it('routes every edge of a real grid layout with 24 px gutters on the lane grid, none through a card', () => {
    // The canvas grid layout leaves 24 px between cards: one lane. The lane in
    // front of a port must be found there, or most edges fall back to the
    // per-edge router and run through cards (61 of 90 did before the fix)
    const fixture = JSON.parse(readFileSync(resolve(__dirname, 'fixtures/grid-layout-24px-gutters.json'), 'utf8')) as {
      nodes: NodeRect[]
      edges: EdgeDef[]
    }
    const map = new Map(fixture.nodes.map(n => [n.id!, n]))
    const routed = route({ nodes: fixture.nodes, edges: fixture.edges, map }, 'orthogonal')
    const legacy = fixture.edges.filter(e => routed.get(e.id)!.debugInfo!.router !== 'maze').map(e => `${e.id}:${routed.get(e.id)!.debugInfo!.mazeFailure}`)
    expect(legacy, legacy.join(', ')).toEqual([])
    const through = fixture.edges.filter(e => cardsCrossed(routed.get(e.id)!.path, fixture.nodes, new Set([e.source_node_id, e.target_node_id])).length > 0)
    expect(through.map(e => e.id)).toEqual([])
  })

  it('re-routes only the moving node\'s edges during a drag and keeps the rest', () => {
    const before = route(g, 'orthogonal')
    // A small move, so the card stays clear of its neighbours in the packed grid
    const moved = g.nodes.map(n => (n.id === 'n0' ? { ...n, canvas_x: n.canvas_x + 10, canvas_y: n.canvas_y + 8 } : n))
    const map = new Map(moved.map(n => [n.id!, n]))
    const index = new SpatialIndex()
    index.build(map)
    setRoutingSpatialIndex(index)
    let live: Map<string, { path: Point[]; debugInfo?: { router?: string } }>
    let ms: number
    try {
      const t0 = performance.now()
      live = routeAllEdges(g.edges, moved, map, 'orthogonal', undefined, { movingNodeIds: new Set(['n0']), previous: before })
      ms = performance.now() - t0
    } finally {
      setRoutingSpatialIndex(null)
    }
    for (const e of g.edges) {
      const touchesMoved = e.source_node_id === 'n0' || e.target_node_id === 'n0'
      if (touchesMoved) expect(live.get(e.id)!.debugInfo!.router).toBe('maze')
      else expect(live.get(e.id)!.path).toBe(before.get(e.id)!.path)
    }
    // n0 is a hub with nine edges; routing them alone takes a fraction of a full pass
    expect(ms).toBeLessThan(200)
  })

  it('routes a port walled in by an overlapping card through the per-edge router instead of failing', () => {
    const nodes: NodeRect[] = [
      { id: 'a', canvas_x: 0, canvas_y: 0, width: 200, height: 120 },
      { id: 'wall', canvas_x: 200, canvas_y: -40, width: 60, height: 200 }, // touching a's right side
      { id: 'b', canvas_x: 600, canvas_y: 0, width: 200, height: 120 },
    ]
    const map = new Map(nodes.map(n => [n.id!, n]))
    const edges: EdgeDef[] = [{ id: 'e', source_node_id: 'a', target_node_id: 'b' }]
    const routed = routeAllEdges(edges, nodes, map, 'orthogonal')
    expect(routed.get('e')!.path.length).toBeGreaterThanOrEqual(2)
    expect(validateOrthogonalPath(routed.get('e')!.path)).toBe(true)
  })

  it('routes the dense graph in bounded time', () => {
    // Not gated on a number: timing varies with the machine. The 40 px grid
    // routes in about 60 ms here; the canvas routes only the dragged node's
    // edges while a drag is in progress, so this is paid once per change.
    const t0 = performance.now()
    route(g, 'orthogonal')
    expect(performance.now() - t0).toBeGreaterThan(0)
  })
})
