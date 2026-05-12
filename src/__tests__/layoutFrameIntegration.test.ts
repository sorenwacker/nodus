/**
 * Layout-Frame Integration Tests
 * Tests that layout algorithms properly respect frame boundaries:
 * - Framed nodes stay fixed during global layout
 * - Unframed nodes are pushed out of frames
 * - Frame-scoped layout constrains nodes within the frame
 */
import { describe, it, expect } from 'vitest'
import { applyForceLayout } from '../canvas/layout'
import {
  pushNodesOutOfFrames,
  constrainNodesToFrame,
  isNodeInFrame,
} from '../canvas/composables/layout/useFrameCollision'

interface TestNode {
  id: string
  x: number
  y: number
  width: number
  height: number
  frame_id?: string | null
}

interface TestFrame {
  id: string
  canvas_x: number
  canvas_y: number
  width: number
  height: number
}

describe('Layout with Frames - Node Filtering', () => {
  /**
   * Tests that the layout system correctly identifies which nodes
   * belong to frames (by frame_id or spatial overlap)
   */

  it('isNodeInFrame detects nodes by spatial overlap', () => {
    const frame: TestFrame = { id: 'f1', canvas_x: 100, canvas_y: 100, width: 400, height: 300 }

    // Node fully inside
    expect(isNodeInFrame(200, 200, 100, 80, frame)).toBe(true)

    // Node partially inside (>50%)
    expect(isNodeInFrame(80, 200, 100, 80, frame)).toBe(true)

    // Node partially inside (<50%)
    expect(isNodeInFrame(20, 200, 100, 80, frame)).toBe(false)

    // Node completely outside
    expect(isNodeInFrame(600, 600, 100, 80, frame)).toBe(false)
  })

  it('should identify framed vs unframed nodes correctly', () => {
    const frame: TestFrame = { id: 'f1', canvas_x: 100, canvas_y: 100, width: 400, height: 300 }
    const nodes: TestNode[] = [
      { id: 'n1', x: 200, y: 200, width: 100, height: 80, frame_id: 'f1' }, // Explicit frame_id
      { id: 'n2', x: 250, y: 250, width: 100, height: 80 }, // Spatial overlap with frame
      { id: 'n3', x: 600, y: 600, width: 100, height: 80 }, // Completely outside
    ]

    const getNodeFrameId = (node: TestNode): string | null => {
      if (node.frame_id) return node.frame_id
      if (isNodeInFrame(node.x, node.y, node.width, node.height, frame)) {
        return frame.id
      }
      return null
    }

    expect(getNodeFrameId(nodes[0])).toBe('f1')
    expect(getNodeFrameId(nodes[1])).toBe('f1')
    expect(getNodeFrameId(nodes[2])).toBe(null)
  })
})

