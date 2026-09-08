/**
 * Neighbourhood mode arranges its subgraph with the canvas layout algorithms
 * rather than a placement of its own.
 *
 * It used to sort depth-1 neighbours by edge direction into a family tree -
 * parents in a row above, children in a row below, siblings in two columns split
 * by list parity - so a hub with fourteen incoming edges produced a row thousands
 * of canvas px wide, while depth 2+ got the concentric rings that the immediate
 * neighbours needed most (PRODUCT_DESIGN.md > Neighborhood Mode).
 */
import { describe, it, expect } from 'vitest'
import { ref } from 'vue'
import { useNeighborhoodMode } from '../canvas/composables/layout/useNeighborhoodMode'
import type { Node } from '../types'

const HUB = 'hub'

function node(id: string, width = 200, height = 120): Node {
  return {
    id,
    title: id,
    markdown_content: '',
    canvas_x: 0,
    canvas_y: 0,
    width,
    height,
  } as unknown as Node
}

/** A hub with `count` neighbours, every edge pointing at the hub. */
function starGraph(count: number, width?: number, height?: number) {
  const nodes = [node(HUB, width, height)]
  const edges = []
  for (let i = 0; i < count; i++) {
    const id = `n${i}`
    nodes.push(node(id, width, height))
    edges.push({ id: `e${i}`, source_node_id: id, target_node_id: HUB, directed: true })
  }
  return { nodes, edges }
}

function setup(count: number, width?: number, height?: number) {
  const { nodes, edges } = starGraph(count, width, height)
  const mode = useNeighborhoodMode({
    store: {
      getFilteredNodes: () => nodes,
      getFilteredEdges: () => edges,
      getNode: (id: string) => nodes.find(n => n.id === id),
      getSelectedNodeIds: () => [HUB],
      nodeLayoutVersion: ref(0),
    },
    viewState: {
      scale: ref(1),
      offsetX: ref(0),
      offsetY: ref(0),
      canvasRect: () => ({ width: 1600, height: 900 }) as DOMRect,
    },
  })
  return { mode, nodes }
}

describe('neighbourhood mode layout', () => {
  it('arranges neighbours around the focus instead of in one row', () => {
    const { mode } = setup(14)
    mode.toggle(HUB)

    const positions = mode.neighborhoodPositions.value
    expect(positions.size).toBeGreaterThan(1)

    const focus = positions.get(HUB)!
    const neighbours = [...positions.entries()].filter(([id]) => id !== HUB).map(([, p]) => p)
    expect(neighbours.length).toBe(14)

    // A ring puts neighbours on both sides of the focus on both axes; the old
    // family-tree placement put every incoming edge in a single row above it.
    expect(neighbours.some(p => p.y > focus.y)).toBe(true)
    expect(neighbours.some(p => p.y < focus.y)).toBe(true)
  })

  it('keeps the neighbours of a large hub within a bounded span', () => {
    const { mode } = setup(40)
    mode.toggle(HUB)
    const positions = mode.neighborhoodPositions.value
    const xs = [...positions.values()].map(p => p.x)
    // A row of 40 cards at 200px plus gaps runs past 10,000px. A ring must not.
    expect(Math.max(...xs) - Math.min(...xs)).toBeLessThan(6000)
  })

  it('seats cards clear of the focus card and of each other', () => {
    // A workspace of large cards: the ring constants were sized for the
    // 200x120 default, so a 300px first ring placed every neighbour inside
    // the focus card itself (PRODUCT_DESIGN.md > Radial rings).
    const WIDTH = 356
    const HEIGHT = 301
    const { mode } = setup(17, WIDTH, HEIGHT)
    mode.toggle(HUB)

    const placed = [...mode.neighborhoodPositions.value.entries()]
    expect(placed.length).toBe(18)

    const overlaps = (a: { x: number; y: number }, b: { x: number; y: number }) =>
      Math.abs(a.x - b.x) < WIDTH && Math.abs(a.y - b.y) < HEIGHT

    const focus = mode.neighborhoodPositions.value.get(HUB)!
    for (const [id, pos] of placed) {
      if (id === HUB) continue
      expect(overlaps(pos, focus), `${id} overlaps the focus card`).toBe(false)
    }
    for (const [idA, a] of placed) {
      for (const [idB, b] of placed) {
        if (idA >= idB) continue
        expect(overlaps(a, b), `${idA} overlaps ${idB}`).toBe(false)
      }
    }
  })

  it('leaves stored coordinates untouched', () => {
    const { mode, nodes } = setup(14)
    mode.toggle(HUB)

    // Every arrangement in this mode is an overlay: the nodes themselves keep
    // the coordinates they had, so leaving restores the canvas as it was.
    expect(nodes.every(n => n.canvas_x === 0 && n.canvas_y === 0)).toBe(true)
    const overlay = mode.neighborhoodPositions.value
    expect([...overlay.values()].some(p => p.x !== 0 || p.y !== 0)).toBe(true)
  })

  it('drops the overlay when the mode is left', () => {
    const { mode } = setup(14)
    mode.toggle(HUB)
    expect(mode.neighborhoodPositions.value.size).toBeGreaterThan(0)
    mode.exit()
    expect(mode.neighborhoodMode.value).toBe(false)
  })
})
