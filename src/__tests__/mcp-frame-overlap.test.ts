/**
 * A frame moves with what it contains.
 *
 * Resolving an overlap pushed the neighbouring frame aside and left its nodes
 * where they were, outside the frame that owned them. Fitting that frame to its
 * contents afterwards then measured it around nodes it no longer held. The
 * batch move already moved a frame's nodes by the same delta, so two paths
 * disagreed about what moving a frame means
 * (PRODUCT_DESIGN.md > Moving a frame).
 */
import { describe, it, expect } from 'vitest'
import { handleResolveFrameOverlaps } from '../mcp/handlers/frameHandlers'
import type { McpStoreInterface } from '../mcp/messageHandler'
import type { Frame, Node } from '../types'

function makeFrame(id: string, x: number, y: number): Frame {
  return {
    id,
    title: id,
    canvas_x: x,
    canvas_y: y,
    width: 200,
    height: 200,
    color: null,
    workspace_id: null,
    created_at: 0,
  } as unknown as Frame
}

function makeNode(id: string, x: number, y: number, frameId: string): Node {
  return {
    id,
    title: id,
    file_path: null,
    markdown_content: null,
    node_type: 'note',
    canvas_x: x,
    canvas_y: y,
    width: 100,
    height: 60,
    z_index: 0,
    frame_id: frameId,
    color_theme: null,
    is_collapsed: false,
    tags: null,
    workspace_id: null,
    created_at: 0,
    updated_at: 0,
    deleted_at: null,
  } as unknown as Node
}

function makeStore() {
  // Two frames that overlap, each holding one node
  const frames = [makeFrame('left', 0, 0), makeFrame('right', 100, 0)]
  const nodes = [makeNode('n-left', 50, 50, 'left'), makeNode('n-right', 150, 50, 'right')]

  const store = {
    getFilteredFrames: () => frames,
    getFilteredNodes: () => nodes,
    getFrame: (id: string) => frames.find(f => f.id === id),
    updateFramePosition: (id: string, x: number, y: number) => {
      const frame = frames.find(f => f.id === id)!
      frame.canvas_x = x
      frame.canvas_y = y
    },
    updateNodePosition: async (id: string, x: number, y: number) => {
      const node = nodes.find(n => n.id === id)!
      node.canvas_x = x
      node.canvas_y = y
    },
  } as unknown as McpStoreInterface

  return { store, frames, nodes }
}

describe('resolving an overlap between frames', () => {
  it('carries the pushed frame\'s nodes with it', async () => {
    const { store, frames, nodes } = makeStore()
    const pushed = frames.find(f => f.id === 'right')!
    const node = nodes.find(n => n.id === 'n-right')!
    const before = { frame: pushed.canvas_x, node: node.canvas_x }

    const result = await handleResolveFrameOverlaps(store)

    expect(result.resolved, 'the frames should have been found to overlap').toBeGreaterThan(0)
    const delta = pushed.canvas_x - before.frame
    expect(delta, 'the frame did not move').toBeGreaterThan(0)
    expect(node.canvas_x, 'the node was left outside the frame that owns it').toBe(
      before.node + delta
    )
  })

  it('leaves the frame that did not move alone', async () => {
    const { store, nodes } = makeStore()
    const stayed = nodes.find(n => n.id === 'n-left')!

    await handleResolveFrameOverlaps(store)

    expect(stayed.canvas_x).toBe(50)
  })
})
