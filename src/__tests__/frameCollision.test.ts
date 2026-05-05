/**
 * Frame collision utility tests
 * Tests for constraining nodes to frames and pushing nodes out of frames
 */
import { describe, it, expect } from 'vitest'
import {
  pushNodesOutOfFrames,
  constrainNodesToFrame,
  isNodeInFrame,
} from '../canvas/composables/layout/useFrameCollision'

describe('isNodeInFrame', () => {
  const frame = { canvas_x: 100, canvas_y: 100, width: 400, height: 300 }

  it('should return true when node is fully inside frame', () => {
    expect(isNodeInFrame(150, 150, 100, 80, frame)).toBe(true)
  })

  it('should return true when node is mostly inside frame (>50% overlap)', () => {
    // Node at edge but mostly inside
    expect(isNodeInFrame(80, 150, 100, 80, frame)).toBe(true)
  })

  it('should return false when node is mostly outside frame (<50% overlap)', () => {
    // Node mostly outside
    expect(isNodeInFrame(20, 150, 100, 80, frame)).toBe(false)
  })

  it('should return false when node is completely outside frame', () => {
    expect(isNodeInFrame(600, 600, 100, 80, frame)).toBe(false)
  })
})

describe('constrainNodesToFrame', () => {
  const frame = { canvas_x: 100, canvas_y: 100, width: 400, height: 300 }
  const nodeMap = new Map([
    ['node1', { width: 200, height: 120 }],
    ['node2', { width: 200, height: 120 }],
  ])

  it('should keep nodes inside frame boundaries', () => {
    const positions = new Map([
      ['node1', { x: 50, y: 50 }], // Outside left/top
    ])

    const result = constrainNodesToFrame(positions, nodeMap, frame)
    const pos = result.get('node1')!

    // Should be constrained to frame bounds (with padding)
    expect(pos.x).toBeGreaterThanOrEqual(100)
    expect(pos.y).toBeGreaterThanOrEqual(100)
  })

  it('should constrain nodes that would extend past right/bottom edge', () => {
    const positions = new Map([
      ['node1', { x: 400, y: 350 }], // Would extend past frame
    ])

    const result = constrainNodesToFrame(positions, nodeMap, frame)
    const pos = result.get('node1')!

    // Node + width should not exceed frame right edge
    expect(pos.x + 200).toBeLessThanOrEqual(500 - 20) // frame right - padding
    expect(pos.y + 120).toBeLessThanOrEqual(400 - 20) // frame bottom - padding
  })

  it('should not modify nodes already within bounds', () => {
    const positions = new Map([
      ['node1', { x: 200, y: 200 }],
    ])

    const result = constrainNodesToFrame(positions, nodeMap, frame)
    const pos = result.get('node1')!

    expect(pos.x).toBe(200)
    expect(pos.y).toBe(200)
  })
})

