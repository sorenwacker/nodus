/**
 * The grid, horizontal and vertical layouts leave room between cards for
 * edges to run side by side (PRODUCT_DESIGN.md > Grid layout gutters):
 * seven routing lanes plus the keep-out on each side.
 */
import { describe, it, expect } from 'vitest'
import { executeAutoLayout, type AutoLayoutStore } from '../canvas/composables/layout/useAutoLayout'
import { MAZE_CELL, NODE_MARGIN } from '../canvas/routing'

const GUTTER = 7 * MAZE_CELL + 2 * NODE_MARGIN

function cards() {
  return [
    { id: 'a', canvas_x: 0, canvas_y: 0, width: 200, height: 120 },
    { id: 'b', canvas_x: 700, canvas_y: 50, width: 200, height: 120 },
    { id: 'c', canvas_x: 300, canvas_y: 900, width: 200, height: 120 },
  ]
}

async function layout(kind: 'grid' | 'horizontal' | 'vertical') {
  const nodes = cards()
  const store: AutoLayoutStore = {
    getNodes: () => nodes,
    getFilteredNodes: () => nodes,
    getFilteredEdges: () => [
      { id: 'e1', source_node_id: 'a', target_node_id: 'b' },
      { id: 'e2', source_node_id: 'b', target_node_id: 'c' },
    ],
    getSelectedNodeIds: () => [],
    updateNodePosition: (id, x, y) => {
      const n = nodes.find(n => n.id === id)!
      n.canvas_x = x
      n.canvas_y = y
    },
  }
  await executeAutoLayout(kind, {
    store,
    animateToPositions: targets => {
      for (const [id, pos] of targets) store.updateNodePosition(id, pos.x, pos.y)
    },
  })
  return nodes
}

/** Smallest border-to-border distance between any two cards, along x or y */
function smallestGap(nodes: { canvas_x: number; canvas_y: number; width: number; height: number }[]): number {
  let gap = Infinity
  for (let i = 0; i < nodes.length; i++) for (let j = 0; j < nodes.length; j++) {
    if (i === j) continue
    const a = nodes[i], b = nodes[j]
    const dx = b.canvas_x - (a.canvas_x + a.width)
    const dy = b.canvas_y - (a.canvas_y + a.height)
    for (const d of [dx, dy]) if (d > 0) gap = Math.min(gap, d)
  }
  return gap
}

describe('layout gutters', () => {
  it('is seven lanes plus the keep-out on each side', () => {
    expect(GUTTER).toBe(96)
  })

  it('leaves a gutter between cards in a row', async () => {
    const nodes = await layout('horizontal')
    const xs = nodes.slice().sort((a, b) => a.canvas_x - b.canvas_x)
    for (let i = 1; i < xs.length; i++) expect(xs[i].canvas_x - (xs[i - 1].canvas_x + xs[i - 1].width)).toBeCloseTo(GUTTER, 6)
  })

  it('leaves a gutter between cards in a column', async () => {
    const nodes = await layout('vertical')
    const ys = nodes.slice().sort((a, b) => a.canvas_y - b.canvas_y)
    for (let i = 1; i < ys.length; i++) expect(ys[i].canvas_y - (ys[i - 1].canvas_y + ys[i - 1].height)).toBeCloseTo(GUTTER, 6)
  })

  it('packs the grid no tighter than the gutter', async () => {
    const nodes = await layout('grid')
    expect(smallestGap(nodes)).toBeCloseTo(GUTTER, 6)
  })
})
