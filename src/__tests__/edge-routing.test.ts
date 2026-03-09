import { describe, it, expect } from 'vitest'
import {
  segmentIntersectsNode,
  findObstacles,
  findObstaclesInRegion,
  getObstacleBounds,
  OBSTACLE_MARGIN,
} from '../canvas/routing/obstacleAvoider'
import { routeDiagonal, validateDiagonalPath } from '../canvas/routing/diagonalRouter'
import { routeOrthogonal, validateOrthogonalPath } from '../canvas/routing/orthogonalRouter'
import { GridTracker } from '../canvas/routing/gridTracker'
import type { NodeRect } from '../canvas/routing/types'

describe('Obstacle Detection', () => {
  const createNode = (x: number, y: number, w: number, h: number, id = 'node1'): NodeRect => ({
    id,
    canvas_x: x,
    canvas_y: y,
    width: w,
    height: h,
  })

  describe('segmentIntersectsNode', () => {
    it('detects horizontal segment passing through node', () => {
      const node = createNode(100, 100, 200, 150)
      // Horizontal line passing through the node
      expect(segmentIntersectsNode(0, 150, 400, 150, node)).toBe(true)
    })

    it('detects vertical segment passing through node', () => {
      const node = createNode(100, 100, 200, 150)
      // Vertical line passing through the node
      expect(segmentIntersectsNode(200, 0, 200, 400, node)).toBe(true)
    })

    it('detects diagonal segment passing through node', () => {
      const node = createNode(100, 100, 200, 150)
      // Diagonal line from top-left to bottom-right passing through node
      expect(segmentIntersectsNode(0, 0, 400, 400, node)).toBe(true)
    })

    it('returns false for segment completely above node', () => {
      const node = createNode(100, 100, 200, 150)
      // Line above the node (accounting for margin)
      expect(segmentIntersectsNode(0, 50, 400, 50, node)).toBe(false)
    })

    it('returns false for segment completely below node', () => {
      const node = createNode(100, 100, 200, 150)
      // Line below the node (accounting for margin)
      expect(segmentIntersectsNode(0, 300, 400, 300, node)).toBe(false)
    })

    it('returns false for segment completely left of node', () => {
      const node = createNode(100, 100, 200, 150)
      // Line to the left of node (accounting for margin)
      expect(segmentIntersectsNode(50, 0, 50, 400, node)).toBe(false)
    })

    it('returns false for segment completely right of node', () => {
      const node = createNode(100, 100, 200, 150)
      // Line to the right of node (accounting for margin)
      expect(segmentIntersectsNode(350, 0, 350, 400, node)).toBe(false)
    })

    it('detects segment touching node edge', () => {
      const node = createNode(100, 100, 200, 150)
      // Segment just touching the left edge of node
      expect(segmentIntersectsNode(100, 150, 100, 200, node)).toBe(true)
    })

    it('respects margin parameter', () => {
      const node = createNode(100, 100, 200, 150)
      // Line that would be outside node but within margin
      const margin = 30
      expect(segmentIntersectsNode(70, 150, 70, 200, node, margin)).toBe(true)
      expect(segmentIntersectsNode(60, 150, 60, 200, node, margin)).toBe(false)
    })
  })

  describe('findObstacles', () => {
    it('finds all nodes that intersect a segment', () => {
      const nodes: NodeRect[] = [
        createNode(100, 100, 100, 100, 'a'),
        createNode(300, 100, 100, 100, 'b'),
        createNode(500, 100, 100, 100, 'c'),
      ]
      const excludeIds = new Set<string>()

      // Horizontal line at y=150 should hit all three
      const obstacles = findObstacles(0, 150, 600, 150, nodes, excludeIds)
      expect(obstacles.length).toBe(3)
    })

    it('excludes specified node IDs', () => {
      const nodes: NodeRect[] = [
        createNode(100, 100, 100, 100, 'a'),
        createNode(300, 100, 100, 100, 'b'),
        createNode(500, 100, 100, 100, 'c'),
      ]
      const excludeIds = new Set(['a', 'c'])

      const obstacles = findObstacles(0, 150, 600, 150, nodes, excludeIds)
      expect(obstacles.length).toBe(1)
      expect(obstacles[0].id).toBe('b')
    })

    it('returns empty array when no obstacles', () => {
      const nodes: NodeRect[] = [
        createNode(100, 100, 100, 100, 'a'),
      ]
      const excludeIds = new Set<string>()

      // Line above the node
      const obstacles = findObstacles(0, 50, 600, 50, nodes, excludeIds)
      expect(obstacles.length).toBe(0)
    })
  })

  describe('findObstaclesInRegion', () => {
    it('finds nodes within bounding region', () => {
      const nodes: NodeRect[] = [
        createNode(50, 50, 50, 50, 'inside'),
        createNode(200, 200, 50, 50, 'outside'),
      ]
      const excludeIds = new Set<string>()

      const obstacles = findObstaclesInRegion(0, 0, 150, 150, nodes, excludeIds)
      expect(obstacles.length).toBe(1)
      expect(obstacles[0].id).toBe('inside')
    })
  })

  describe('getObstacleBounds', () => {
    it('calculates bounding box of multiple obstacles', () => {
      const obstacles: NodeRect[] = [
        createNode(100, 100, 50, 50),
        createNode(200, 200, 100, 100),
      ]

      const bounds = getObstacleBounds(obstacles, 10)
      expect(bounds.minX).toBe(90)  // 100 - 10
      expect(bounds.minY).toBe(90)  // 100 - 10
      expect(bounds.maxX).toBe(310) // 200 + 100 + 10
      expect(bounds.maxY).toBe(310) // 200 + 100 + 10
    })
  })
})