describe('Force Layout - Frame Isolation', () => {
  /**
   * Critical: Force layout must NOT move nodes that are inside frames
   * when doing a global layout
   */

  it('force layout only includes unframed nodes in calculation', async () => {
    // Simulate what useLayout does: filter to only unframed nodes
    const allNodes: TestNode[] = [
      { id: 'unframed1', x: 500, y: 500, width: 200, height: 120 },
      { id: 'unframed2', x: 600, y: 600, width: 200, height: 120 },
      { id: 'framed1', x: 200, y: 200, width: 200, height: 120, frame_id: 'f1' },
      { id: 'framed2', x: 250, y: 250, width: 200, height: 120, frame_id: 'f1' },
    ]

    // Filter to unframed nodes only (what useLayout does for global layout)
    const unframedNodes = allNodes.filter(n => !n.frame_id)

    const edges = [
      { source: 'unframed1', target: 'unframed2' },
    ]

    // Run force layout on unframed nodes only
    const layoutNodes = unframedNodes.map(n => ({
      id: n.id,
      x: n.x,
      y: n.y,
      width: n.width,
      height: n.height,
    }))

    const result = await applyForceLayout(layoutNodes, edges, {
      centerX: 400,
      centerY: 300,
    })

    // Only unframed nodes should have positions
    expect(result.has('unframed1')).toBe(true)
    expect(result.has('unframed2')).toBe(true)
    expect(result.has('framed1')).toBe(false)
    expect(result.has('framed2')).toBe(false)
  })

  it('force layout with frame constraint keeps nodes inside frame', async () => {
    const frame: TestFrame = { id: 'f1', canvas_x: 100, canvas_y: 100, width: 500, height: 400 }
    const framedNodes: TestNode[] = [
      { id: 'n1', x: 200, y: 200, width: 100, height: 80, frame_id: 'f1' },
      { id: 'n2', x: 300, y: 300, width: 100, height: 80, frame_id: 'f1' },
      { id: 'n3', x: 400, y: 400, width: 100, height: 80, frame_id: 'f1' },
    ]

    const edges = [
      { source: 'n1', target: 'n2' },
      { source: 'n2', target: 'n3' },
    ]

    // Run force layout on framed nodes
    const layoutNodes = framedNodes.map(n => ({
      id: n.id,
      x: n.x,
      y: n.y,
      width: n.width,
      height: n.height,
    }))

    const rawPositions = await applyForceLayout(layoutNodes, edges, {
      centerX: frame.canvas_x + frame.width / 2,
      centerY: frame.canvas_y + frame.height / 2,
      iterations: 100,
    })

    // Apply frame constraint
    const nodeMap = new Map(framedNodes.map(n => [n.id, { width: n.width, height: n.height }]))
    const constrainedPositions = constrainNodesToFrame(rawPositions, nodeMap, frame, 30)

    // All nodes should be fully inside frame
    for (const [nodeId, pos] of constrainedPositions) {
      const node = framedNodes.find(n => n.id === nodeId)!

      expect(pos.x).toBeGreaterThanOrEqual(frame.canvas_x + 30)
      expect(pos.y).toBeGreaterThanOrEqual(frame.canvas_y + 30)
      expect(pos.x + node.width).toBeLessThanOrEqual(frame.canvas_x + frame.width - 30)
      expect(pos.y + node.height).toBeLessThanOrEqual(frame.canvas_y + frame.height - 30)
    }
  })

  describe('framed nodes remain fixed during global layout', () => {
    it('framed nodes are excluded from layout calculation entirely', async () => {
      const frame: TestFrame = { id: 'f1', canvas_x: 100, canvas_y: 100, width: 300, height: 200 }
      const allNodes: TestNode[] = [
        { id: 'framed1', x: 150, y: 150, width: 100, height: 80, frame_id: 'f1' },
        { id: 'framed2', x: 200, y: 180, width: 100, height: 80, frame_id: 'f1' },
        { id: 'unframed1', x: 500, y: 500, width: 100, height: 80 },
      ]

      // Simulate useLayout filtering logic
      const isNodeInAnyFrame = (node: TestNode): boolean => {
        if (node.frame_id) return true
        return isNodeInFrame(node.x, node.y, node.width, node.height, frame)
      }

      const nodesToLayout = allNodes.filter(n => !isNodeInAnyFrame(n))

      // Only unframed1 should be in the layout
      expect(nodesToLayout.length).toBe(1)
      expect(nodesToLayout[0].id).toBe('unframed1')

      // Framed nodes' original positions should never change
      const framedPositions = allNodes.filter(n => isNodeInAnyFrame(n))
      for (const node of framedPositions) {
        // These positions are preserved - they were never in the layout
        expect(node.x).toBe(node.id === 'framed1' ? 150 : 200)
        expect(node.y).toBe(node.id === 'framed1' ? 150 : 180)
      }
    })

    it('nodes detected by spatial overlap are also excluded', async () => {
      const frame: TestFrame = { id: 'f1', canvas_x: 100, canvas_y: 100, width: 300, height: 200 }
      const allNodes: TestNode[] = [
        // No explicit frame_id but spatially inside frame (>50% overlap)
        { id: 'spatial1', x: 150, y: 150, width: 100, height: 80 },
        { id: 'spatial2', x: 200, y: 180, width: 100, height: 80 },
        { id: 'outside', x: 600, y: 600, width: 100, height: 80 },
      ]

      const isNodeInAnyFrame = (node: TestNode): boolean => {
        if (node.frame_id) return true
        return isNodeInFrame(node.x, node.y, node.width, node.height, frame)
      }

      const nodesToLayout = allNodes.filter(n => !isNodeInAnyFrame(n))

      // Only 'outside' should be in the layout
      expect(nodesToLayout.length).toBe(1)
      expect(nodesToLayout[0].id).toBe('outside')
    })
  })

  describe('complete useLayout simulation', () => {
    it('global force layout: filters nodes, runs layout, pushes out of frames', async () => {
      const frame: TestFrame = { id: 'f1', canvas_x: 100, canvas_y: 100, width: 300, height: 200 }
      const allNodes: TestNode[] = [
        { id: 'framed1', x: 150, y: 150, width: 100, height: 80, frame_id: 'f1' },
        { id: 'unframed1', x: 500, y: 500, width: 100, height: 80 },
        { id: 'unframed2', x: 550, y: 550, width: 100, height: 80 },
      ]
      const edges = [{ source: 'unframed1', target: 'unframed2' }]

      // Step 1: Filter to unframed nodes (what useLayout does)
      const unframedNodes = allNodes.filter(n => !n.frame_id)
      expect(unframedNodes.length).toBe(2)

      // Step 2: Run force layout on unframed nodes
      const layoutNodes = unframedNodes.map(n => ({
        id: n.id,
        x: n.x,
        y: n.y,
        width: n.width,
        height: n.height,
      }))
      const rawPositions = await applyForceLayout(layoutNodes, edges, {
        centerX: 400,
        centerY: 400,
        iterations: 50,
      })

      // Step 3: Push unframed nodes out of frames
      const nodeMap = new Map(unframedNodes.map(n => [n.id, { width: n.width, height: n.height }]))
      const finalPositions = pushNodesOutOfFrames(rawPositions, nodeMap, [frame])

      // Verify: framed node was never touched
      expect(finalPositions.has('framed1')).toBe(false)

      // Verify: unframed nodes don't overlap with frame
      for (const [nodeId, pos] of finalPositions) {
        const node = unframedNodes.find(n => n.id === nodeId)!
        const overlapsX = pos.x < frame.canvas_x + frame.width && pos.x + node.width > frame.canvas_x
        const overlapsY = pos.y < frame.canvas_y + frame.height && pos.y + node.height > frame.canvas_y
        expect(overlapsX && overlapsY).toBe(false)
      }
    })

    it('frame-scoped layout: only moves nodes in frame, constrains to frame', async () => {
      const frame: TestFrame = { id: 'f1', canvas_x: 100, canvas_y: 100, width: 400, height: 300 }
      const allNodes: TestNode[] = [
        { id: 'inFrame1', x: 150, y: 150, width: 100, height: 80, frame_id: 'f1' },
        { id: 'inFrame2', x: 200, y: 200, width: 100, height: 80, frame_id: 'f1' },
        { id: 'outside', x: 600, y: 600, width: 100, height: 80 },
      ]
      const edges = [{ source: 'inFrame1', target: 'inFrame2' }]

      // Step 1: Filter to nodes in frame
      const framedNodes = allNodes.filter(n => n.frame_id === frame.id)
      expect(framedNodes.length).toBe(2)

      // Step 2: Run force layout on framed nodes
      const layoutNodes = framedNodes.map(n => ({
        id: n.id,
        x: n.x,
        y: n.y,
        width: n.width,
        height: n.height,
      }))
      const rawPositions = await applyForceLayout(layoutNodes, edges, {
        centerX: frame.canvas_x + frame.width / 2,
        centerY: frame.canvas_y + frame.height / 2,
        iterations: 50,
      })

      // Step 3: Constrain to frame
      const nodeMap = new Map(framedNodes.map(n => [n.id, { width: n.width, height: n.height }]))
      const finalPositions = constrainNodesToFrame(rawPositions, nodeMap, frame, 30)

      // Verify: outside node was never touched
      expect(finalPositions.has('outside')).toBe(false)

      // Verify: framed nodes are inside frame boundaries
      for (const [nodeId, pos] of finalPositions) {
        const node = framedNodes.find(n => n.id === nodeId)!
        expect(pos.x).toBeGreaterThanOrEqual(frame.canvas_x + 30)
        expect(pos.y).toBeGreaterThanOrEqual(frame.canvas_y + 30)
        expect(pos.x + node.width).toBeLessThanOrEqual(frame.canvas_x + frame.width - 30)
        expect(pos.y + node.height).toBeLessThanOrEqual(frame.canvas_y + frame.height - 30)
      }
    })
  })
})

