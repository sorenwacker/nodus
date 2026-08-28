/**
 * A selected node in a frame is laid out; an unselected one travels with it.
 *
 * When there is a selection, framed nodes take part in the layout and receive
 * real positions. Those positions were then overwritten by the frame's rigid
 * move, computed from offsets captured before the layout ran - so a selected
 * framed node went back exactly where it started, which is the symptom that
 * including it was meant to remove. Grid and vertical layouts did move it,
 * because they use the targets directly, so the two disagreed
 * (PRODUCT_DESIGN.md > Layout of a selection).
 */
import { describe, it, expect, vi } from 'vitest'
import { processFrameAwareLayoutResults } from '../canvas/composables/layout/useLayoutFrameAware'

const FRAME = { id: 'f1', canvas_x: 0, canvas_y: 0, width: 800, height: 600, title: 'Frame' }

function contextWith(nodesInFrame: Array<{ id: string }>) {
  return {
    virtualNodes: [],
    allFrames: [FRAME],
    frameNodes: new Map([['f1', nodesInFrame]]),
    frameId: undefined,
    nodes: nodesInFrame,
    targetFrame: undefined,
  } as never
}

const prepared = {
  frameSnapshot: new Map([['f1', { x: 0, y: 0 }]]),
  nodeFrameOffsets: new Map([
    ['laid-out', { dx: 100, dy: 100 }],
    ['carried', { dx: 200, dy: 200 }],
  ]),
} as never

describe('laying out a selection that includes framed nodes', () => {
  it('keeps the position the layout computed for a node it positioned', () => {
    const positions = new Map([['laid-out', { x: 640, y: 480 }]])

    const targets = processFrameAwareLayoutResults(
      contextWith([{ id: 'laid-out' }]),
      positions,
      prepared,
      vi.fn(),
      (t: Map<string, { x: number; y: number }>) => t
    )

    expect(
      targets.get('laid-out'),
      'a node the layout placed must not be moved back with its frame'
    ).toEqual({ x: 640, y: 480 })
  })

  it('still moves a node the layout did not position', () => {
    // Frames move as rigid units for their non-participating members
    const positions = new Map<string, { x: number; y: number }>()

    const targets = processFrameAwareLayoutResults(
      contextWith([{ id: 'carried' }]),
      positions,
      prepared,
      vi.fn(),
      (t: Map<string, { x: number; y: number }>) => t
    )

    expect(targets.get('carried')).toEqual({ x: 200, y: 200 })
  })

  it('handles both in one run', () => {
    const positions = new Map([['laid-out', { x: 640, y: 480 }]])

    const targets = processFrameAwareLayoutResults(
      contextWith([{ id: 'laid-out' }, { id: 'carried' }]),
      positions,
      prepared,
      vi.fn(),
      (t: Map<string, { x: number; y: number }>) => t
    )

    expect(targets.get('laid-out')).toEqual({ x: 640, y: 480 })
    expect(targets.get('carried')).toEqual({ x: 200, y: 200 })
  })
})
