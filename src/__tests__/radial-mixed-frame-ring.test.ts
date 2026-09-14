/**
 * Every neighbour the layout may move is placed, and they are evenly spread.
 *
 * A ring can hold nodes the layout must not touch: with an unframed centre, the
 * neighbours inside a frame are left alone. The single-ring branch counted the
 * nodes it may place but walked the unfiltered level with that count, so it
 * stopped early and never reached the placeable nodes further along, and it
 * spread its angles over the indices of the wrong list. The split-ring branch
 * beside it already reads the filtered list
 * (PRODUCT_DESIGN.md > Radial rings).
 */
import { describe, it, expect } from 'vitest'
import {
  computeRadialLayout,
  type Node,
  type Edge,
} from '../canvas/composables/layout/useRadialLayout'

function node(id: string, frameId: string | null = null): Node {
  return { id, canvas_x: 0, canvas_y: 0, width: 200, height: 120, frame_id: frameId }
}

function edge(from: string, to: string): Edge {
  return { id: `${from}-${to}`, source_node_id: from, target_node_id: to }
}

/**
 * An unframed centre whose one ring mixes contexts: f1 and f2 sit in a frame
 * and must not move, u1 and u2 are unframed and must be placed. The framed
 * pair comes first, which is what hid the defect.
 */
function mixedRing() {
  const nodes = [node('c'), node('f1', 'F'), node('f2', 'F'), node('u1'), node('u2')]
  return computeRadialLayout({
    getSelectedNodeIds: () => ['c'],
    getNode: (id: string) => nodes.find(n => n.id === id),
    getFilteredNodes: () => nodes,
    getFilteredEdges: () => [edge('c', 'f1'), edge('c', 'f2'), edge('c', 'u1'), edge('c', 'u2')],
    getFilteredFrames: () => [{ id: 'F', canvas_x: 0, canvas_y: 0, width: 400, height: 400 }],
    applyFrameConstraints: positions => positions,
  })
}

describe('a ring holding nodes from more than one frame context', () => {
  it('places every neighbour the layout may move', () => {
    const result = mixedRing()!

    expect(result.targets.has('u1'), 'an unframed neighbour was never reached').toBe(true)
    expect(result.targets.has('u2')).toBe(true)
  })

  it('leaves the framed neighbours where they are', () => {
    const result = mixedRing()!

    expect(result.targets.has('f1')).toBe(false)
    expect(result.targets.has('f2')).toBe(false)
  })

  it('spreads the placed nodes evenly, not at the slots of a longer list', () => {
    const result = mixedRing()!
    const centre = { x: 100, y: 60 }

    const angles = ['u1', 'u2'].map(id => {
      const target = result.targets.get(id)!
      return Math.atan2(target.y + 60 - centre.y, target.x + 100 - centre.x)
    })

    // Two nodes on a ring sit half a turn apart
    let apart = Math.abs(angles[0] - angles[1])
    if (apart > Math.PI) apart = 2 * Math.PI - apart
    expect(apart).toBeCloseTo(Math.PI, 1)
  })
})

describe('the neighbourhood overlay, which draws no frames', () => {
  // The overlay positions nodes above the canvas rather than in it, so frame
  // membership means nothing there: it passes an empty frame list and an
  // identity constraint, saying as much. But the layout decides what it may
  // move from each node's stored frame alone and never consults that list, so
  // a neighbour that belongs to a frame is never placed and stays wherever it
  // sat on the canvas (PRODUCT_DESIGN.md > Radial rings).
  function overlay() {
    const nodes = [node('c'), node('framed', 'F'), node('plain')]
    return computeRadialLayout({
      getSelectedNodeIds: () => ['c'],
      getNode: (id: string) => nodes.find(n => n.id === id),
      getFilteredNodes: () => nodes,
      getFilteredEdges: () => [edge('c', 'framed'), edge('c', 'plain')],
      // As the neighbourhood mode passes them
      getFilteredFrames: () => [],
      applyFrameConstraints: positions => positions,
    })
  }

  it('places a neighbour that belongs to a frame, since no frame is shown', () => {
    const result = overlay()!

    expect(
      result.targets.has('framed'),
      'a neighbour was left on the canvas because of a frame the overlay does not draw'
    ).toBe(true)
  })

  it('still places the unframed neighbours', () => {
    const result = overlay()!

    expect(result.targets.has('plain')).toBe(true)
  })
})