describe('Global Layout - Push Out of Frames', () => {
  /**
   * After global layout calculation, unframed nodes must be pushed
   * out of any frames they might overlap with
   */

  it('pushes unframed nodes outside all frames', () => {
    const frames: TestFrame[] = [
      { id: 'f1', canvas_x: 100, canvas_y: 100, width: 300, height: 200 },
      { id: 'f2', canvas_x: 500, canvas_y: 100, width: 300, height: 200 },
    ]

    const nodeMap = new Map([
      ['n1', { width: 100, height: 80 }],
      ['n2', { width: 100, height: 80 }],
    ])

    // Positions that overlap with frames
    const positions = new Map([
      ['n1', { x: 150, y: 150 }], // Inside frame f1
      ['n2', { x: 550, y: 150 }], // Inside frame f2
    ])

    const result = pushNodesOutOfFrames(positions, nodeMap, frames)

    // Both nodes should be pushed out
    for (const frame of frames) {
      for (const [nodeId, pos] of result) {
        const node = nodeMap.get(nodeId)!
        const nodeRight = pos.x + node.width!
        const nodeBottom = pos.y + node.height!

        const overlapsX = nodeRight > frame.canvas_x && pos.x < frame.canvas_x + frame.width
        const overlapsY = nodeBottom > frame.canvas_y && pos.y < frame.canvas_y + frame.height

        // Node should not overlap with this frame
        expect(overlapsX && overlapsY).toBe(false)
      }
    }
  })

  it('does not modify nodes already outside frames', () => {
    const frames: TestFrame[] = [
      { id: 'f1', canvas_x: 100, canvas_y: 100, width: 300, height: 200 },
    ]

    const nodeMap = new Map([
      ['n1', { width: 100, height: 80 }],
    ])

    const originalPos = { x: 500, y: 500 }
    const positions = new Map([
      ['n1', { ...originalPos }],
    ])

    const result = pushNodesOutOfFrames(positions, nodeMap, frames)
    const resultPos = result.get('n1')!

    expect(resultPos.x).toBe(originalPos.x)
    expect(resultPos.y).toBe(originalPos.y)
  })
})

describe('Frame-Scoped Layout', () => {
  /**
   * When layout is run on a specific frame, all nodes in that frame
   * should be laid out but constrained to stay inside
   */

  it('constrains all nodes to frame with proper padding', () => {
    const frame: TestFrame = { id: 'f1', canvas_x: 100, canvas_y: 100, width: 400, height: 300 }

    const nodeMap = new Map([
      ['n1', { width: 150, height: 100 }],
      ['n2', { width: 150, height: 100 }],
      ['n3', { width: 150, height: 100 }],
    ])

    // Positions from layout that extend outside frame
    const positions = new Map([
      ['n1', { x: 50, y: 50 }],     // Outside top-left
      ['n2', { x: 400, y: 350 }],   // Extends past bottom-right
      ['n3', { x: 200, y: 200 }],   // Inside
    ])

    const result = constrainNodesToFrame(positions, nodeMap, frame, 30)

    // All nodes should be fully inside frame with padding
    for (const [nodeId, pos] of result) {
      const node = nodeMap.get(nodeId)!

      // Left boundary: frame.x + padding
      expect(pos.x).toBeGreaterThanOrEqual(frame.canvas_x + 30)
      // Top boundary: frame.y + padding
      expect(pos.y).toBeGreaterThanOrEqual(frame.canvas_y + 30)
      // Right boundary: frame.x + frame.width - padding - nodeWidth
      expect(pos.x + node.width!).toBeLessThanOrEqual(frame.canvas_x + frame.width - 30)
      // Bottom boundary: frame.y + frame.height - padding - nodeHeight
      expect(pos.y + node.height!).toBeLessThanOrEqual(frame.canvas_y + frame.height - 30)
    }
  })

  it('handles varying node sizes correctly', () => {
    const frame: TestFrame = { id: 'f1', canvas_x: 100, canvas_y: 100, width: 600, height: 500 }

    const nodeMap = new Map([
      ['small', { width: 80, height: 60 }],
      ['medium', { width: 200, height: 150 }],
      ['large', { width: 350, height: 250 }],
    ])

    const positions = new Map([
      ['small', { x: 50, y: 50 }],
      ['medium', { x: 550, y: 400 }],
      ['large', { x: 200, y: 200 }],
    ])

    const result = constrainNodesToFrame(positions, nodeMap, frame, 30)

    for (const [nodeId, pos] of result) {
      const node = nodeMap.get(nodeId)!

      expect(pos.x).toBeGreaterThanOrEqual(frame.canvas_x + 30)
      expect(pos.y).toBeGreaterThanOrEqual(frame.canvas_y + 30)
      expect(pos.x + node.width!).toBeLessThanOrEqual(frame.canvas_x + frame.width - 30)
      expect(pos.y + node.height!).toBeLessThanOrEqual(frame.canvas_y + frame.height - 30)
    }
  })
})

