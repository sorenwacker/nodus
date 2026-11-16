/**
 * Neighbourhood mode remembers the layout last chosen in it, per workspace,
 * and keeps the subgraph in view after every arrangement
 * (PRODUCT_DESIGN.md > Neighborhood Mode).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref } from 'vue'
import { useNeighborhoodMode } from '../canvas/composables/layout/useNeighborhoodMode'
import { useLayout, type LayoutOverlay } from '../canvas/composables/layout/useLayout'
import type { LayoutType } from '../canvas/composables/layout/useAutoLayout'
import { canvasStorage } from '../lib/storage'
import type { Node } from '../types'

function node(id: string, x = 0, y = 0): Node {
  return { id, title: id, markdown_content: '', canvas_x: x, canvas_y: y, width: 200, height: 100 } as unknown as Node
}

const nodes = [node('hub'), node('a'), node('b'), node('far', 50000, 50000)]
const edges = [
  { id: 'e1', source_node_id: 'hub', target_node_id: 'a' },
  { id: 'e2', source_node_id: 'hub', target_node_id: 'b' },
]

function setup(preferred: LayoutType) {
  let stored = preferred
  const arrange = vi.fn(async (_type: LayoutType, overlay: LayoutOverlay) => {
    // Somewhere far from the current view, as a grid run can land
    overlay.apply(new Map([['hub', { x: 10000, y: 10000 }], ['a', { x: 10300, y: 10000 }], ['b', { x: 10600, y: 10000 }]]))
  })
  const view = { scale: ref(1), offsetX: ref(0), offsetY: ref(0) }
  const n = useNeighborhoodMode({
    store: {
      getFilteredNodes: () => nodes,
      getFilteredEdges: () => edges,
      getNode: id => nodes.find(x => x.id === id),
      getSelectedNodeIds: () => ['hub'],
    },
    viewState: { ...view, canvasRect: () => ({ width: 1000, height: 800 }) as DOMRect },
    layoutPreference: { get: () => stored, set: t => { stored = t } },
    arrange,
  })
  return { n, arrange, view, stored: () => stored }
}

/** Screen position of a canvas point */
const screen = (view: ReturnType<typeof setup>['view'], x: number, y: number) => ({
  x: x * view.scale.value + view.offsetX.value,
  y: y * view.scale.value + view.offsetY.value,
})

describe('neighbourhood layout memory', () => {
  it('enters with the remembered layout', async () => {
    const { n, arrange } = setup('grid')
    n.toggle('hub')
    await Promise.resolve()
    expect(arrange).toHaveBeenCalledWith('grid', expect.anything())
  })

  it('moving the focus keeps the remembered layout', async () => {
    const { n, arrange } = setup('hierarchical')
    n.toggle('hub')
    n.navigateTo('a')
    await Promise.resolve()
    expect(arrange).toHaveBeenLastCalledWith('hierarchical', expect.anything())
  })

  it('enters radially when radial is remembered, without the injected arrange', () => {
    const { n, arrange } = setup('radial')
    n.toggle('hub')
    expect(arrange).not.toHaveBeenCalled()
    expect(n.neighborhoodPositions.value.size).toBe(3)
  })

  it('records a layout chosen through the overlay', () => {
    const { n, stored } = setup('radial')
    n.toggle('hub')
    n.getLayoutOverlay()!.onLayout?.('force')
    expect(stored()).toBe('force')
  })

  it('centres the view on the subgraph after an arrangement', async () => {
    const { n, view } = setup('grid')
    n.toggle('hub')
    await Promise.resolve()
    // bounding box 10000..10800 x 10000..10100, centre at (10400, 10050)
    const c = screen(view, 10400, 10050)
    expect(c.x).toBeCloseTo(500)
    expect(c.y).toBeCloseTo(400)
  })
})

describe('layout runs report their type to the overlay', () => {
  it('calls onLayout with the type that ran', async () => {
    const onLayout = vi.fn()
    const layout = useLayout({
      store: {
        getNodes: () => nodes,
        getFilteredNodes: () => nodes,
        getFilteredEdges: () => edges,
        getSelectedNodeIds: () => [],
        getNode: (id: string) => nodes.find(x => x.id === id),
        updateNodePosition: vi.fn(),
        setNodePositionsInMemory: vi.fn(),
        layoutNodes: vi.fn(async () => {}),
      },
      viewState: { scale: ref(1), offsetX: ref(0), offsetY: ref(0), canvasRect: () => ({ width: 1000, height: 800 }) as DOMRect },
      pushUndo: vi.fn(),
      getOverlay: () => ({ nodeIds: new Set(['hub', 'a', 'b']), centerId: 'hub', apply: vi.fn(), onLayout }),
    })
    await layout.autoLayout('radial')
    expect(onLayout).toHaveBeenCalledWith('radial')
  })
})

describe('neighbourhood layout storage', () => {
  beforeEach(() => localStorage.clear())

  it('defaults to radial and is kept per workspace', () => {
    expect(canvasStorage.getNeighborhoodLayout('w1')).toBe('radial')
    canvasStorage.setNeighborhoodLayout('grid', 'w1')
    expect(canvasStorage.getNeighborhoodLayout('w1')).toBe('grid')
    expect(canvasStorage.getNeighborhoodLayout('w2')).toBe('radial')
  })

  it('falls back to radial for an unknown stored value', () => {
    localStorage.setItem('nodus_canvas_neighborhood_layout_w1', 'bogus')
    expect(canvasStorage.getNeighborhoodLayout('w1')).toBe('radial')
  })
})
