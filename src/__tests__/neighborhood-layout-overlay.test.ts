/**
 * While neighbourhood mode is open, the layout controls act on the subgraph on
 * screen rather than the whole canvas, and the result is an overlay: no position
 * is written to the store and no undo entry is pushed, because an overlay
 * position was never stored (PRODUCT_DESIGN.md > Neighborhood Mode).
 */
import { describe, it, expect, vi } from 'vitest'
import { ref } from 'vue'
import { useLayout, type LayoutOverlay } from '../canvas/composables/layout/useLayout'
import type { Node } from '../types'

function node(id: string, x = 0, y = 0): Node {
  return { id, title: id, markdown_content: '', canvas_x: x, canvas_y: y, width: 200, height: 120 } as unknown as Node
}

function setup(overlay: LayoutOverlay | null) {
  const nodes = [node('hub'), node('a'), node('b'), node('outside', 9999, 9999)]
  const edges = [
    { id: 'e1', source_node_id: 'a', target_node_id: 'hub' },
    { id: 'e2', source_node_id: 'b', target_node_id: 'hub' },
  ]
  const updateNodePosition = vi.fn()
  const pushUndo = vi.fn()

  const layout = useLayout({
    store: {
      getNodes: () => nodes,
      getFilteredNodes: () => nodes,
      getFilteredEdges: () => edges,
      getFilteredFrames: () => [],
      getSelectedNodeIds: () => [],
      getNode: (id: string) => nodes.find(n => n.id === id),
      updateNodePosition,
      updateFramePosition: vi.fn(),
      updateFrameSize: vi.fn(),
      layoutNodes: vi.fn(async () => {}),
    },
    viewState: {
      scale: ref(1),
      offsetX: ref(0),
      offsetY: ref(0),
      canvasRect: () => ({ width: 1600, height: 900 }) as DOMRect,
    },
    pushUndo,
    getOverlay: () => overlay,
  } as never)

  return { layout, updateNodePosition, pushUndo }
}

describe('layout while an overlay is open', () => {
  it('hands positions to the overlay instead of the store', async () => {
    const applied: Map<string, { x: number; y: number }>[] = []
    const overlay: LayoutOverlay = {
      nodeIds: new Set(['hub', 'a', 'b']),
      centerId: 'hub',
      apply: p => {
        applied.push(p)
      },
    }
    const { layout, updateNodePosition, pushUndo } = setup(overlay)

    await layout.autoLayout('grid')

    expect(applied.length).toBe(1)
    expect(updateNodePosition).not.toHaveBeenCalled()
    expect(pushUndo).not.toHaveBeenCalled()
  })

  it('lays out only the nodes the overlay names', async () => {
    const applied: Map<string, { x: number; y: number }>[] = []
    const overlay: LayoutOverlay = {
      nodeIds: new Set(['hub', 'a', 'b']),
      centerId: 'hub',
      apply: p => {
        applied.push(p)
      },
    }
    const { layout } = setup(overlay)

    await layout.autoLayout('grid')

    expect([...applied[0].keys()]).not.toContain('outside')
  })

  it('writes to the store when no overlay is open', async () => {
    const { layout, pushUndo } = setup(null)
    await layout.autoLayout('grid')
    expect(pushUndo).toHaveBeenCalled()
  })
})