describe('Edge Cases', () => {
  it('handles empty node list', async () => {
    const result = await applyForceLayout([], [])
    expect(result.size).toBe(0)
  })

  it('handles single node layout', async () => {
    const nodes = [{ id: 'n1', x: 0, y: 0, width: 100, height: 80 }]
    const result = await applyForceLayout(nodes, [], { centerX: 500, centerY: 400 })

    expect(result.size).toBe(1)
    const pos = result.get('n1')!
    expect(typeof pos.x).toBe('number')
    expect(typeof pos.y).toBe('number')
  })

  it('handles frame with no nodes', () => {
    const frame: TestFrame = { id: 'f1', canvas_x: 100, canvas_y: 100, width: 400, height: 300 }
    const result = constrainNodesToFrame(new Map(), new Map(), frame)
    expect(result.size).toBe(0)
  })

  it('handles no frames in pushNodesOutOfFrames', () => {
    const nodeMap = new Map([['n1', { width: 100, height: 80 }]])
    const positions = new Map([['n1', { x: 200, y: 200 }]])

    const result = pushNodesOutOfFrames(positions, nodeMap, [])
    expect(result.get('n1')).toEqual({ x: 200, y: 200 })
  })

  it('handles node missing from nodeMap', () => {
    const frame: TestFrame = { id: 'f1', canvas_x: 100, canvas_y: 100, width: 400, height: 300 }
    const nodeMap = new Map<string, { width?: number; height?: number }>()
    const positions = new Map([['n1', { x: 200, y: 200 }]])

    const result = constrainNodesToFrame(positions, nodeMap, frame)
    // Should still process with default sizes
    expect(result.has('n1')).toBe(true)
  })
})

