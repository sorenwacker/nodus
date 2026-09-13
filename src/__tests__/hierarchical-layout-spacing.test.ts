/**
 * Hierarchical layout spacing (PRODUCT_DESIGN.md > Hierarchical layout
 * spacing): nodes sit 24 px apart within a rank and 60 px apart between
 * ranks, never overlapping, and the canvas command does not override it.
 */
import { describe, it, expect } from 'vitest'
import { applyHierarchicalLayout, type LayoutNode, type LayoutEdge } from '../canvas/layout'
import { executeAutoLayout, type AutoLayoutStore } from '../canvas/composables/layout/useAutoLayout'

const GAP_IN_RANK = 24
const GAP_BETWEEN_RANKS = 60

interface Box {
  x: number
  y: number
  width: number
  height: number
}

function boxesOverlap(a: Box, b: Box): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
}

function node(id: string, width = 200, height = 120): LayoutNode {
  return { id, x: 0, y: 0, width, height }
}

function layoutBoxes(nodes: LayoutNode[], edges: LayoutEdge[]): Map<string, Box> {
  const positions = applyHierarchicalLayout(nodes, edges)
  return new Map(nodes.map(n => [n.id, { ...positions.get(n.id)!, width: n.width, height: n.height }]))
}

describe('hierarchical layout spacing', () => {
  it('separates nodes in one rank by the in-rank gap', () => {
    const boxes = layoutBoxes(
      [node('root'), node('c1'), node('c2')],
      [{ source: 'root', target: 'c1' }, { source: 'root', target: 'c2' }]
    )
    const [left, right] = [boxes.get('c1')!, boxes.get('c2')!].sort((a, b) => a.x - b.x)
    expect(right.x - (left.x + left.width)).toBe(GAP_IN_RANK)
  })

  it('separates consecutive ranks by the rank gap', () => {
    const boxes = layoutBoxes([node('parent'), node('child')], [{ source: 'parent', target: 'child' }])
    const parent = boxes.get('parent')!
    expect(boxes.get('child')!.y - (parent.y + parent.height)).toBe(GAP_BETWEEN_RANKS)
  })

  it('does not overlap nodes of mixed sizes', () => {
    const nodes = [
      node('root', 320, 400),
      node('a', 200, 120),
      node('b', 480, 60),
      node('c', 150, 800),
      node('a1', 260, 300),
      node('a2', 200, 120),
      node('b1', 600, 200),
      node('loose', 200, 120),
    ]
    const edges = [
      { source: 'root', target: 'a' },
      { source: 'root', target: 'b' },
      { source: 'root', target: 'c' },
      { source: 'a', target: 'a1' },
      { source: 'a', target: 'a2' },
      { source: 'b', target: 'b1' },
      { source: 'c', target: 'a2' },
    ]
    const boxes = [...layoutBoxes(nodes, edges)]
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        expect(boxesOverlap(boxes[i][1], boxes[j][1]), `${boxes[i][0]} overlaps ${boxes[j][0]}`).toBe(false)
      }
    }
  })

  it('applies the same spacing when run from the canvas layout command', async () => {
    const nodes = [
      { id: 'root', canvas_x: 0, canvas_y: 0, width: 200, height: 120 },
      { id: 'c1', canvas_x: 500, canvas_y: 500, width: 200, height: 120 },
      { id: 'c2', canvas_x: 900, canvas_y: 900, width: 200, height: 120 },
    ]
    const edges = [
      { id: 'e1', source_node_id: 'root', target_node_id: 'c1' },
      { id: 'e2', source_node_id: 'root', target_node_id: 'c2' },
    ]
    const store: AutoLayoutStore = {
      getNodes: () => nodes,
      getFilteredNodes: () => nodes,
      getFilteredEdges: () => edges,
      getFilteredFrames: () => [],
      getSelectedNodeIds: () => [],
      updateNodePosition: (id, x, y) => {
        const n = nodes.find(n => n.id === id)!
        n.canvas_x = x
        n.canvas_y = y
      },
      updateFramePosition: () => {},
      updateFrameSize: () => {},
    }

    await executeAutoLayout('hierarchical', undefined, {
      store,
      animateToPositions: targets => {
        for (const [id, pos] of targets) store.updateNodePosition(id, pos.x, pos.y)
      },
      applyFrameConstraints: positions => positions,
      pushOutOfFrames: positions => positions,
      expandFramesToFitNodes: async () => {},
    })

    const [root, c1, c2] = nodes
    const [left, right] = [c1, c2].sort((a, b) => a.canvas_x - b.canvas_x)
    expect(right.canvas_x - (left.canvas_x + left.width)).toBe(GAP_IN_RANK)
    expect(c1.canvas_y - (root.canvas_y + root.height)).toBe(GAP_BETWEEN_RANKS)
  })
})