describe('Diagonal Routing', () => {
  it('creates valid 45/90 degree paths', () => {
    const gridTracker = new GridTracker(20)
    const nodes: NodeRect[] = []
    const excludeIds = new Set<string>()

    const result = routeDiagonal({
      startPort: { x: 100, y: 100 },
      startStandoff: { x: 120, y: 100 },
      endPort: { x: 300, y: 200 },
      endStandoff: { x: 280, y: 200 },
      sourceSide: 'right',
      targetSide: 'left',
      nodes,
      excludeIds,
      gridTracker,
    })

    expect(result.svgPath).toBeTruthy()
    expect(result.path.length).toBeGreaterThan(2)
    expect(validateDiagonalPath(result.path)).toBe(true)
  })

  it('routes around obstacles', () => {
    const gridTracker = new GridTracker(20)
    const nodes: NodeRect[] = [
      { id: 'obstacle', canvas_x: 180, canvas_y: 120, width: 80, height: 80 },
    ]
    const excludeIds = new Set(['source', 'target'])

    const result = routeDiagonal({
      startPort: { x: 100, y: 150 },
      startStandoff: { x: 120, y: 150 },
      endPort: { x: 300, y: 150 },
      endStandoff: { x: 280, y: 150 },
      sourceSide: 'right',
      targetSide: 'left',
      nodes,
      excludeIds,
      gridTracker,
    })

    expect(result.svgPath).toBeTruthy()
    // The path should have more segments due to detour
    expect(result.path.length).toBeGreaterThanOrEqual(4)
  })
})

describe('Orthogonal Routing', () => {
  it('creates valid 90 degree paths', () => {
    const gridTracker = new GridTracker(20)
    const nodes: NodeRect[] = []
    const excludeIds = new Set<string>()

    const result = routeOrthogonal({
      startPort: { x: 100, y: 100 },
      startStandoff: { x: 120, y: 100 },
      endPort: { x: 300, y: 200 },
      endStandoff: { x: 280, y: 200 },
      sourceSide: 'right',
      targetSide: 'left',
      nodes,
      excludeIds,
      gridTracker,
    })

    expect(result.svgPath).toBeTruthy()
    expect(result.path.length).toBeGreaterThan(2)
    expect(validateOrthogonalPath(result.path)).toBe(true)
  })

  it('routes around obstacles', () => {
    const gridTracker = new GridTracker(20)
    const nodes: NodeRect[] = [
      { id: 'obstacle', canvas_x: 180, canvas_y: 80, width: 80, height: 140 },
    ]
    const excludeIds = new Set(['source', 'target'])

    const result = routeOrthogonal({
      startPort: { x: 100, y: 150 },
      startStandoff: { x: 120, y: 150 },
      endPort: { x: 300, y: 150 },
      endStandoff: { x: 280, y: 150 },
      sourceSide: 'right',
      targetSide: 'left',
      nodes,
      excludeIds,
      gridTracker,
    })

    expect(result.svgPath).toBeTruthy()
    // Should have taken a detour
    expect(result.usedDetour || result.path.length >= 4).toBe(true)
  })
})

describe('GridTracker', () => {
  it('tracks occupied grid cells', () => {
    const tracker = new GridTracker(20)

    // Mark a horizontal segment
    tracker.mark(0, 0, 100, 0)

    // Same segment should not be placeable
    expect(tracker.canPlace(0, 0, 100, 0)).toBe(false)

    // Different segment should be placeable
    expect(tracker.canPlace(0, 50, 100, 50)).toBe(true)
  })

  it('snaps coordinates to grid', () => {
    const tracker = new GridTracker(20)

    expect(tracker.snap(15)).toBe(20)
    expect(tracker.snap(25)).toBe(20)
    expect(tracker.snap(35)).toBe(40)
  })

  it('resets tracked segments', () => {
    const tracker = new GridTracker(20)

    tracker.mark(0, 0, 100, 0)
    expect(tracker.canPlace(0, 0, 100, 0)).toBe(false)

    tracker.reset()
    expect(tracker.canPlace(0, 0, 100, 0)).toBe(true)
  })
})

describe('Path Validation', () => {
  it('validateDiagonalPath accepts valid 45/90 degree paths', () => {
    // Pure horizontal
    expect(validateDiagonalPath([{ x: 0, y: 0 }, { x: 100, y: 0 }])).toBe(true)

    // Pure vertical
    expect(validateDiagonalPath([{ x: 0, y: 0 }, { x: 0, y: 100 }])).toBe(true)

    // 45 degree diagonal
    expect(validateDiagonalPath([{ x: 0, y: 0 }, { x: 100, y: 100 }])).toBe(true)

    // Mixed path with valid angles
    expect(validateDiagonalPath([
      { x: 0, y: 0 },
      { x: 50, y: 0 },   // horizontal
      { x: 100, y: 50 }, // 45 degree
      { x: 100, y: 100 }, // vertical
    ])).toBe(true)
  })

  it('validateDiagonalPath rejects invalid angles', () => {
    // 30 degree angle (not allowed)
    expect(validateDiagonalPath([{ x: 0, y: 0 }, { x: 100, y: 58 }])).toBe(false)

    // 60 degree angle (not allowed)
    expect(validateDiagonalPath([{ x: 0, y: 0 }, { x: 58, y: 100 }])).toBe(false)
  })

  it('validateOrthogonalPath accepts only 90 degree paths', () => {
    // Horizontal + vertical
    expect(validateOrthogonalPath([
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
    ])).toBe(true)
  })

  it('validateOrthogonalPath rejects diagonal segments', () => {
    expect(validateOrthogonalPath([
      { x: 0, y: 0 },
      { x: 100, y: 100 }, // diagonal - invalid
    ])).toBe(false)
  })
})