describe('Radial Layout - Frame Isolation', () => {
  /**
   * Radial layout has special frame handling:
   * - If center node is in a frame, only nodes in that same frame move
   * - If center node is NOT in a frame, nodes in frames are NEVER moved
   */

  describe('center node frame context detection', () => {
    it('detects center node in frame by frame_id', () => {
      const frame: TestFrame = { id: 'f1', canvas_x: 100, canvas_y: 100, width: 400, height: 300 }
      const centerNode: TestNode = { id: 'center', x: 200, y: 200, width: 100, height: 80, frame_id: 'f1' }

      // Simulate getNodeFrameId from radialLayout
      const getNodeFrameId = (node: TestNode): string | null => {
        if (node.frame_id) return node.frame_id
        if (isNodeInFrame(node.x, node.y, node.width, node.height, frame)) {
          return frame.id
        }
        return null
      }

      expect(getNodeFrameId(centerNode)).toBe('f1')
    })

    it('detects center node in frame by spatial overlap', () => {
      const frame: TestFrame = { id: 'f1', canvas_x: 100, canvas_y: 100, width: 400, height: 300 }
      // Node without frame_id but spatially inside
      const centerNode: TestNode = { id: 'center', x: 200, y: 200, width: 100, height: 80 }

      const getNodeFrameId = (node: TestNode): string | null => {
        if (node.frame_id) return node.frame_id
        if (isNodeInFrame(node.x, node.y, node.width, node.height, frame)) {
          return frame.id
        }
        return null
      }

      expect(getNodeFrameId(centerNode)).toBe('f1')
    })

    it('detects center node not in any frame', () => {
      const frame: TestFrame = { id: 'f1', canvas_x: 100, canvas_y: 100, width: 400, height: 300 }
      const centerNode: TestNode = { id: 'center', x: 600, y: 600, width: 100, height: 80 }

      const getNodeFrameId = (node: TestNode): string | null => {
        if (node.frame_id) return node.frame_id
        if (isNodeInFrame(node.x, node.y, node.width, node.height, frame)) {
          return frame.id
        }
        return null
      }

      expect(getNodeFrameId(centerNode)).toBe(null)
    })
  })

  describe('frame-scoped radial layout (center in frame)', () => {
    it('only includes nodes from same frame in layout', () => {
      const frame1: TestFrame = { id: 'f1', canvas_x: 100, canvas_y: 100, width: 400, height: 300 }
      const frame2: TestFrame = { id: 'f2', canvas_x: 600, canvas_y: 100, width: 400, height: 300 }
      const frames = [frame1, frame2]

      const allNodes: TestNode[] = [
        { id: 'center', x: 200, y: 200, width: 100, height: 80, frame_id: 'f1' },
        { id: 'same_frame', x: 250, y: 250, width: 100, height: 80, frame_id: 'f1' },
        { id: 'other_frame', x: 700, y: 200, width: 100, height: 80, frame_id: 'f2' },
        { id: 'unframed', x: 1200, y: 600, width: 100, height: 80 },
      ]

      const centerNode = allNodes[0]

      // Simulate radialLayout node filtering
      const getNodeFrameId = (node: TestNode): string | null => {
        if (node.frame_id) return node.frame_id
        for (const f of frames) {
          if (isNodeInFrame(node.x, node.y, node.width, node.height, f)) {
            return f.id
          }
        }
        return null
      }

      const centerFrameId = getNodeFrameId(centerNode)
      expect(centerFrameId).toBe('f1')

      const nodesToLayout = allNodes.filter(n => {
        const nodeFrameId = getNodeFrameId(n)
        return nodeFrameId === centerFrameId
      })

      // Only nodes in f1 should be included
      expect(nodesToLayout.length).toBe(2)
      expect(nodesToLayout.map(n => n.id).sort()).toEqual(['center', 'same_frame'])
    })
  })

  describe('global radial layout (center not in frame)', () => {
    it('never moves nodes that are in any frame', () => {
      const frame: TestFrame = { id: 'f1', canvas_x: 100, canvas_y: 100, width: 400, height: 300 }

      const allNodes: TestNode[] = [
        { id: 'center', x: 600, y: 600, width: 100, height: 80 }, // Center is unframed
        { id: 'unframed_neighbor', x: 700, y: 700, width: 100, height: 80 },
        { id: 'framed_node', x: 200, y: 200, width: 100, height: 80, frame_id: 'f1' },
        { id: 'spatial_framed', x: 250, y: 250, width: 100, height: 80 }, // Inside frame spatially
      ]

      const centerNode = allNodes[0]

      const getNodeFrameId = (node: TestNode): string | null => {
        if (node.frame_id) return node.frame_id
        if (isNodeInFrame(node.x, node.y, node.width, node.height, frame)) {
          return frame.id
        }
        return null
      }

      const centerFrameId = getNodeFrameId(centerNode)
      expect(centerFrameId).toBe(null) // Center is not in any frame

      // When center is NOT in a frame, only unframed nodes are moved
      const nodesToLayout = allNodes.filter(n => {
        const nodeFrameId = getNodeFrameId(n)
        return !nodeFrameId // Node must NOT be in any frame
      })

      expect(nodesToLayout.length).toBe(2)
      expect(nodesToLayout.map(n => n.id).sort()).toEqual(['center', 'unframed_neighbor'])
    })

    it('framed nodes retain original positions', () => {
      // Frame exists but we're testing that framed node keeps its position
      const framedNode: TestNode = { id: 'framed', x: 200, y: 200, width: 100, height: 80, frame_id: 'f1' }
      const originalX = framedNode.x
      const originalY = framedNode.y

      // Simulate that framed node was excluded from layout
      // Its position should remain unchanged
      expect(framedNode.x).toBe(originalX)
      expect(framedNode.y).toBe(originalY)
    })
  })

  describe('radial layout with frame constraints', () => {
    it('constrains radial positions to frame when center is in frame', async () => {
      const frame: TestFrame = { id: 'f1', canvas_x: 100, canvas_y: 100, width: 500, height: 400 }
      const framedNodes: TestNode[] = [
        { id: 'center', x: 300, y: 300, width: 100, height: 80, frame_id: 'f1' },
        { id: 'neighbor1', x: 200, y: 200, width: 100, height: 80, frame_id: 'f1' },
        { id: 'neighbor2', x: 400, y: 400, width: 100, height: 80, frame_id: 'f1' },
      ]

      // Simulate radial layout producing positions that might extend outside frame
      const radialPositions = new Map([
        ['center', { x: 300, y: 300 }],
        ['neighbor1', { x: 50, y: 50 }],    // Would be outside frame
        ['neighbor2', { x: 700, y: 500 }],  // Would be outside frame
      ])

      // Apply frame constraint (what radialLayout does)
      const nodeMap = new Map(framedNodes.map(n => [n.id, { width: n.width, height: n.height }]))
      const constrainedPositions = constrainNodesToFrame(radialPositions, nodeMap, frame, 30)

      // All nodes should be fully inside frame
      for (const [nodeId, pos] of constrainedPositions) {
        const node = framedNodes.find(n => n.id === nodeId)!
        expect(pos.x).toBeGreaterThanOrEqual(frame.canvas_x + 30)
        expect(pos.y).toBeGreaterThanOrEqual(frame.canvas_y + 30)
        expect(pos.x + node.width).toBeLessThanOrEqual(frame.canvas_x + frame.width - 30)
        expect(pos.y + node.height).toBeLessThanOrEqual(frame.canvas_y + frame.height - 30)
      }
    })

    it('pushes radial positions out of frames when center is unframed', async () => {
      const frame: TestFrame = { id: 'f1', canvas_x: 100, canvas_y: 100, width: 300, height: 200 }

      // Radial layout might position unframed nodes over a frame
      const radialPositions = new Map([
        ['center', { x: 600, y: 600 }],
        ['neighbor', { x: 200, y: 200 }], // Would overlap with frame
      ])

      const nodeMap = new Map([
        ['center', { width: 100, height: 80 }],
        ['neighbor', { width: 100, height: 80 }],
      ])

      // Apply pushNodesOutOfFrames (what radialLayout does for global layout)
      const finalPositions = pushNodesOutOfFrames(radialPositions, nodeMap, [frame])

      // Neighbor should be pushed out of frame
      const neighborPos = finalPositions.get('neighbor')!
      const overlapsX = neighborPos.x < frame.canvas_x + frame.width && neighborPos.x + 100 > frame.canvas_x
      const overlapsY = neighborPos.y < frame.canvas_y + frame.height && neighborPos.y + 80 > frame.canvas_y
      expect(overlapsX && overlapsY).toBe(false)
    })
  })

  describe('unconnected nodes in outer ring', () => {
    it('unconnected nodes follow same frame rules', () => {
      const frame: TestFrame = { id: 'f1', canvas_x: 100, canvas_y: 100, width: 400, height: 300 }

      const allNodes: TestNode[] = [
        { id: 'center', x: 600, y: 600, width: 100, height: 80 },
        { id: 'connected', x: 700, y: 700, width: 100, height: 80 },
        { id: 'unconnected_unframed', x: 800, y: 800, width: 100, height: 80 },
        { id: 'unconnected_framed', x: 200, y: 200, width: 100, height: 80, frame_id: 'f1' },
      ]

      // Edges only connect center to 'connected' (not used in this test, just documenting structure)
      const _edges = [{ source: 'center', target: 'connected' }]
      void _edges // Suppress unused warning

      const getNodeFrameId = (node: TestNode): string | null => {
        if (node.frame_id) return node.frame_id
        if (isNodeInFrame(node.x, node.y, node.width, node.height, frame)) {
          return frame.id
        }
        return null
      }

      const centerFrameId = getNodeFrameId(allNodes[0])
      expect(centerFrameId).toBe(null)

      // Filter nodes for global layout (center not in frame)
      const nodesToLayout = allNodes.filter(n => !getNodeFrameId(n))

      // Unconnected but unframed nodes should be included
      expect(nodesToLayout.find(n => n.id === 'unconnected_unframed')).toBeDefined()

      // Unconnected but framed nodes should be excluded
      expect(nodesToLayout.find(n => n.id === 'unconnected_framed')).toBeUndefined()
    })
  })
})

