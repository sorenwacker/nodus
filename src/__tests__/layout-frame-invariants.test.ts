/**
 * Gate tests for the layout-frame invariants (PRODUCT_DESIGN.md > Frames >
 * Layout invariants): framed nodes move rigidly with their frame, frames do
 * not overlap after a global layout, and repeated (interrupting) layout runs
 * cannot displace nodes relative to their frame.
 */
import { describe, it, expect } from 'vitest'
import { executeAutoLayout, type AutoLayoutStore } from '../canvas/composables/layout/useAutoLayout'
import {
  pushNodesOutOfFrames,
  constrainNodesToFrame,
  doFramesOverlap,
  type NodeSize,
  type FrameRect,
} from '../canvas/composables/layout/useFrameCollision'

interface TestNode {
  id: string
  canvas_x: number
  canvas_y: number
  width?: number
  height?: number
  frame_id?: string | null
}

interface TestFrame {
  id: string
  canvas_x: number
  canvas_y: number
  width: number
  height: number
  parent_frame_id?: string | null
}

interface World {
  nodes: TestNode[]
  frames: TestFrame[]
  edges: Array<{ id: string; source_node_id: string; target_node_id: string }>
}

function makeWorld(): World {
  // Two frames with two member nodes each, plus loose nodes, all connected
  const frames: TestFrame[] = [
    { id: 'fA', canvas_x: 0, canvas_y: 0, width: 500, height: 400 },
    { id: 'fB', canvas_x: 700, canvas_y: 0, width: 500, height: 400 },
  ]
  const nodes: TestNode[] = [
    { id: 'a1', canvas_x: 40, canvas_y: 40, width: 180, height: 100, frame_id: 'fA' },
    { id: 'a2', canvas_x: 260, canvas_y: 220, width: 180, height: 100, frame_id: 'fA' },
    { id: 'b1', canvas_x: 740, canvas_y: 40, width: 180, height: 100, frame_id: 'fB' },
    { id: 'b2', canvas_x: 960, canvas_y: 220, width: 180, height: 100, frame_id: 'fB' },
    { id: 'u1', canvas_x: 300, canvas_y: 600, width: 180, height: 100, frame_id: null },
    { id: 'u2', canvas_x: 600, canvas_y: 700, width: 180, height: 100, frame_id: null },
    { id: 'u3', canvas_x: 900, canvas_y: 650, width: 180, height: 100, frame_id: null },
  ]
  const edges = [
    { id: 'e1', source_node_id: 'a1', target_node_id: 'b1' },
    { id: 'e2', source_node_id: 'a2', target_node_id: 'u1' },
    { id: 'e3', source_node_id: 'u1', target_node_id: 'u2' },
    { id: 'e4', source_node_id: 'u2', target_node_id: 'u3' },
    { id: 'e5', source_node_id: 'u3', target_node_id: 'b2' },
  ]
  return { nodes, frames, edges }
}

function makeStore(world: World): AutoLayoutStore {
  return {
    getNodes: () => world.nodes,
    getFilteredNodes: () => world.nodes,
    getFilteredEdges: () => world.edges,
    getFilteredFrames: () => world.frames,
    getSelectedNodeIds: () => [],
    updateNodePosition: (id, x, y) => {
      const n = world.nodes.find(n => n.id === id)
      if (n) {
        n.canvas_x = x
        n.canvas_y = y
      }
    },
    updateFramePosition: (id, x, y) => {
      const f = world.frames.find(f => f.id === id)
      if (f) {
        f.canvas_x = x
        f.canvas_y = y
      }
    },
    updateFrameSize: (id, width, height) => {
      const f = world.frames.find(f => f.id === id)
      if (f) {
        f.width = width
        f.height = height
      }
    },
  }
}

