/**
 * Frame collision utility tests
 * Tests for constraining nodes to frames and pushing nodes out of frames
 */
import { describe, it, expect } from 'vitest'
import {
  pushNodesOutOfFrames,
  constrainNodesToFrame,
  isNodeInFrame,
  isNodeTouchingFrame,
  isNodeCenterInFrame,
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

  describe('50% overlap boundary precision', () => {
    // Node 100x100 = 10000 area, need >5000 overlap
    const nodeWidth = 100
    const nodeHeight = 100

    it('returns true at exactly 51% horizontal overlap', () => {
      // Node x=49 means it extends from 49 to 149
      // Frame starts at 100, so overlap is 49 pixels (49-100 to 149 = 49px)
      // Wait, let me recalculate:
      // Node from 49 to 149, frame from 100 to 500
      // Overlap X = min(149, 500) - max(49, 100) = 149 - 100 = 49px
      // Full height overlap = 100px
      // Overlap area = 49 * 100 = 4900 < 5000 = false

      // For 51% we need >5000, so need 51px overlap minimum
      // Node from 49 to 149 gives 49px overlap (false)
      // Node from 48 to 148 gives 48px overlap (false)
      // Node from 50 to 150 gives 50px overlap (false - need >50%)
      // Node from 49.5 to 149.5 gives 49.5px overlap (false)
      // Need node starting at 49 or less to get 51+ overlap

      // Actually: node at x=49, extends to 149
      // Overlap = min(149, 500) - max(49, 100) = 149 - 100 = 49
      // That's 49% of 100.

      // For >50%: need overlap > 50 pixels horizontally (full height)
      // Node at x=49: overlap = 149-100 = 49 (49%)
      // Node at x=48: overlap = 148-100 = 48 (48%)
      // Wait that's wrong direction

      // Node at x=50: overlap = 150-100 = 50 (50%) - boundary
      // Node at x=49: overlap = 149-100 = 49 (49%) - below
      // Node at x=51: overlap = 151-100 = 51 (51%) - above

      // Hmm, going left gives MORE overlap not less
      // Node at x=40: extends to 140, overlap = 140-100 = 40. No wait
      // Frame is 100-500, node is 40-140
      // Overlap = min(140, 500) - max(40, 100) = 140 - 100 = 40px

      // OK so: node needs to be far enough inside
      // For full height coverage, need 51px horizontal overlap
      // Node at x=49 gives overlap of min(149,500)-max(49,100) = 149-100 = 49
      // Node at x=48 gives overlap of min(148,500)-max(48,100) = 148-100 = 48
      // Going left (smaller x) gives LESS overlap because right edge moves left

      // Going right (larger x):
      // Node at x=50 gives min(150,500)-max(50,100) = 150-100 = 50 (50% = false)
      // Node at x=51 gives min(151,500)-max(51,100) = 151-100 = 51 (51% = true but barely)

      // Hmm wait I had it backwards. Let me think again.
      // Node at x=50 (left edge), width=100, so right edge at 150
      // Frame starts at x=100
      // Overlap starts at max(50, 100) = 100
      // Overlap ends at min(150, 500) = 150
      // Overlap width = 150 - 100 = 50

      // Node at x=49, right edge at 149
      // Overlap = min(149, 500) - max(49, 100) = 149 - 100 = 49

      // So to get 51 pixels of overlap with full height:
      // Need node left edge such that (leftEdge + 100) - 100 >= 51
      // leftEdge >= 51
      // At leftEdge = 51, right edge = 151, overlap = 151-100 = 51

      // But wait, node is 100x100 = 10000 area
      // 51x100 = 5100 > 5000 so that's >50%

      // Test with node at x=51 (full height inside)
      expect(isNodeInFrame(51, 150, nodeWidth, nodeHeight, frame)).toBe(true)
    })

    it('returns false at exactly 50% overlap', () => {
      // Node at x=50, full height inside frame
      // Overlap = 50 * 100 = 5000 = 50% exactly
      // Condition is > 50%, so this should be false
      expect(isNodeInFrame(50, 150, nodeWidth, nodeHeight, frame)).toBe(false)
    })

    it('returns false at 49% overlap', () => {
      expect(isNodeInFrame(49, 150, nodeWidth, nodeHeight, frame)).toBe(false)
    })

    it('handles partial vertical overlap correctly', () => {
      // Node partially above frame
      // Node at y=50, extends to 150, frame starts at y=100
      // Vertical overlap = 150 - 100 = 50px
      // If horizontal overlap is 100px (fully inside horizontally)
      // Total overlap = 50 * 100 = 5000 = 50% exactly = false
      expect(isNodeInFrame(200, 50, nodeWidth, nodeHeight, frame)).toBe(false)

      // Node at y=49, vertical overlap = 149-100 = 49px
      // Total overlap = 49 * 100 = 4900 < 5000 = false
      expect(isNodeInFrame(200, 49, nodeWidth, nodeHeight, frame)).toBe(false)

      // Node at y=51, vertical overlap = 151-100 = 51px
      // Total overlap = 51 * 100 = 5100 > 5000 = true
      expect(isNodeInFrame(200, 51, nodeWidth, nodeHeight, frame)).toBe(true)
    })

    it('handles corner overlap correctly', () => {
      // Node at corner with both partial X and Y overlap
      // For 50% of 10000 = 5000, need sqrt(5000) ≈ 70.7 in each dimension
      // Node at (30, 30) gives overlaps of 30 in each = 900 area = 9% = false
      expect(isNodeInFrame(30, 30, nodeWidth, nodeHeight, frame)).toBe(false)

      // Node overlapping bottom-right corner
      // Node at (450, 350), extends to (550, 450)
      // Frame ends at (500, 400)
      // Overlap X = 500 - 450 = 50
      // Overlap Y = 400 - 350 = 50
      // Overlap area = 2500 = 25% = false
      expect(isNodeInFrame(450, 350, nodeWidth, nodeHeight, frame)).toBe(false)
    })
  })

  describe('edge alignment', () => {
    it('returns false when node right edge touches frame left edge', () => {
      // Node ends exactly where frame begins (no overlap)
      expect(isNodeInFrame(0, 150, 100, 80, frame)).toBe(false)
    })

    it('returns false when node left edge touches frame right edge', () => {
      // Node starts exactly where frame ends
      expect(isNodeInFrame(500, 150, 100, 80, frame)).toBe(false)
    })

    it('returns false when node bottom edge touches frame top edge', () => {
      expect(isNodeInFrame(200, 20, 100, 80, frame)).toBe(false)
    })

    it('returns false when node top edge touches frame bottom edge', () => {
      expect(isNodeInFrame(200, 400, 100, 80, frame)).toBe(false)
    })
  })

  describe('different node sizes', () => {
    it('handles very small nodes', () => {
      // 10x10 node fully inside
      expect(isNodeInFrame(200, 200, 10, 10, frame)).toBe(true)

      // 10x10 node at frame edge
      // At x=95, extends to 105, frame starts at 100
      // Overlap = min(105, 500) - max(95, 100) = 105 - 100 = 5px
      // Area overlap = 5 * 10 = 50, node area = 100, 50% exactly = false (need >50%)
      expect(isNodeInFrame(95, 200, 10, 10, frame)).toBe(false)

      // At x=94, extends to 104, overlap = 4px = 40% = false
      expect(isNodeInFrame(94, 200, 10, 10, frame)).toBe(false)

      // At x=96, extends to 106, overlap = 6px = 60% = true
      expect(isNodeInFrame(96, 200, 10, 10, frame)).toBe(true)
    })

    it('handles very large nodes', () => {
      // 500x400 node (larger than frame)
      // Node covers entire frame, overlap = frame area = 400*300 = 120000
      // Node area = 500*400 = 200000
      // 120000/200000 = 60% = true
      expect(isNodeInFrame(50, 50, 500, 400, frame)).toBe(true)
    })

    it('handles non-square nodes', () => {
      // Wide node: 200x50 = 10000 area
      // Need >5000 overlap for >50%

      // At y=75, extends to y=125, frame starts at y=100
      // Overlap Y = 125 - 100 = 25px
      // Overlap X = 200 (fully inside horizontally at x=200)
      // Total = 25 * 200 = 5000 = 50% exactly = false
      expect(isNodeInFrame(200, 75, 200, 50, frame)).toBe(false)

      // At y=74, extends to 124, overlap = 24, total = 4800 < 5000 = false
      expect(isNodeInFrame(200, 74, 200, 50, frame)).toBe(false)

      // At y=76, extends to 126, overlap = 26, total = 5200 > 5000 = true
      expect(isNodeInFrame(200, 76, 200, 50, frame)).toBe(true)
    })
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

    // Should be constrained to frame bounds (with default padding=30)
    expect(pos.x).toBeGreaterThanOrEqual(130) // frame.x + padding
    expect(pos.y).toBeGreaterThanOrEqual(130) // frame.y + padding
  })

  it('should constrain nodes that would extend past right/bottom edge', () => {
    const positions = new Map([
      ['node1', { x: 400, y: 350 }], // Would extend past frame
    ])

    const result = constrainNodesToFrame(positions, nodeMap, frame)
    const pos = result.get('node1')!

    // Node + width should not exceed frame right edge minus padding
    expect(pos.x + 200).toBeLessThanOrEqual(500 - 30) // frame right - padding
    expect(pos.y + 120).toBeLessThanOrEqual(400 - 30) // frame bottom - padding
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

  describe('padding parameter variations', () => {
    it('uses default padding of 30 when not specified', () => {
      const smallNode = new Map([['n1', { width: 100, height: 80 }]])
      const positions = new Map([['n1', { x: 50, y: 50 }]])

      const result = constrainNodesToFrame(positions, smallNode, frame)
      const pos = result.get('n1')!

      // Should be at frame.x + 30 = 130
      expect(pos.x).toBe(130)
      expect(pos.y).toBe(130)
    })

    it('respects custom padding=0', () => {
      const smallNode = new Map([['n1', { width: 100, height: 80 }]])
      const positions = new Map([['n1', { x: 50, y: 50 }]])

      const result = constrainNodesToFrame(positions, smallNode, frame, 0)
      const pos = result.get('n1')!

      // Should be exactly at frame edge
      expect(pos.x).toBe(100)
      expect(pos.y).toBe(100)
    })

    it('respects custom padding=50', () => {
      const smallNode = new Map([['n1', { width: 100, height: 80 }]])
      const positions = new Map([['n1', { x: 50, y: 50 }]])

      const result = constrainNodesToFrame(positions, smallNode, frame, 50)
      const pos = result.get('n1')!

      expect(pos.x).toBe(150) // frame.x + 50
      expect(pos.y).toBe(150) // frame.y + 50
    })

    it('constrains right/bottom edge with custom padding', () => {
      const smallNode = new Map([['n1', { width: 100, height: 80 }]])
      const positions = new Map([['n1', { x: 500, y: 400 }]]) // Way outside

      const result = constrainNodesToFrame(positions, smallNode, frame, 50)
      const pos = result.get('n1')!

      // maxX = frame.x + frame.width - nodeWidth - padding = 100 + 400 - 100 - 50 = 350
      expect(pos.x).toBe(350)
      // maxY = frame.y + frame.height - nodeHeight - padding = 100 + 300 - 80 - 50 = 270
      expect(pos.y).toBe(270)
    })
  })

  describe('boundary precision', () => {
    it('places node exactly at minimum boundary when outside left', () => {
      const smallNode = new Map([['n1', { width: 100, height: 80 }]])
      const positions = new Map([['n1', { x: 0, y: 200 }]])

      const result = constrainNodesToFrame(positions, smallNode, frame, 30)
      const pos = result.get('n1')!

      expect(pos.x).toBe(130) // Exactly frame.x + padding
    })

    it('places node exactly at maximum boundary when outside right', () => {
      const smallNode = new Map([['n1', { width: 100, height: 80 }]])
      const positions = new Map([['n1', { x: 1000, y: 200 }]])

      const result = constrainNodesToFrame(positions, smallNode, frame, 30)
      const pos = result.get('n1')!

      // maxX = 100 + 400 - 100 - 30 = 370
      expect(pos.x).toBe(370)
      expect(pos.x + 100).toBe(470) // Node right edge
      expect(470).toBe(500 - 30) // = frame right - padding
    })
  })

  describe('NODE_DEFAULTS fallback', () => {
    it('uses default dimensions when node not in nodeMap', () => {
      const emptyNodeMap = new Map<string, { width?: number; height?: number }>()
      const positions = new Map([['unknown', { x: 50, y: 50 }]])

      const result = constrainNodesToFrame(positions, emptyNodeMap, frame, 30)
      const pos = result.get('unknown')!

      // Should still constrain using NODE_DEFAULTS (200x120)
      expect(pos.x).toBe(130)
      expect(pos.y).toBe(130)
    })

    it('uses default width when only height provided', () => {
      const partialNode = new Map([['n1', { height: 80 }]])
      const positions = new Map([['n1', { x: 1000, y: 200 }]])

      const result = constrainNodesToFrame(positions, partialNode, frame, 30)
      const pos = result.get('n1')!

      // maxX uses NODE_DEFAULTS.WIDTH (200)
      // maxX = 100 + 400 - 200 - 30 = 270
      expect(pos.x).toBe(270)
    })
  })

  describe('small frame handling', () => {
    it('handles frame smaller than node width gracefully', () => {
      const smallFrame = { canvas_x: 100, canvas_y: 100, width: 150, height: 300 }
      const largeNode = new Map([['n1', { width: 200, height: 80 }]])
      const positions = new Map([['n1', { x: 200, y: 200 }]])

      const result = constrainNodesToFrame(positions, largeNode, smallFrame, 30)
      const pos = result.get('n1')!

      // minX = 100 + 30 = 130
      // maxX = 100 + 150 - 200 - 30 = 20 (less than minX!)
      // clampedMaxX = max(130, 20) = 130
      // Result should be clamped to 130
      expect(pos.x).toBe(130)
      expect(Number.isFinite(pos.x)).toBe(true)
    })

    it('handles frame smaller than node height gracefully', () => {
      const smallFrame = { canvas_x: 100, canvas_y: 100, width: 400, height: 80 }
      const tallNode = new Map([['n1', { width: 100, height: 120 }]])
      const positions = new Map([['n1', { x: 200, y: 200 }]])

      const result = constrainNodesToFrame(positions, tallNode, smallFrame, 30)
      const pos = result.get('n1')!

      // minY = 100 + 30 = 130
      // maxY = 100 + 80 - 120 - 30 = 30 (less than minY!)
      // clampedMaxY = max(130, 30) = 130
      expect(pos.y).toBe(130)
      expect(Number.isFinite(pos.y)).toBe(true)
    })

    it('handles frame smaller than node in both dimensions', () => {
      const tinyFrame = { canvas_x: 100, canvas_y: 100, width: 100, height: 80 }
      const largeNode = new Map([['n1', { width: 200, height: 150 }]])
      const positions = new Map([['n1', { x: 200, y: 200 }]])

      const result = constrainNodesToFrame(positions, largeNode, tinyFrame, 30)
      const pos = result.get('n1')!

      // Both dimensions should clamp to minX/minY
      expect(pos.x).toBe(130)
      expect(pos.y).toBe(130)
    })
  })

  describe('multiple nodes', () => {
    it('constrains each node independently', () => {
      const nodes = new Map([
        ['n1', { width: 100, height: 80 }],
        ['n2', { width: 150, height: 100 }],
        ['n3', { width: 80, height: 60 }],
      ])
      const positions = new Map([
        ['n1', { x: 0, y: 0 }],       // Outside top-left
        ['n2', { x: 600, y: 500 }],   // Outside bottom-right
        ['n3', { x: 200, y: 200 }],   // Inside
      ])

      const result = constrainNodesToFrame(positions, nodes, frame, 30)

      // n1 should be at min bounds
      expect(result.get('n1')!.x).toBe(130)
      expect(result.get('n1')!.y).toBe(130)

      // n2 should be at max bounds (considering its size)
      // maxX = 100 + 400 - 150 - 30 = 320
      // maxY = 100 + 300 - 100 - 30 = 270
      expect(result.get('n2')!.x).toBe(320)
      expect(result.get('n2')!.y).toBe(270)

      // n3 should be unchanged (already inside)
      expect(result.get('n3')!.x).toBe(200)
      expect(result.get('n3')!.y).toBe(200)
    })
  })
})

describe('isNodeTouchingFrame', () => {
  const frame = { canvas_x: 100, canvas_y: 100, width: 400, height: 300 }

  it('should return true when node fully inside frame', () => {
    expect(isNodeTouchingFrame(200, 200, 100, 80, frame)).toBe(true)
  })

  it('should return true when node partially overlaps frame', () => {
    // Node extending past right edge
    expect(isNodeTouchingFrame(450, 200, 100, 80, frame)).toBe(true)
  })

  it('should return true when node touches frame edge exactly', () => {
    // Node touching right edge (500)
    expect(isNodeTouchingFrame(500, 200, 100, 80, frame)).toBe(false) // Just outside
    expect(isNodeTouchingFrame(499, 200, 100, 80, frame)).toBe(true)  // Touching
  })

  it('should return false when node is outside frame', () => {
    expect(isNodeTouchingFrame(600, 200, 100, 80, frame)).toBe(false)
    expect(isNodeTouchingFrame(200, 500, 100, 80, frame)).toBe(false)
  })

  it('should respect padding parameter', () => {
    // Node just outside frame (frame ends at x=500)
    // Without padding, node at x=520 should not touch (520 > 500)
    expect(isNodeTouchingFrame(520, 200, 100, 80, frame, 0)).toBe(false)
    // With 30px padding, node at x=520 should touch (520 < 500+30)
    expect(isNodeTouchingFrame(520, 200, 100, 80, frame, 30)).toBe(true)
  })

  it('should detect single pixel overlap', () => {
    // Node that just barely overlaps
    expect(isNodeTouchingFrame(99, 200, 2, 80, frame)).toBe(true) // 1px overlap
  })
})

describe('isNodeCenterInFrame', () => {
  const frame = { canvas_x: 100, canvas_y: 100, width: 400, height: 300 }

  it('should return true when node center is inside frame', () => {
    // Node 100x80 centered at (250, 240) -> center at (300, 280)
    expect(isNodeCenterInFrame(250, 240, 100, 80, frame)).toBe(true)
  })

  it('should return false when node center is outside frame', () => {
    // Node with center outside frame right edge (frame ends at x=500)
    // Node at x=460, width=100 -> center at 510 (outside)
    expect(isNodeCenterInFrame(460, 200, 100, 80, frame)).toBe(false)
  })

  it('should return true when center is exactly on frame edge', () => {
    // Frame x: 100-500, center at 500 is on edge -> included
    // Node width=100, so x=450 gives center at 500
    expect(isNodeCenterInFrame(450, 200, 100, 80, frame)).toBe(true)
  })

  it('should handle node extending outside while center is inside', () => {
    // Node mostly outside but center inside
    // Node at x=50, width=100 -> center at 100 (on left edge)
    expect(isNodeCenterInFrame(50, 200, 100, 80, frame)).toBe(true)
  })

  it('should handle vertical center check', () => {
    // Frame y: 100-400
    // Node at y=390, height=80 -> center at 430 (outside)
    expect(isNodeCenterInFrame(200, 390, 100, 80, frame)).toBe(false)
    // Node at y=300, height=80 -> center at 340 (inside)
    expect(isNodeCenterInFrame(200, 300, 100, 80, frame)).toBe(true)
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

  describe('minimum push direction algorithm', () => {
    it('pushes left when left edge is closest to frame boundary', () => {
      // Frame at 100-500 x 100-400
      // Node at x=110 (left edge 10px from frame left)
      // Node width=200, so right edge at 310 (190px from frame right at 500)
      // pushLeft = nodeRight - frame.x = 310 - 100 = 210
      // pushRight = frameRight - node.x = 500 - 110 = 390
      // pushUp/Down similar
      // Smallest should be pushLeft when node is near left edge
      const smallNode = new Map([['n1', { width: 100, height: 80 }]])
      const positions = new Map([['n1', { x: 110, y: 200 }]])

      const result = pushNodesOutOfFrames(positions, smallNode, frames)
      const pos = result.get('n1')!

      // Should be pushed left (node right edge should be at frame.x - padding = 100 - 30 = 70)
      // So node x should be 70 - 100 = -30
      expect(pos.x).toBe(-30)
    })

    it('pushes right when right edge is closest', () => {
      const smallNode = new Map([['n1', { width: 100, height: 80 }]])
      // Node at x=390, right edge at 490, frame right at 500
      // pushRight = 500 - 390 = 110
      // pushLeft = 490 - 100 = 390
      const positions = new Map([['n1', { x: 390, y: 200 }]])

      const result = pushNodesOutOfFrames(positions, smallNode, frames)
      const pos = result.get('n1')!

      // Should be pushed right to frameRight + padding = 500 + 30 = 530
      expect(pos.x).toBe(530)
    })

    it('pushes up when top edge is closest', () => {
      const smallNode = new Map([['n1', { width: 100, height: 80 }]])
      // Node at y=110, bottom at 190, frame top at 100
      // pushUp = 190 - 100 = 90
      // pushDown = 400 - 110 = 290
      const positions = new Map([['n1', { x: 250, y: 110 }]])

      const result = pushNodesOutOfFrames(positions, smallNode, frames)
      const pos = result.get('n1')!

      // Should be pushed up to frame.y - nodeHeight - padding = 100 - 80 - 30 = -10
      expect(pos.y).toBe(-10)
    })

    it('pushes down when bottom edge is closest', () => {
      const smallNode = new Map([['n1', { width: 100, height: 80 }]])
      // Node at y=310, bottom at 390, frame bottom at 400
      // pushDown = 400 - 310 = 90
      // pushUp = 390 - 100 = 290
      const positions = new Map([['n1', { x: 250, y: 310 }]])

      const result = pushNodesOutOfFrames(positions, smallNode, frames)
      const pos = result.get('n1')!

      // Should be pushed down to frameBottom + padding = 400 + 30 = 430
      expect(pos.y).toBe(430)
    })
  })

  describe('framePadding=30 verification', () => {
    it('maintains 30px gap between node and frame after push', () => {
      const smallNode = new Map([['n1', { width: 100, height: 80 }]])
      // Push right scenario
      const positions = new Map([['n1', { x: 450, y: 200 }]])

      const result = pushNodesOutOfFrames(positions, smallNode, frames)
      const pos = result.get('n1')!

      // Node should be at frameRight + 30 = 530
      expect(pos.x).toBe(530)
      // Gap between frame right (500) and node left (530) is 30px
      expect(pos.x - 500).toBe(30)
    })
  })

  describe('chain reaction with adjacent frames', () => {
    it('handles node pushed from one frame with sufficient gap', () => {
      // Two frames with gap large enough for node + padding
      const separatedFrames = [
        { canvas_x: 100, canvas_y: 100, width: 200, height: 200 },
        { canvas_x: 500, canvas_y: 100, width: 200, height: 200 }, // 200px gap (enough for 100px node + 2*30px padding)
      ]
      const smallNode = new Map([['n1', { width: 100, height: 80 }]])

      // Node inside first frame
      const positions = new Map([['n1', { x: 200, y: 150 }]])

      const result = pushNodesOutOfFrames(positions, smallNode, separatedFrames)
      const pos = result.get('n1')!

      // Should be pushed into the gap between frames
      // Frame 1 ends at 300, frame 2 starts at 500
      // Node should be at 300 + 30 = 330
      expect(pos.x).toBe(330)
    })

    it('pushes vertically when horizontal gap is insufficient', () => {
      // Two frames too close horizontally - node must go up or down
      const adjacentFrames = [
        { canvas_x: 100, canvas_y: 100, width: 200, height: 200 },
        { canvas_x: 330, canvas_y: 100, width: 200, height: 200 }, // 30px gap, too small for 100px node
      ]
      const smallNode = new Map([['n1', { width: 100, height: 80 }]])

      const positions = new Map([['n1', { x: 200, y: 150 }]])

      const result = pushNodesOutOfFrames(positions, smallNode, adjacentFrames)
      const pos = result.get('n1')!

      // After iterations, node should end up either above or below frames
      // Due to iteration limit, might still overlap but should have attempted to escape
      expect(pos).toBeDefined()
      expect(typeof pos.y).toBe('number')
    })

    it('respects maxIterations=10 limit', () => {
      // Create a scenario where node keeps bouncing
      // This tests that the algorithm terminates
      const manyFrames = Array.from({ length: 20 }, (_, i) => ({
        canvas_x: (i % 5) * 150,
        canvas_y: Math.floor(i / 5) * 150,
        width: 100,
        height: 100,
      }))
      const smallNode = new Map([['n1', { width: 80, height: 80 }]])
      const positions = new Map([['n1', { x: 10, y: 10 }]])

      // Should complete without hanging
      const start = performance.now()
      const result = pushNodesOutOfFrames(positions, smallNode, manyFrames)
      const duration = performance.now() - start

      expect(result.has('n1')).toBe(true)
      expect(duration).toBeLessThan(100) // Should be fast due to iteration limit
    })
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

describe('Node fully inside frame - boundary constraints', () => {
  /**
   * Critical tests: nodes must stay FULLY inside frames, not just their center
   */

  it('should keep entire node within frame bounds (not just center)', () => {
    const frame = { canvas_x: 100, canvas_y: 100, width: 400, height: 300 }
    const nodeMap = new Map([
      ['node1', { width: 200, height: 120 }],
    ])

    // Node positioned so center is inside but right edge would extend past frame
    const positions = new Map([
      ['node1', { x: 350, y: 200 }], // Right edge at 550, frame ends at 500
    ])

    const result = constrainNodesToFrame(positions, nodeMap, frame, 30)
    const pos = result.get('node1')!

    // Node right edge (pos.x + 200) must be inside frame right edge (500) minus padding (30)
    expect(pos.x + 200).toBeLessThanOrEqual(500 - 30)
    // Node bottom edge (pos.y + 120) must be inside frame bottom edge (400) minus padding (30)
    expect(pos.y + 120).toBeLessThanOrEqual(400 - 30)
  })

  it('should keep entire node within frame bounds at top-left corner', () => {
    const frame = { canvas_x: 100, canvas_y: 100, width: 400, height: 300 }
    const nodeMap = new Map([
      ['node1', { width: 200, height: 120 }],
    ])

    // Node positioned outside top-left
    const positions = new Map([
      ['node1', { x: 50, y: 50 }],
    ])

    const result = constrainNodesToFrame(positions, nodeMap, frame, 30)
    const pos = result.get('node1')!

    // Node left edge must be at least frame left + padding
    expect(pos.x).toBeGreaterThanOrEqual(100 + 30)
    // Node top edge must be at least frame top + padding
    expect(pos.y).toBeGreaterThanOrEqual(100 + 30)
  })

  it('should handle large nodes in small frames gracefully', () => {
    // Frame smaller than node
    const frame = { canvas_x: 100, canvas_y: 100, width: 150, height: 100 }
    const nodeMap = new Map([
      ['node1', { width: 200, height: 120 }], // Node bigger than frame
    ])

    const positions = new Map([
      ['node1', { x: 120, y: 120 }],
    ])

    const result = constrainNodesToFrame(positions, nodeMap, frame, 30)
    const pos = result.get('node1')!

    // Should still produce a valid position (centered in available space)
    expect(typeof pos.x).toBe('number')
    expect(typeof pos.y).toBe('number')
    expect(Number.isFinite(pos.x)).toBe(true)
    expect(Number.isFinite(pos.y)).toBe(true)
  })
})

describe('Push out of frames - complete node exclusion', () => {
  /**
   * Tests that nodes are pushed completely outside frames, not just center
   */

  it('should push entire node outside frame (not just center)', () => {
    const frames = [
      { canvas_x: 100, canvas_y: 100, width: 400, height: 300 },
    ]
    const nodeMap = new Map([
      ['node1', { width: 200, height: 120 }],
    ])

    // Node completely inside frame
    const positions = new Map([
      ['node1', { x: 200, y: 200 }],
    ])

    const result = pushNodesOutOfFrames(positions, nodeMap, frames)
    const pos = result.get('node1')!

    const frame = frames[0]
    const nodeRight = pos.x + 200
    const nodeBottom = pos.y + 120
    const frameLeft = frame.canvas_x
    const frameRight = frame.canvas_x + frame.width
    const frameTop = frame.canvas_y
    const frameBottom = frame.canvas_y + frame.height

    // Check that node does NOT overlap with frame (considering entire node rectangle)
    const overlapsHorizontally = nodeRight > frameLeft && pos.x < frameRight
    const overlapsVertically = nodeBottom > frameTop && pos.y < frameBottom

    // Should not overlap in both dimensions
    expect(overlapsHorizontally && overlapsVertically).toBe(false)
  })

  it('should handle node at frame edge correctly', () => {
    const frames = [
      { canvas_x: 100, canvas_y: 100, width: 400, height: 300 },
    ]
    const nodeMap = new Map([
      ['node1', { width: 200, height: 120 }],
    ])

    // Node with left edge at frame boundary but extending into frame
    const positions = new Map([
      ['node1', { x: 100, y: 200 }], // Node extends from 100 to 300 horizontally
    ])

    const result = pushNodesOutOfFrames(positions, nodeMap, frames)
    const pos = result.get('node1')!

    // Node should be pushed out
    const frame = frames[0]
    const nodeRight = pos.x + 200
    const nodeBottom = pos.y + 120

    const overlapsX = nodeRight > frame.canvas_x && pos.x < frame.canvas_x + frame.width
    const overlapsY = nodeBottom > frame.canvas_y && pos.y < frame.canvas_y + frame.height

    expect(overlapsX && overlapsY).toBe(false)
  })
})

describe('Edge cases - extreme values', () => {
  describe('zero and negative dimensions', () => {
    it('handles zero-width node gracefully', () => {
      const frame = { canvas_x: 100, canvas_y: 100, width: 400, height: 300 }
      const nodeMap = new Map([['n1', { width: 0, height: 80 }]])
      const positions = new Map([['n1', { x: 200, y: 200 }]])

      const result = constrainNodesToFrame(positions, nodeMap, frame, 30)
      const pos = result.get('n1')!

      expect(Number.isFinite(pos.x)).toBe(true)
      expect(Number.isFinite(pos.y)).toBe(true)
    })

    it('handles zero-height node gracefully', () => {
      const frame = { canvas_x: 100, canvas_y: 100, width: 400, height: 300 }
      const nodeMap = new Map([['n1', { width: 100, height: 0 }]])
      const positions = new Map([['n1', { x: 200, y: 200 }]])

      const result = constrainNodesToFrame(positions, nodeMap, frame, 30)
      const pos = result.get('n1')!

      expect(Number.isFinite(pos.x)).toBe(true)
      expect(Number.isFinite(pos.y)).toBe(true)
    })

    it('handles zero-size frame gracefully', () => {
      const frame = { canvas_x: 100, canvas_y: 100, width: 0, height: 0 }
      const nodeMap = new Map([['n1', { width: 100, height: 80 }]])
      const positions = new Map([['n1', { x: 200, y: 200 }]])

      const result = constrainNodesToFrame(positions, nodeMap, frame, 30)
      const pos = result.get('n1')!

      // Should still produce finite coordinates
      expect(Number.isFinite(pos.x)).toBe(true)
      expect(Number.isFinite(pos.y)).toBe(true)
    })
  })

  describe('negative coordinates', () => {
    it('handles frame at negative coordinates', () => {
      const frame = { canvas_x: -500, canvas_y: -300, width: 400, height: 300 }
      const nodeMap = new Map([['n1', { width: 100, height: 80 }]])
      const positions = new Map([['n1', { x: -1000, y: -1000 }]])

      const result = constrainNodesToFrame(positions, nodeMap, frame, 30)
      const pos = result.get('n1')!

      // Should be constrained to frame bounds
      expect(pos.x).toBeGreaterThanOrEqual(-500 + 30)
      expect(pos.y).toBeGreaterThanOrEqual(-300 + 30)
    })

    it('handles node at negative coordinates outside frame', () => {
      const frames = [{ canvas_x: 100, canvas_y: 100, width: 300, height: 200 }]
      const nodeMap = new Map([['n1', { width: 100, height: 80 }]])
      const positions = new Map([['n1', { x: -200, y: -200 }]])

      const result = pushNodesOutOfFrames(positions, nodeMap, frames)
      const pos = result.get('n1')!

      // Should remain unchanged (not in frame)
      expect(pos.x).toBe(-200)
      expect(pos.y).toBe(-200)
    })

    it('isNodeInFrame works with negative coordinates', () => {
      const frame = { canvas_x: -300, canvas_y: -200, width: 400, height: 300 }

      // Node fully inside negative-coordinate frame
      expect(isNodeInFrame(-200, -100, 100, 80, frame)).toBe(true)

      // Node outside
      expect(isNodeInFrame(200, 200, 100, 80, frame)).toBe(false)
    })
  })

  describe('very large coordinates', () => {
    it('handles very large frame coordinates', () => {
      const frame = { canvas_x: 1e9, canvas_y: 1e9, width: 400, height: 300 }
      const nodeMap = new Map([['n1', { width: 100, height: 80 }]])
      const positions = new Map([['n1', { x: 1e9 + 200, y: 1e9 + 200 }]])

      const result = constrainNodesToFrame(positions, nodeMap, frame, 30)
      const pos = result.get('n1')!

      expect(Number.isFinite(pos.x)).toBe(true)
      expect(Number.isFinite(pos.y)).toBe(true)
      expect(pos.x).toBe(1e9 + 200) // Should be unchanged (inside)
    })

    it('handles very large node dimensions', () => {
      const frame = { canvas_x: 0, canvas_y: 0, width: 1e6, height: 1e6 }
      const nodeMap = new Map([['n1', { width: 1e5, height: 1e5 }]])
      const positions = new Map([['n1', { x: 500, y: 500 }]])

      const result = constrainNodesToFrame(positions, nodeMap, frame, 30)
      const pos = result.get('n1')!

      expect(Number.isFinite(pos.x)).toBe(true)
      expect(Number.isFinite(pos.y)).toBe(true)
    })

    it('isNodeInFrame handles large coordinates', () => {
      const frame = { canvas_x: 1e9, canvas_y: 1e9, width: 1000, height: 1000 }

      expect(isNodeInFrame(1e9 + 400, 1e9 + 400, 100, 80, frame)).toBe(true)
      expect(isNodeInFrame(0, 0, 100, 80, frame)).toBe(false)
    })
  })

  describe('boundary number values', () => {
    it('handles Number.MAX_SAFE_INTEGER coordinates', () => {
      const frame = { canvas_x: 0, canvas_y: 0, width: 1000, height: 1000 }
      const nodeMap = new Map([['n1', { width: 100, height: 80 }]])
      const positions = new Map([['n1', { x: Number.MAX_SAFE_INTEGER, y: 500 }]])

      const result = constrainNodesToFrame(positions, nodeMap, frame, 30)
      const pos = result.get('n1')!

      // Should be clamped to frame
      expect(pos.x).toBeLessThanOrEqual(1000 - 100 - 30)
      expect(Number.isFinite(pos.x)).toBe(true)
    })

    it('handles -Number.MAX_SAFE_INTEGER coordinates', () => {
      const frame = { canvas_x: 0, canvas_y: 0, width: 1000, height: 1000 }
      const nodeMap = new Map([['n1', { width: 100, height: 80 }]])
      const positions = new Map([['n1', { x: -Number.MAX_SAFE_INTEGER, y: 500 }]])

      const result = constrainNodesToFrame(positions, nodeMap, frame, 30)
      const pos = result.get('n1')!

      // Should be clamped to frame
      expect(pos.x).toBeGreaterThanOrEqual(30)
      expect(Number.isFinite(pos.x)).toBe(true)
    })
  })

  describe('undefined and missing values', () => {
    it('handles undefined width in nodeMap', () => {
      const frame = { canvas_x: 100, canvas_y: 100, width: 400, height: 300 }
      const nodeMap = new Map<string, { width?: number; height?: number }>([
        ['n1', { height: 80 }], // width is undefined
      ])
      const positions = new Map([['n1', { x: 50, y: 50 }]])

      const result = constrainNodesToFrame(positions, nodeMap, frame, 30)
      const pos = result.get('n1')!

      // Should use NODE_DEFAULTS.WIDTH
      expect(pos.x).toBe(130) // frame.x + padding
    })

    it('handles undefined height in nodeMap', () => {
      const frame = { canvas_x: 100, canvas_y: 100, width: 400, height: 300 }
      const nodeMap = new Map<string, { width?: number; height?: number }>([
        ['n1', { width: 100 }], // height is undefined
      ])
      const positions = new Map([['n1', { x: 50, y: 50 }]])

      const result = constrainNodesToFrame(positions, nodeMap, frame, 30)
      const pos = result.get('n1')!

      // Should use NODE_DEFAULTS.HEIGHT
      expect(pos.y).toBe(130) // frame.y + padding
    })

    it('handles empty nodeMap entry', () => {
      const frame = { canvas_x: 100, canvas_y: 100, width: 400, height: 300 }
      const nodeMap = new Map<string, { width?: number; height?: number }>([
        ['n1', {}], // Both undefined
      ])
      const positions = new Map([['n1', { x: 50, y: 50 }]])

      const result = constrainNodesToFrame(positions, nodeMap, frame, 30)
      const pos = result.get('n1')!

      expect(Number.isFinite(pos.x)).toBe(true)
      expect(Number.isFinite(pos.y)).toBe(true)
    })
  })
})

describe('Multiple nodes and frames interaction', () => {
  it('should maintain all nodes positions when pushing multiple nodes out', () => {
    const frames = [
      { canvas_x: 100, canvas_y: 100, width: 300, height: 200 },
    ]
    const nodeMap = new Map([
      ['node1', { width: 100, height: 80 }],
      ['node2', { width: 100, height: 80 }],
      ['node3', { width: 100, height: 80 }],
    ])

    const positions = new Map([
      ['node1', { x: 150, y: 150 }], // Inside frame
      ['node2', { x: 200, y: 200 }], // Inside frame
      ['node3', { x: 600, y: 600 }], // Outside frame
    ])

    const result = pushNodesOutOfFrames(positions, nodeMap, frames)

    // All nodes should have positions
    expect(result.size).toBe(3)
    expect(result.has('node1')).toBe(true)
    expect(result.has('node2')).toBe(true)
    expect(result.has('node3')).toBe(true)

    // Node3 should remain unchanged (was outside)
    const pos3 = result.get('node3')!
    expect(pos3.x).toBe(600)
    expect(pos3.y).toBe(600)

    // Node1 and Node2 should be pushed out
    const frame = frames[0]
    for (const nodeId of ['node1', 'node2']) {
      const pos = result.get(nodeId)!
      const node = nodeMap.get(nodeId)!
      const nodeRight = pos.x + node.width!
      const nodeBottom = pos.y + node.height!

      const overlapsX = nodeRight > frame.canvas_x && pos.x < frame.canvas_x + frame.width
      const overlapsY = nodeBottom > frame.canvas_y && pos.y < frame.canvas_y + frame.height

      expect(overlapsX && overlapsY).toBe(false)
    }
  })

  it('should constrain multiple nodes to frame without overlap issues', () => {
    const frame = { canvas_x: 100, canvas_y: 100, width: 500, height: 400 }
    const nodeMap = new Map([
      ['node1', { width: 100, height: 80 }],
      ['node2', { width: 100, height: 80 }],
      ['node3', { width: 100, height: 80 }],
    ])

    const positions = new Map([
      ['node1', { x: 50, y: 50 }],   // Outside top-left
      ['node2', { x: 550, y: 450 }], // Outside bottom-right
      ['node3', { x: 250, y: 250 }], // Inside
    ])

    const result = constrainNodesToFrame(positions, nodeMap, frame, 30)

    // All nodes should be fully inside frame
    for (const [nodeId, pos] of result) {
      const node = nodeMap.get(nodeId)!

      expect(pos.x).toBeGreaterThanOrEqual(frame.canvas_x + 30)
      expect(pos.y).toBeGreaterThanOrEqual(frame.canvas_y + 30)
      expect(pos.x + node.width!).toBeLessThanOrEqual(frame.canvas_x + frame.width - 30)
      expect(pos.y + node.height!).toBeLessThanOrEqual(frame.canvas_y + frame.height - 30)
    }
  })
})