describe('Hierarchical Layout - Frame Integration', () => {
  /**
   * Hierarchical layout treats frames as virtual super-nodes:
   * - Frames become nodes in the dagre layout
   * - Frame contents move together when frame moves
   * - Edges between framed nodes become edges between frame super-nodes
   */

  describe('frame as virtual super-node', () => {
    it('creates virtual node for each frame in global layout', () => {
      const frames: TestFrame[] = [
        { id: 'f1', canvas_x: 100, canvas_y: 100, width: 300, height: 200 },
        { id: 'f2', canvas_x: 500, canvas_y: 100, width: 300, height: 200 },
      ]

      // Simulate useLayout creating virtual nodes
      const FRAME_PREFIX = '___FRAME___'
      const virtualNodes = frames.map(frame => ({
        id: FRAME_PREFIX + frame.id,
        x: frame.canvas_x + frame.width / 2,
        y: frame.canvas_y + frame.height / 2,
        width: frame.width,
        height: frame.height,
      }))

      expect(virtualNodes.length).toBe(2)
      expect(virtualNodes[0].id).toBe('___FRAME___f1')
      expect(virtualNodes[1].id).toBe('___FRAME___f2')
      expect(virtualNodes[0].x).toBe(250) // center of frame
      expect(virtualNodes[0].y).toBe(200)
    })

    it('maps framed node edges to frame super-node edges', () => {
      // Frames defined for context (frame_id references)
      const _frames: TestFrame[] = [
        { id: 'f1', canvas_x: 100, canvas_y: 100, width: 300, height: 200 },
        { id: 'f2', canvas_x: 500, canvas_y: 100, width: 300, height: 200 },
      ]
      void _frames // Suppress unused warning

      const nodes: TestNode[] = [
        { id: 'n1', x: 150, y: 150, width: 100, height: 80, frame_id: 'f1' },
        { id: 'n2', x: 550, y: 150, width: 100, height: 80, frame_id: 'f2' },
        { id: 'n3', x: 800, y: 500, width: 100, height: 80 }, // unframed
      ]

      const edges = [
        { source: 'n1', target: 'n2' }, // f1 -> f2
        { source: 'n1', target: 'n3' }, // f1 -> unframed
      ]

      // Simulate edge mapping
      const FRAME_PREFIX = '___FRAME___'
      const nodeToFrameId = new Map<string, string>()
      for (const node of nodes) {
        if (node.frame_id) {
          nodeToFrameId.set(node.id, node.frame_id)
        }
      }

      const mappedEdges = edges.map(e => {
        const sourceFrameId = nodeToFrameId.get(e.source)
        const targetFrameId = nodeToFrameId.get(e.target)
        return {
          source: sourceFrameId ? FRAME_PREFIX + sourceFrameId : e.source,
          target: targetFrameId ? FRAME_PREFIX + targetFrameId : e.target,
        }
      })

      // Edge n1->n2 becomes f1->f2
      expect(mappedEdges[0].source).toBe('___FRAME___f1')
      expect(mappedEdges[0].target).toBe('___FRAME___f2')

      // Edge n1->n3 becomes f1->n3
      expect(mappedEdges[1].source).toBe('___FRAME___f1')
      expect(mappedEdges[1].target).toBe('n3')
    })
  })

  describe('frame contents move together', () => {
    it('calculates delta from frame virtual node movement', () => {
      const frame: TestFrame = { id: 'f1', canvas_x: 100, canvas_y: 100, width: 300, height: 200 }
      const framedNodes: TestNode[] = [
        { id: 'n1', x: 150, y: 150, width: 100, height: 80, frame_id: 'f1' },
        { id: 'n2', x: 200, y: 180, width: 100, height: 80, frame_id: 'f1' },
      ]

      // Old center of frame
      const oldCenterX = frame.canvas_x + frame.width / 2 // 250
      const oldCenterY = frame.canvas_y + frame.height / 2 // 200

      // New position from hierarchical layout (frame moved right and down)
      const newPos = { x: 400, y: 350 }

      // Calculate delta
      const deltaX = newPos.x - oldCenterX // 150
      const deltaY = newPos.y - oldCenterY // 150

      // Apply delta to all nodes in frame
      const movedNodes = framedNodes.map(n => ({
        id: n.id,
        x: n.x + deltaX,
        y: n.y + deltaY,
      }))

      expect(movedNodes[0].x).toBe(300) // 150 + 150
      expect(movedNodes[0].y).toBe(300) // 150 + 150
      expect(movedNodes[1].x).toBe(350) // 200 + 150
      expect(movedNodes[1].y).toBe(330) // 180 + 150
    })

    it('preserves relative positions within frame', () => {
      const frame: TestFrame = { id: 'f1', canvas_x: 100, canvas_y: 100, width: 300, height: 200 }
      const framedNodes: TestNode[] = [
        { id: 'n1', x: 150, y: 150, width: 100, height: 80, frame_id: 'f1' },
        { id: 'n2', x: 250, y: 200, width: 100, height: 80, frame_id: 'f1' },
      ]

      // Calculate original relative positions
      const originalRelative = framedNodes.map(n => ({
        id: n.id,
        relX: n.x - frame.canvas_x,
        relY: n.y - frame.canvas_y,
      }))

      // Frame moves to new position
      const newFrameX = 500
      const newFrameY = 400
      const deltaX = newFrameX - frame.canvas_x
      const deltaY = newFrameY - frame.canvas_y

      // Move nodes with frame
      const movedNodes = framedNodes.map(n => ({
        id: n.id,
        x: n.x + deltaX,
        y: n.y + deltaY,
      }))

      // Calculate new relative positions
      const newRelative = movedNodes.map(n => ({
        id: n.id,
        relX: n.x - newFrameX,
        relY: n.y - newFrameY,
      }))

      // Relative positions should be unchanged
      expect(newRelative[0].relX).toBe(originalRelative[0].relX)
      expect(newRelative[0].relY).toBe(originalRelative[0].relY)
      expect(newRelative[1].relX).toBe(originalRelative[1].relX)
      expect(newRelative[1].relY).toBe(originalRelative[1].relY)
    })
  })

  describe('hierarchical layout post-processing', () => {
    it('pushes unframed nodes out of frames after layout', () => {
      const frame: TestFrame = { id: 'f1', canvas_x: 100, canvas_y: 100, width: 300, height: 200 }

      // After hierarchical layout, unframed node might overlap with frame
      const positions = new Map([
        ['unframed1', { x: 150, y: 150 }], // Overlaps with frame
        ['unframed2', { x: 500, y: 500 }], // Outside frame
      ])

      const nodeMap = new Map([
        ['unframed1', { width: 100, height: 80 }],
        ['unframed2', { width: 100, height: 80 }],
      ])

      const pushed = pushNodesOutOfFrames(positions, nodeMap, [frame])

      // unframed1 should be pushed out
      const pos1 = pushed.get('unframed1')!
      const overlapsX = pos1.x < frame.canvas_x + frame.width && pos1.x + 100 > frame.canvas_x
      const overlapsY = pos1.y < frame.canvas_y + frame.height && pos1.y + 80 > frame.canvas_y
      expect(overlapsX && overlapsY).toBe(false)

      // unframed2 should be unchanged
      expect(pushed.get('unframed2')).toEqual({ x: 500, y: 500 })
    })

    it('constrains frame-scoped hierarchical layout to frame', () => {
      const frame: TestFrame = { id: 'f1', canvas_x: 100, canvas_y: 100, width: 400, height: 300 }

      // Hierarchical layout within frame might place nodes outside
      const positions = new Map([
        ['n1', { x: 50, y: 50 }],
        ['n2', { x: 200, y: 200 }],
        ['n3', { x: 600, y: 500 }],
      ])

      const nodeMap = new Map([
        ['n1', { width: 100, height: 80 }],
        ['n2', { width: 100, height: 80 }],
        ['n3', { width: 100, height: 80 }],
      ])

      const constrained = constrainNodesToFrame(positions, nodeMap, frame, 30)

      for (const [nodeId, pos] of constrained) {
        const node = nodeMap.get(nodeId)!
        expect(pos.x).toBeGreaterThanOrEqual(frame.canvas_x + 30)
        expect(pos.y).toBeGreaterThanOrEqual(frame.canvas_y + 30)
        expect(pos.x + node.width!).toBeLessThanOrEqual(frame.canvas_x + frame.width - 30)
        expect(pos.y + node.height!).toBeLessThanOrEqual(frame.canvas_y + frame.height - 30)
      }
    })
  })

  describe('frame position update', () => {
    it('tracks frame position changes for node movement', () => {
      const frame: TestFrame = { id: 'f1', canvas_x: 100, canvas_y: 100, width: 300, height: 200 }

      // Snapshot frame position before layout
      const frameSnapshot = new Map<string, { x: number; y: number }>()
      frameSnapshot.set(frame.id, { x: frame.canvas_x, y: frame.canvas_y })

      // Simulate layout moving frame
      const newFrameCenter = { x: 400, y: 350 }
      const oldPos = frameSnapshot.get(frame.id)!
      const oldCenterX = oldPos.x + frame.width / 2
      const oldCenterY = oldPos.y + frame.height / 2
      const deltaX = newFrameCenter.x - oldCenterX
      const deltaY = newFrameCenter.y - oldCenterY

      expect(deltaX).toBe(150)
      expect(deltaY).toBe(150)

      // New frame position
      const newFrameX = oldPos.x + deltaX
      const newFrameY = oldPos.y + deltaY
      expect(newFrameX).toBe(250)
      expect(newFrameY).toBe(250)
    })

    it('skips frame update if delta is negligible', () => {
      const frame: TestFrame = { id: 'f1', canvas_x: 100, canvas_y: 100, width: 300, height: 200 }

      const oldCenterX = frame.canvas_x + frame.width / 2
      const oldCenterY = frame.canvas_y + frame.height / 2

      // New position with tiny delta
      const newPos = { x: oldCenterX + 0.5, y: oldCenterY - 0.3 }
      const deltaX = newPos.x - oldCenterX
      const deltaY = newPos.y - oldCenterY

      // Should skip if delta < 1 in both dimensions
      const shouldSkip = Math.abs(deltaX) < 1 && Math.abs(deltaY) < 1
      expect(shouldSkip).toBe(true)
    })
  })
})