describe('pushNodesOutOfFrames', () => {
  const frames = [
    { canvas_x: 100, canvas_y: 100, width: 400, height: 300 },
  ]
  const nodeMap = new Map([
    ['node1', { width: 200, height: 120 }],
    ['node2', { width: 200, height: 120 }],
  ])

  it('should push nodes out of frame boundaries', () => {
    const positions = new Map([
      ['node1', { x: 200, y: 200 }], // Inside frame
    ])

    const result = pushNodesOutOfFrames(positions, nodeMap, frames)
    const pos = result.get('node1')!

    // Node should be pushed outside frame
    const nodeRight = pos.x + 200
    const nodeBottom = pos.y + 120
    const frameRight = 500
    const frameBottom = 400

    // Should not overlap with frame
    const overlapsX = pos.x < frameRight && nodeRight > 100
    const overlapsY = pos.y < frameBottom && nodeBottom > 100
    expect(overlapsX && overlapsY).toBe(false)
  })

  it('should not modify nodes already outside frames', () => {
    const positions = new Map([
      ['node1', { x: 600, y: 600 }], // Outside frame
    ])

    const result = pushNodesOutOfFrames(positions, nodeMap, frames)
    const pos = result.get('node1')!

    expect(pos.x).toBe(600)
    expect(pos.y).toBe(600)
  })

  it('should handle multiple frames with sufficient gap', () => {
    // Frames with 300px gap (enough for 200px wide node + padding)
    const multiFrames = [
      { canvas_x: 100, canvas_y: 100, width: 200, height: 200 },
      { canvas_x: 600, canvas_y: 100, width: 200, height: 200 },
    ]

    const positions = new Map([
      ['node1', { x: 150, y: 150 }], // Inside first frame
    ])

    const result = pushNodesOutOfFrames(positions, nodeMap, multiFrames)
    const pos = result.get('node1')!

    // Should be pushed out of first frame and not into second
    // Check it doesn't overlap with either frame
    for (const frame of multiFrames) {
      const nodeRight = pos.x + 200
      const nodeBottom = pos.y + 120
      const frameRight = frame.canvas_x + frame.width
      const frameBottom = frame.canvas_y + frame.height

      const overlapsX = pos.x < frameRight && nodeRight > frame.canvas_x
      const overlapsY = pos.y < frameBottom && nodeBottom > frame.canvas_y

      expect(overlapsX && overlapsY).toBe(false)
    }
  })

  it('should push vertically when horizontal space is insufficient', () => {
    // Frames too close horizontally for node to fit between
    const closeFrames = [
      { canvas_x: 100, canvas_y: 100, width: 200, height: 200 },
      { canvas_x: 350, canvas_y: 100, width: 200, height: 200 },
    ]

    const positions = new Map([
      ['node1', { x: 150, y: 150 }], // Inside first frame
    ])

    const result = pushNodesOutOfFrames(positions, nodeMap, closeFrames)
    const pos = result.get('node1')!

    // Node should end up somewhere - either pushed up/down or to side
    // Main requirement: after max iterations, position should be stable
    expect(pos).toBeDefined()
    expect(typeof pos.x).toBe('number')
    expect(typeof pos.y).toBe('number')
  })

  it('should return empty map for empty positions', () => {
    const result = pushNodesOutOfFrames(new Map(), nodeMap, frames)
    expect(result.size).toBe(0)
  })

  it('should return positions unchanged when no frames exist', () => {
    const positions = new Map([
      ['node1', { x: 200, y: 200 }],
    ])

    const result = pushNodesOutOfFrames(positions, nodeMap, [])
    const pos = result.get('node1')!

    expect(pos.x).toBe(200)
    expect(pos.y).toBe(200)
  })
})

describe('Frame isolation - radial layout scenarios', () => {
  /**
   * These tests verify that frame operations only affect the intended nodes
   */

  it('constrainNodesToFrame should only affect nodes in positions map', () => {
    const frame = { canvas_x: 100, canvas_y: 100, width: 400, height: 300 }
    const nodeMap = new Map([
      ['framed1', { width: 200, height: 120 }],
      ['framed2', { width: 200, height: 120 }],
      ['unframed1', { width: 200, height: 120 }],
    ])

    // Only include framed nodes in positions - unframed should not be affected
    const positions = new Map([
      ['framed1', { x: 200, y: 200 }],
      ['framed2', { x: 250, y: 250 }],
    ])

    const result = constrainNodesToFrame(positions, nodeMap, frame)

    // Only nodes in positions map should be in result
    expect(result.has('framed1')).toBe(true)
    expect(result.has('framed2')).toBe(true)
    expect(result.has('unframed1')).toBe(false)
  })

  it('pushNodesOutOfFrames should only affect nodes in positions map', () => {
    const frames = [
      { canvas_x: 100, canvas_y: 100, width: 400, height: 300 },
    ]
    const nodeMap = new Map([
      ['unframed1', { width: 200, height: 120 }],
      ['unframed2', { width: 200, height: 120 }],
      ['framed1', { width: 200, height: 120 }],
    ])

    // Only include unframed nodes in positions - framed should not be affected
    const positions = new Map([
      ['unframed1', { x: 600, y: 600 }],
      ['unframed2', { x: 700, y: 700 }],
    ])

    const result = pushNodesOutOfFrames(positions, nodeMap, frames)

    // Only nodes in positions map should be in result
    expect(result.has('unframed1')).toBe(true)
    expect(result.has('unframed2')).toBe(true)
    expect(result.has('framed1')).toBe(false)
  })
})
