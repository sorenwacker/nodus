/**
 * The hierarchical layout packs each rank (PRODUCT_DESIGN.md > Hierarchical
 * layout spacing): dagre leaves room in every rank for the edges it would
 * draw through it, which the canvas never uses, so on the 40-card test graph
 * the median gap between neighbours in a rank was about 1000 px and the
 * layout 4600 px wide.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { applyHierarchicalLayout, type LayoutNode, type LayoutEdge } from '../canvas/layout'
import { compactRanks } from '../canvas/layout/rankCompaction'

const GAP = 24

function fixture() {
  const fx = JSON.parse(readFileSync(resolve(__dirname, 'fixtures/grid-layout-24px-gutters.json'), 'utf8')) as {
    nodes: { id: string; canvas_x: number; canvas_y: number; width: number; height: number }[]
    edges: { source_node_id: string; target_node_id: string }[]
  }
  const nodes: LayoutNode[] = fx.nodes.map(n => ({ id: n.id, x: n.canvas_x, y: n.canvas_y, width: n.width, height: n.height }))
  const edges: LayoutEdge[] = fx.edges.map(e => ({ source: e.source_node_id, target: e.target_node_id }))
  return { nodes, edges }
}

type Box = { id: string; x: number; y: number; width: number; height: number }

function boxes(nodes: LayoutNode[], pos: Map<string, { x: number; y: number }>): Box[] {
  return nodes.map(n => ({ id: n.id, ...pos.get(n.id)!, width: n.width, height: n.height }))
}

/** Gaps between horizontal neighbours that share a row */
function rowGaps(bs: Box[]): number[] {
  const rows = new Map<number, Box[]>()
  for (const b of bs) {
    const key = Math.round(b.y)
    if (!rows.has(key)) rows.set(key, [])
    rows.get(key)!.push(b)
  }
  const gaps: number[] = []
  for (const row of rows.values()) {
    row.sort((a, b) => a.x - b.x)
    for (let i = 1; i < row.length; i++) gaps.push(row[i].x - (row[i - 1].x + row[i - 1].width))
  }
  return gaps
}

describe('hierarchical layout compaction', () => {
  const { nodes, edges } = fixture()
  const pos = applyHierarchicalLayout(nodes, edges)
  const bs = boxes(nodes, pos)

  it('packs the 40-card test graph to less than half the width dagre gives it', () => {
    const width = Math.max(...bs.map(b => b.x + b.width)) - Math.min(...bs.map(b => b.x))
    expect(width).toBeLessThan(2000)
  })

  it('keeps the in-rank gap and never overlaps', () => {
    for (const gap of rowGaps(bs)) expect(gap).toBeGreaterThanOrEqual(GAP - 1)
    for (let i = 0; i < bs.length; i++) for (let j = i + 1; j < bs.length; j++) {
      const a = bs[i], b = bs[j]
      const overlap = a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
      expect(overlap, `${a.id} overlaps ${b.id}`).toBe(false)
    }
  })

  it('leaves most neighbours in a rank at the gap, not at dagre\'s edge room', () => {
    const gaps = rowGaps(bs).sort((a, b) => a - b)
    expect(gaps[Math.floor(gaps.length / 2)]).toBeLessThan(100)
  })

  it('centres a parent over its children when nothing is in the way', () => {
    const ranked = [
      { id: 'p', rankPos: 0, pos: 500, size: 200 },
      { id: 'a', rankPos: 180, pos: 0, size: 200 },
      { id: 'b', rankPos: 180, pos: 1000, size: 200 },
      { id: 'c', rankPos: 180, pos: 2000, size: 200 },
    ]
    const out = compactRanks(ranked, [{ source: 'p', target: 'a' }, { source: 'p', target: 'b' }, { source: 'p', target: 'c' }], GAP)
    expect(out.get('b')! - out.get('a')!).toBeCloseTo(200 + GAP, 6)
    expect(out.get('c')! - out.get('b')!).toBeCloseTo(200 + GAP, 6)
    expect(out.get('p')).toBeCloseTo(out.get('b')!, 6)
  })

  it('keeps dagre\'s order within a rank', () => {
    const ranked = [
      { id: 'p', rankPos: 0, pos: 0, size: 200 },
      { id: 'q', rankPos: 0, pos: 3000, size: 200 },
      { id: 'a', rankPos: 180, pos: 0, size: 200 }, // child of q, ordered left
      { id: 'b', rankPos: 180, pos: 3000, size: 200 }, // child of p, ordered right
    ]
    const out = compactRanks(ranked, [{ source: 'q', target: 'a' }, { source: 'p', target: 'b' }], GAP)
    expect(out.get('a')!).toBeLessThan(out.get('b')!)
    expect(out.get('p')!).toBeLessThan(out.get('q')!)
  })
})