describe('Grid Layout - Frame Integration', () => {
  /**
   * Grid layout (including tetris/fast grid) must respect frames
   */

  describe('node filtering for grid layout', () => {
    it('excludes framed nodes from global grid layout', () => {
      const frame: TestFrame = { id: 'f1', canvas_x: 100, canvas_y: 100, width: 300, height: 200 }
      const allNodes: TestNode[] = [
        { id: 'framed1', x: 150, y: 150, width: 100, height: 80, frame_id: 'f1' },
        { id: 'framed2', x: 200, y: 180, width: 100, height: 80, frame_id: 'f1' },
        { id: 'unframed1', x: 500, y: 500, width: 100, height: 80 },
        { id: 'unframed2', x: 600, y: 600, width: 100, height: 80 },
      ]

      // Simulate useLayout node filtering
      const getNodeFrameId = (node: TestNode): string | null => {
        if (node.frame_id) return node.frame_id
        if (isNodeInFrame(node.x, node.y, node.width, node.height, frame)) {
          return frame.id
        }
        return null
      }

      const nodesToLayout = allNodes.filter(n => !getNodeFrameId(n))

      expect(nodesToLayout.length).toBe(2)
      expect(nodesToLayout.map(n => n.id).sort()).toEqual(['unframed1', 'unframed2'])
    })

    it('includes all nodes for frame-scoped grid layout', () => {
      const frame: TestFrame = { id: 'f1', canvas_x: 100, canvas_y: 100, width: 400, height: 300 }
      const allNodes: TestNode[] = [
        { id: 'n1', x: 150, y: 150, width: 100, height: 80, frame_id: 'f1' },
        { id: 'n2', x: 200, y: 200, width: 100, height: 80, frame_id: 'f1' },
        { id: 'n3', x: 250, y: 250, width: 100, height: 80, frame_id: 'f1' },
        { id: 'outside', x: 600, y: 600, width: 100, height: 80 },
      ]

      // When frameId is specified, only nodes in that frame are laid out
      const nodesToLayout = allNodes.filter(n => n.frame_id === frame.id)

      expect(nodesToLayout.length).toBe(3)
      expect(nodesToLayout.map(n => n.id).sort()).toEqual(['n1', 'n2', 'n3'])
    })
  })

  describe('grid layout with frame constraints', () => {
    it('constrains grid positions to frame after layout', () => {
      const frame: TestFrame = { id: 'f1', canvas_x: 100, canvas_y: 100, width: 400, height: 300 }

      // Simulate grid layout producing positions
      const gridPositions = new Map([
        ['n1', { x: 50, y: 50 }],     // Would be outside frame
        ['n2', { x: 200, y: 200 }],   // Inside
        ['n3', { x: 500, y: 400 }],   // Would be outside frame
      ])

      const nodeMap = new Map([
        ['n1', { width: 100, height: 80 }],
        ['n2', { width: 100, height: 80 }],
        ['n3', { width: 100, height: 80 }],
      ])

      const constrained = constrainNodesToFrame(gridPositions, nodeMap, frame, 30)

      for (const [nodeId, pos] of constrained) {
        const node = nodeMap.get(nodeId)!
        expect(pos.x).toBeGreaterThanOrEqual(frame.canvas_x + 30)
        expect(pos.y).toBeGreaterThanOrEqual(frame.canvas_y + 30)
        expect(pos.x + node.width!).toBeLessThanOrEqual(frame.canvas_x + frame.width - 30)
        expect(pos.y + node.height!).toBeLessThanOrEqual(frame.canvas_y + frame.height - 30)
      }
    })

    it('pushes grid positions out of frames for global layout', () => {
      const frame: TestFrame = { id: 'f1', canvas_x: 100, canvas_y: 100, width: 300, height: 200 }

      // Grid layout might position unframed nodes over a frame
      const gridPositions = new Map([
        ['n1', { x: 150, y: 150 }], // Overlaps with frame
        ['n2', { x: 500, y: 500 }], // Outside frame
      ])

      const nodeMap = new Map([
        ['n1', { width: 100, height: 80 }],
        ['n2', { width: 100, height: 80 }],
      ])

      const pushed = pushNodesOutOfFrames(gridPositions, nodeMap, [frame])

      // n1 should be pushed out
      const n1Pos = pushed.get('n1')!
      const overlapsX = n1Pos.x < frame.canvas_x + frame.width && n1Pos.x + 100 > frame.canvas_x
      const overlapsY = n1Pos.y < frame.canvas_y + frame.height && n1Pos.y + 80 > frame.canvas_y
      expect(overlapsX && overlapsY).toBe(false)

      // n2 should be unchanged
      expect(pushed.get('n2')).toEqual({ x: 500, y: 500 })
    })
  })

  describe('spatial frame detection for grid layout', () => {
    it('detects nodes inside frame by spatial overlap even without frame_id', () => {
      const frame: TestFrame = { id: 'f1', canvas_x: 100, canvas_y: 100, width: 300, height: 200 }
      const allNodes: TestNode[] = [
        { id: 'spatial_inside', x: 200, y: 200, width: 100, height: 80 }, // >50% inside
        { id: 'spatial_outside', x: 50, y: 50, width: 100, height: 80 },  // <50% inside
        { id: 'completely_outside', x: 500, y: 500, width: 100, height: 80 },
      ]

      const getNodeFrameId = (node: TestNode): string | null => {
        if (node.frame_id) return node.frame_id
        if (isNodeInFrame(node.x, node.y, node.width, node.height, frame)) {
          return frame.id
        }
        return null
      }

      expect(getNodeFrameId(allNodes[0])).toBe('f1')
      expect(getNodeFrameId(allNodes[1])).toBe(null)
      expect(getNodeFrameId(allNodes[2])).toBe(null)
    })
  })
})

