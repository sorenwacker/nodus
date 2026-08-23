/**
 * Layout of a selection (PRODUCT_DESIGN.md > Layout of a selection).
 *
 * A selection is an instruction. Nodes belonging to a frame used to be filtered
 * out of a selected layout without a word, so part of the selection stayed
 * exactly where it was and the layout looked broken.
 */
import { describe, it, expect } from 'vitest'
import { selectionForLayout } from '../canvas/composables/layout/useLayoutStrategies'
import type { Node } from '../canvas/composables/layout/useLayoutStrategies'
import { pushNodesOutOfFrames } from '../canvas/composables/layout/useFrameCollision'

function node(id: string, frameId: string | null = null): Node {
  return { id, canvas_x: 0, canvas_y: 0, width: 200, height: 100, frame_id: frameId }
}

describe('which nodes a layout moves', () => {
  const free = node('free')
  const framedA = node('framed-a', 'frame-1')
  const framedB = node('framed-b', 'frame-2')
  const all = [free, framedA, framedB]

  it('lays out every selected node, framed ones included', () => {
    const chosen = selectionForLayout(all, ['free', 'framed-a', 'framed-b'])

    expect(chosen.nodes.map(n => n.id)).toEqual(['free', 'framed-a', 'framed-b'])
  })

  it('reports the frames that have to be re-fitted afterwards', () => {
    // The node keeps its frame; the frame follows its contents
    const chosen = selectionForLayout(all, ['framed-a', 'framed-b'])

    expect([...chosen.affectedFrameIds].sort()).toEqual(['frame-1', 'frame-2'])
  })

  it('leaves frame contents to the frame-aware path when nothing is selected', () => {
    const chosen = selectionForLayout(all, [])

    expect(chosen.nodes.map(n => n.id)).toEqual(['free'])
    expect(chosen.affectedFrameIds.size).toBe(0)
  })

  it('moves a selected node that is the only one in its frame', () => {
    const chosen = selectionForLayout(all, ['framed-a'])

    expect(chosen.nodes.map(n => n.id)).toEqual(['framed-a'])
  })
})

describe('a node keeps the frame it belongs to', () => {
  const frames = [{ id: 'frame-1', canvas_x: 100, canvas_y: 100, width: 400, height: 300 }]
  const sizes = new Map([['member', { width: 200, height: 120 }]])

  it('is not pushed out of its own frame', () => {
    // Ejecting it is exactly the "nodes leave frames on layout" behaviour
    const positions = new Map([['member', { x: 200, y: 200 }]])
    const owners = new Map([['member', 'frame-1']])

    const result = pushNodesOutOfFrames(positions, sizes, frames, owners)

    expect(result.get('member')).toEqual({ x: 200, y: 200 })
  })

  it('is still pushed out of a frame it does not belong to', () => {
    const positions = new Map([['member', { x: 200, y: 200 }]])
    const owners = new Map([['member', 'another-frame']])

    const result = pushNodesOutOfFrames(positions, sizes, frames, owners)

    expect(result.get('member')).not.toEqual({ x: 200, y: 200 })
  })
})