/** Run a layout with animations applied instantly and no expand pass */
async function runLayout(
  world: World,
  layout: 'force' | 'hierarchical' | 'grid',
  applyTargets: (targets: Map<string, { x: number; y: number }>) => void
) {
  const store = makeStore(world)
  await executeAutoLayout(layout, undefined, {
    store,
    animateToPositions: targets => applyTargets(targets),
    applyFrameConstraints: (positions, nodes, targetFrame) => {
      const nodeMap = new Map<string, NodeSize>(nodes.map(n => [n.id, { width: n.width, height: n.height }]))
      return targetFrame
        ? constrainNodesToFrame(positions, nodeMap, targetFrame as FrameRect)
        : pushNodesOutOfFrames(positions, nodeMap, world.frames)
    },
    pushOutOfFrames: (positions, nodeMap) => pushNodesOutOfFrames(positions, nodeMap, world.frames),
    expandFramesToFitNodes: async () => {},
  })
}

function applyInstantly(world: World) {
  return (targets: Map<string, { x: number; y: number }>) => {
    const store = makeStore(world)
    for (const [id, pos] of targets) {
      store.updateNodePosition(id, pos.x, pos.y)
    }
  }
}

function expectMembersInsideFrames(world: World) {
  for (const node of world.nodes) {
    if (!node.frame_id) continue
    const frame = world.frames.find(f => f.id === node.frame_id)!
    const w = node.width || 0
    const h = node.height || 0
    expect(node.canvas_x, `${node.id} left of ${frame.id}`).toBeGreaterThanOrEqual(frame.canvas_x)
    expect(node.canvas_y, `${node.id} above ${frame.id}`).toBeGreaterThanOrEqual(frame.canvas_y)
    expect(node.canvas_x + w, `${node.id} right of ${frame.id}`).toBeLessThanOrEqual(frame.canvas_x + frame.width)
    expect(node.canvas_y + h, `${node.id} below ${frame.id}`).toBeLessThanOrEqual(frame.canvas_y + frame.height)
  }
}

function expectNoFrameOverlap(world: World) {
  for (let i = 0; i < world.frames.length; i++) {
    for (let j = i + 1; j < world.frames.length; j++) {
      expect(
        doFramesOverlap(world.frames[i], world.frames[j], 0),
        `frames ${world.frames[i].id} and ${world.frames[j].id} overlap`
      ).toBe(false)
    }
  }
}

describe('layout-frame invariants', () => {
  for (const layout of ['force', 'hierarchical'] as const) {
    it(`${layout}: framed nodes stay inside their frame after a global layout`, async () => {
      const world = makeWorld()
      await runLayout(world, layout, applyInstantly(world))
      expectMembersInsideFrames(world)
    })

    it(`${layout}: frames do not overlap after a global layout`, async () => {
      const world = makeWorld()
      await runLayout(world, layout, applyInstantly(world))
      expectNoFrameOverlap(world)
    })

    it(`${layout}: an interrupting second run cannot displace nodes relative to their frame`, async () => {
      const world = makeWorld()

      // First run: capture targets but apply them only HALFWAY, simulating a
      // mid-flight animation interrupted by a second button press
      await runLayout(world, layout, targets => {
        for (const [id, pos] of targets) {
          const n = world.nodes.find(n => n.id === id)
          if (n) {
            n.canvas_x = (n.canvas_x + pos.x) / 2
            n.canvas_y = (n.canvas_y + pos.y) / 2
          }
        }
      })

      // Second run applies fully
      await runLayout(world, layout, applyInstantly(world))
      expectMembersInsideFrames(world)
      expectNoFrameOverlap(world)
    })
  }

  it('repeated runs keep the frame-relative offsets of member nodes stable', async () => {
    const world = makeWorld()
    await runLayout(world, 'force', applyInstantly(world))
    const offsets = new Map(
      world.nodes
        .filter(n => n.frame_id)
        .map(n => {
          const f = world.frames.find(f => f.id === n.frame_id)!
          return [n.id, { dx: n.canvas_x - f.canvas_x, dy: n.canvas_y - f.canvas_y }]
        })
    )

    for (let i = 0; i < 3; i++) {
      await runLayout(world, 'force', applyInstantly(world))
    }

    for (const node of world.nodes) {
      if (!node.frame_id) continue
      const frame = world.frames.find(f => f.id === node.frame_id)!
      const before = offsets.get(node.id)!
      expect(node.canvas_x - frame.canvas_x, `${node.id} dx drift`).toBeCloseTo(before.dx, 5)
      expect(node.canvas_y - frame.canvas_y, `${node.id} dy drift`).toBeCloseTo(before.dy, 5)
    }
  })
})