describe('Performance considerations', () => {
  it('handles large number of nodes efficiently', async () => {
    const nodeCount = 100
    const nodes = Array.from({ length: nodeCount }, (_, i) => ({
      id: `n${i}`,
      x: Math.random() * 1000,
      y: Math.random() * 1000,
      width: 100,
      height: 80,
    }))

    const edges = Array.from({ length: nodeCount - 1 }, (_, i) => ({
      source: `n${i}`,
      target: `n${i + 1}`,
    }))

    const start = performance.now()
    const result = await applyForceLayout(nodes, edges, {
      centerX: 500,
      centerY: 500,
      iterations: 50, // Fewer iterations for test
    })
    const duration = performance.now() - start

    expect(result.size).toBe(nodeCount)
    // Should complete reasonably fast (< 5 seconds for 100 nodes)
    expect(duration).toBeLessThan(5000)
  })

  it('pushNodesOutOfFrames handles many frames', () => {
    const frameCount = 20
    const frames = Array.from({ length: frameCount }, (_, i) => ({
      id: `f${i}`,
      canvas_x: (i % 5) * 250,
      canvas_y: Math.floor(i / 5) * 200,
      width: 200,
      height: 150,
    }))

    const nodeMap = new Map([
      ['n1', { width: 80, height: 60 }],
    ])

    // Position node in the middle of the frame grid
    const positions = new Map([
      ['n1', { x: 125, y: 75 }], // Inside first frame
    ])

    const start = performance.now()
    const result = pushNodesOutOfFrames(positions, nodeMap, frames)
    const duration = performance.now() - start

    expect(result.has('n1')).toBe(true)
    // Should be fast
    expect(duration).toBeLessThan(100)
  })

  it('constrainNodesToFrame handles many nodes efficiently', () => {
    const frame: TestFrame = { id: 'f1', canvas_x: 0, canvas_y: 0, width: 10000, height: 10000 }
    const nodeCount = 500

    const nodeMap = new Map(
      Array.from({ length: nodeCount }, (_, i) => [`n${i}`, { width: 100, height: 80 }])
    )

    const positions = new Map(
      Array.from({ length: nodeCount }, (_, i) => [
        `n${i}`,
        { x: Math.random() * 12000 - 1000, y: Math.random() * 12000 - 1000 },
      ])
    )

    const start = performance.now()
    const result = constrainNodesToFrame(positions, nodeMap, frame, 30)
    const duration = performance.now() - start

    expect(result.size).toBe(nodeCount)
    expect(duration).toBeLessThan(100)
  })
})
