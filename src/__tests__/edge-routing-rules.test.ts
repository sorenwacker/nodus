import { describe, it, expect, beforeEach } from 'vitest'
import { GridTracker, DEFAULT_GRID_SIZE } from '../canvas/routing/gridTracker'
import { routeDiagonal, validateDiagonalPath } from '../canvas/routing/diagonalRouter'
import { routeOrthogonal, validateOrthogonalPath } from '../canvas/routing/orthogonalRouter'
import {
  segmentIntersectsNode,
  findObstacles,
  getObstacleBounds,
} from '../canvas/routing/obstacleAvoider'
import { analyzeEdges, assignPorts, calculatePortOffset } from '../canvas/routing/portAssignment'
import type { NodeRect, Point, EdgeDef } from '../canvas/routing/types'

describe('Edge Routing Rules', () => {
  describe('Rule 1: Angle Constraints', () => {
    it('diagonal paths use only 45-degree and 90-degree angles', () => {
      const gridTracker = new GridTracker()
      const nodes: NodeRect[] = []
      const excludeIds = new Set<string>()

      const result = routeDiagonal({
        startPort: { x: 100, y: 100 },
        startStandoff: { x: 120, y: 100 },
        endPort: { x: 300, y: 250 },
        endStandoff: { x: 280, y: 250 },
        sourceSide: 'right',
        targetSide: 'left',
        nodes,
        excludeIds,
        gridTracker,
      })

      expect(validateDiagonalPath(result.path)).toBe(true)
    })

    it('orthogonal paths use only 90-degree angles', () => {
      const gridTracker = new GridTracker()
      const nodes: NodeRect[] = []
      const excludeIds = new Set<string>()

      const result = routeOrthogonal({
        startPort: { x: 100, y: 100 },
        startStandoff: { x: 120, y: 100 },
        endPort: { x: 300, y: 250 },
        endStandoff: { x: 280, y: 250 },
        sourceSide: 'right',
        targetSide: 'left',
        nodes,
        excludeIds,
        gridTracker,
      })

      expect(validateOrthogonalPath(result.path)).toBe(true)
    })

    it('rejects paths with invalid angles', () => {
      // A path with a 30-degree angle
      const invalidPath: Point[] = [
        { x: 0, y: 0 },
        { x: 100, y: 50 }, // ~26.6 degrees - invalid
        { x: 200, y: 50 },
      ]

      expect(validateDiagonalPath(invalidPath)).toBe(false)
      expect(validateOrthogonalPath(invalidPath)).toBe(false)
    })

    it('accepts paths with exact 45-degree diagonals', () => {
      const validPath: Point[] = [
        { x: 0, y: 0 },
        { x: 50, y: 0 },
        { x: 100, y: 50 }, // 45 degrees
        { x: 150, y: 50 },
      ]

      expect(validateDiagonalPath(validPath)).toBe(true)
    })
  })

  describe('Rule 2: No Overlapping Edges', () => {
    let gridTracker: GridTracker

    beforeEach(() => {
      gridTracker = new GridTracker()
    })

    it('tracks horizontal segments', () => {
      // Mark a horizontal segment
      gridTracker.mark(0, 100, 200, 100)

      // Same segment should be blocked
      expect(gridTracker.canPlace(50, 100, 150, 100)).toBe(false)

      // Different Y should be free
      expect(gridTracker.canPlace(50, 120, 150, 120)).toBe(true)
    })

    it('tracks vertical segments', () => {
      // Mark a vertical segment
      gridTracker.mark(100, 0, 100, 200)

      // Same segment should be blocked
      expect(gridTracker.canPlace(100, 50, 100, 150)).toBe(false)

      // Different X should be free
      expect(gridTracker.canPlace(120, 50, 120, 150)).toBe(true)
    })

    it('tracks diagonal segments', () => {
      // Mark a diagonal segment (d+)
      gridTracker.markDiagonal(0, 0, 100, 100)

      // Same diagonal should be blocked
      expect(gridTracker.canPlaceDiagonal(20, 20, 80, 80)).toBe(false)

      // Opposite diagonal (d-) should be free
      expect(gridTracker.canPlaceDiagonal(0, 100, 100, 0)).toBe(true)
    })

    it('finds free channel when ideal is occupied', () => {
      // Occupy the ideal channel
      gridTracker.mark(0, 100, 200, 100)

      // Find a free channel
      const freeChannel = gridTracker.findFreeChannel(100, true, 0, 200)

      // Should not be the occupied channel
      expect(freeChannel).not.toBe(100)
      // Should be a grid-aligned value
      expect(freeChannel % DEFAULT_GRID_SIZE).toBe(0)
    })
  })

  describe('Rule 3: Unique Entry Points', () => {
    it('diagonal routes from spread ports produce different paths', () => {
      const nodes: NodeRect[] = []
      const excludeIds = new Set<string>()
      const gridTracker = new GridTracker()

      // Route first edge from port at y=100
      const result1 = routeDiagonal({
        startPort: { x: 200, y: 100 },
        startStandoff: { x: 220, y: 100 },
        endPort: { x: 400, y: 200 },
        endStandoff: { x: 380, y: 200 },
        sourceSide: 'right',
        targetSide: 'left',
        nodes,
        excludeIds,
        gridTracker,
      })

      // Route second edge from spread port at y=120 (simulates port spreading)
      const result2 = routeDiagonal({
        startPort: { x: 200, y: 120 },
        startStandoff: { x: 220, y: 120 },
        endPort: { x: 400, y: 220 },
        endStandoff: { x: 380, y: 220 },
        sourceSide: 'right',
        targetSide: 'left',
        nodes,
        excludeIds,
        gridTracker,
      })

      // Paths should be different due to different port positions
      expect(result1.svgPath).not.toBe(result2.svgPath)

      // Both paths should be valid
      expect(validateDiagonalPath(result1.path)).toBe(true)
      expect(validateDiagonalPath(result2.path)).toBe(true)
    })

    it('parallel edges on same channel get offset', () => {
      const gridTracker = new GridTracker()

      // Mark a horizontal segment
      gridTracker.mark(100, 150, 300, 150)

      // Try to place overlapping segment - should fail
      expect(gridTracker.canPlace(150, 150, 250, 150)).toBe(false)

      // Place at different Y - should succeed
      expect(gridTracker.canPlace(150, 170, 250, 170)).toBe(true)
    })

    it('diagonal segments on same channel get offset', () => {
      const gridTracker = new GridTracker()

      // Mark a diagonal segment (going down-right)
      gridTracker.markDiagonal(100, 100, 200, 200)

      // Try to place overlapping diagonal - should fail
      expect(gridTracker.canPlaceDiagonal(120, 120, 180, 180)).toBe(false)

      // Place parallel diagonal (shifted) - should succeed
      expect(gridTracker.canPlaceDiagonal(100, 140, 160, 200)).toBe(true)
    })
  })

  describe('Rule 4: Obstacle Avoidance', () => {
    it('detects segment intersection with node', () => {
      const node: NodeRect = {
        id: 'obstacle',
        canvas_x: 150,
        canvas_y: 50,
        width: 100,
        height: 100,
      }

      // Segment that passes through node (no margin needed - clearly intersects)
      expect(segmentIntersectsNode(100, 100, 300, 100, node, 0)).toBe(true)

      // Segment that passes above node (use margin=0 for precise test)
      expect(segmentIntersectsNode(100, 10, 300, 10, node, 0)).toBe(false)

      // Segment that passes below node (use margin=0 for precise test)
      expect(segmentIntersectsNode(100, 200, 300, 200, node, 0)).toBe(false)
    })

    it('finds all obstacles in path', () => {
      const nodes: NodeRect[] = [
        { id: 'obs1', canvas_x: 150, canvas_y: 50, width: 50, height: 50 },
        { id: 'obs2', canvas_x: 250, canvas_y: 50, width: 50, height: 50 },
        { id: 'obs3', canvas_x: 150, canvas_y: 200, width: 50, height: 50 },
      ]
      const excludeIds = new Set<string>()

      // Horizontal line at y=75 should hit obs1 and obs2
      const obstacles = findObstacles(100, 75, 350, 75, nodes, excludeIds)
      expect(obstacles.length).toBe(2)
      expect(obstacles.map(o => o.id)).toContain('obs1')
      expect(obstacles.map(o => o.id)).toContain('obs2')
    })

    it('excludes source and target nodes from obstacle detection', () => {
      const nodes: NodeRect[] = [
        { id: 'source', canvas_x: 0, canvas_y: 50, width: 100, height: 100 },
        { id: 'obstacle', canvas_x: 150, canvas_y: 50, width: 100, height: 100 },
        { id: 'target', canvas_x: 300, canvas_y: 50, width: 100, height: 100 },
      ]
      const excludeIds = new Set(['source', 'target'])

      const obstacles = findObstacles(50, 100, 350, 100, nodes, excludeIds)
      expect(obstacles.length).toBe(1)
      expect(obstacles[0].id).toBe('obstacle')
    })

    it('routes around obstacles', () => {
      const gridTracker = new GridTracker()
      const obstacle: NodeRect = {
        id: 'obstacle',
        canvas_x: 180,
        canvas_y: 80,
        width: 100,
        height: 100,
      }
      const nodes: NodeRect[] = [obstacle]
      const excludeIds = new Set<string>()

      const result = routeDiagonal({
        startPort: { x: 100, y: 100 },
        startStandoff: { x: 120, y: 100 },
        endPort: { x: 350, y: 150 },
        endStandoff: { x: 330, y: 150 },
        sourceSide: 'right',
        targetSide: 'left',
        nodes,
        excludeIds,
        gridTracker,
      })

      // Should use detour (more than 6 points means it went around)
      expect(result.usedDetour || result.path.length > 6).toBe(true)
    })
  })

  describe('Rule 5: Minimize Crossings (via sorting)', () => {
    it('calculates obstacle bounds correctly', () => {
      const obstacles: NodeRect[] = [
        { id: 'a', canvas_x: 100, canvas_y: 100, width: 50, height: 50 },
        { id: 'b', canvas_x: 200, canvas_y: 200, width: 80, height: 60 },
      ]

      const bounds = getObstacleBounds(obstacles, 10)

      expect(bounds.minX).toBe(90) // 100 - 10
      expect(bounds.minY).toBe(90) // 100 - 10
      expect(bounds.maxX).toBe(290) // 200 + 80 + 10
      expect(bounds.maxY).toBe(270) // 200 + 60 + 10
    })
  })

  describe('Rule 6: Minimal Turns', () => {
    it('diagonal path has expected number of segments', () => {
      const gridTracker = new GridTracker()
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

      // Standard diagonal path: port -> standoff -> p1 -> p2 -> standoff -> port
      // = 6 points = 5 segments
      expect(result.path.length).toBeLessThanOrEqual(6)
    })

    it('orthogonal path has expected number of segments', () => {
      const gridTracker = new GridTracker()
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

      // Standard orthogonal path: port -> standoff -> mid1 -> mid2 -> standoff -> port
      // = 6 points = 5 segments
      expect(result.path.length).toBeLessThanOrEqual(6)
    })
  })

  describe('Rule 7: Orthogonal Exit', () => {
    it('paths start with orthogonal segment from port to standoff', () => {
      const gridTracker = new GridTracker()
      const nodes: NodeRect[] = []
      const excludeIds = new Set<string>()

      const result = routeDiagonal({
        startPort: { x: 200, y: 150 },
        startStandoff: { x: 220, y: 150 }, // 20px to the right (orthogonal)
        endPort: { x: 400, y: 250 },
        endStandoff: { x: 380, y: 250 },
        sourceSide: 'right',
        targetSide: 'left',
        nodes,
        excludeIds,
        gridTracker,
      })

      // First segment should be horizontal (port to standoff on right side)
      const p0 = result.path[0]
      const p1 = result.path[1]
      expect(p0.y).toBe(p1.y) // Same Y = horizontal
      expect(p1.x - p0.x).toBe(20) // 20px standoff
    })

    it('paths end with orthogonal segment from standoff to port', () => {
      const gridTracker = new GridTracker()
      const nodes: NodeRect[] = []
      const excludeIds = new Set<string>()

      const result = routeDiagonal({
        startPort: { x: 200, y: 150 },
        startStandoff: { x: 220, y: 150 },
        endPort: { x: 400, y: 250 },
        endStandoff: { x: 380, y: 250 }, // 20px to the left (orthogonal)
        sourceSide: 'right',
        targetSide: 'left',
        nodes,
        excludeIds,
        gridTracker,
      })

      // Last segment should be horizontal (standoff to port on left side)
      const pLast = result.path[result.path.length - 1]
      const pPrev = result.path[result.path.length - 2]
      expect(pLast.y).toBe(pPrev.y) // Same Y = horizontal
    })
  })

  describe('GridTracker', () => {
    it('snaps values to grid', () => {
      const tracker = new GridTracker(20)

      expect(tracker.snap(0)).toBe(0)
      expect(tracker.snap(10)).toBe(20) // rounds up
      expect(tracker.snap(15)).toBe(20)
      expect(tracker.snap(25)).toBe(20) // rounds down
      expect(tracker.snap(35)).toBe(40)
    })

    it('resets grid state', () => {
      const tracker = new GridTracker()

      tracker.mark(0, 0, 100, 0)
      expect(tracker.canPlace(0, 0, 100, 0)).toBe(false)

      tracker.reset()
      expect(tracker.canPlace(0, 0, 100, 0)).toBe(true)
    })

    it('tracks used count', () => {
      const tracker = new GridTracker(20)

      expect(tracker.getUsedCount()).toBe(0)

      tracker.mark(0, 0, 40, 0) // horizontal: 3 points (0, 20, 40)
      expect(tracker.getUsedCount()).toBe(3)

      tracker.mark(0, 0, 0, 40) // vertical: 3 points (0, 20, 40)
      expect(tracker.getUsedCount()).toBe(6) // Total: 6 direction slots
    })
  })

  describe('Multiple Edges Between Same Nodes', () => {
    it('routes multiple edges between same node pair with unique paths', () => {
      const gridTracker = new GridTracker()
      const nodes: NodeRect[] = []
      const excludeIds = new Set<string>()

      // Simulate 3 edges with spread ports (20px apart)
      const edges = [
        { startY: 130, endY: 130 },
        { startY: 150, endY: 150 },
        { startY: 170, endY: 170 },
      ]

      const results: string[] = []

      for (const { startY, endY } of edges) {
        const result = routeDiagonal({
          startPort: { x: 200, y: startY },
          startStandoff: { x: 220, y: startY },
          endPort: { x: 400, y: endY },
          endStandoff: { x: 380, y: endY },
          sourceSide: 'right',
          targetSide: 'left',
          nodes,
          excludeIds,
          gridTracker,
        })

        results.push(result.svgPath)
      }

      // All paths should be different
      expect(results[0]).not.toBe(results[1])
      expect(results[1]).not.toBe(results[2])
      expect(results[0]).not.toBe(results[2])
    })

    it('routes multiple orthogonal edges with unique paths', () => {
      const gridTracker = new GridTracker()
      const nodes: NodeRect[] = []
      const excludeIds = new Set<string>()

      // Simulate 3 edges with spread ports (20px apart)
      const edges = [
        { startY: 130, endY: 130 },
        { startY: 150, endY: 150 },
        { startY: 170, endY: 170 },
      ]

      const results: string[] = []

      for (const { startY, endY } of edges) {
        const result = routeOrthogonal({
          startPort: { x: 200, y: startY },
          startStandoff: { x: 220, y: startY },
          endPort: { x: 400, y: endY },
          endStandoff: { x: 380, y: endY },
          sourceSide: 'right',
          targetSide: 'left',
          nodes,
          excludeIds,
          gridTracker,
        })

        results.push(result.svgPath)
      }

      // All paths should be different
      expect(results[0]).not.toBe(results[1])
      expect(results[1]).not.toBe(results[2])
      expect(results[0]).not.toBe(results[2])
    })
  })

  describe('Smart Port Assignment', () => {
    it('assigns ports to minimize crossings on right side', () => {
      // Source node on the left, three targets at different Y positions on the right
      const sourceNode: NodeRect = {
        id: 'source',
        canvas_x: 0,
        canvas_y: 100,
        width: 200,
        height: 100,
      }

      const targetAbove: NodeRect = {
        id: 'target-above',
        canvas_x: 400,
        canvas_y: 0, // Above source
        width: 200,
        height: 100,
      }

      const targetMiddle: NodeRect = {
        id: 'target-middle',
        canvas_x: 400,
        canvas_y: 100, // Same level as source
        width: 200,
        height: 100,
      }

      const targetBelow: NodeRect = {
        id: 'target-below',
        canvas_x: 400,
        canvas_y: 200, // Below source
        width: 200,
        height: 100,
      }

      const nodeMap = new Map<string, NodeRect>([
        ['source', sourceNode],
        ['target-above', targetAbove],
        ['target-middle', targetMiddle],
        ['target-below', targetBelow],
      ])

      // Create edges in random order (not sorted by target position)
      const edges: EdgeDef[] = [
        { id: 'edge-below', source_node_id: 'source', target_node_id: 'target-below' },
        { id: 'edge-above', source_node_id: 'source', target_node_id: 'target-above' },
        { id: 'edge-middle', source_node_id: 'source', target_node_id: 'target-middle' },
      ]

      const edgeInfos = analyzeEdges(edges, nodeMap)
      const { sourceAssignments } = assignPorts(edgeInfos)

      // Get port indices for each edge
      const aboveIdx = sourceAssignments.get('edge-above')!.index
      const middleIdx = sourceAssignments.get('edge-middle')!.index
      const belowIdx = sourceAssignments.get('edge-below')!.index

      // Ports should be ordered: above (top) < middle < below (bottom)
      // This minimizes crossings because edges going up use top ports
      expect(aboveIdx).toBeLessThan(middleIdx)
      expect(middleIdx).toBeLessThan(belowIdx)
    })

    it('assigns ports to minimize crossings on left side', () => {
      // Source node on the right, three targets at different Y positions on the left
      const sourceNode: NodeRect = {
        id: 'source',
        canvas_x: 400,
        canvas_y: 100,
        width: 200,
        height: 100,
      }

      const targetAbove: NodeRect = {
        id: 'target-above',
        canvas_x: 0,
        canvas_y: 0,
        width: 200,
        height: 100,
      }

      const targetBelow: NodeRect = {
        id: 'target-below',
        canvas_x: 0,
        canvas_y: 200,
        width: 200,
        height: 100,
      }

      const nodeMap = new Map<string, NodeRect>([
        ['source', sourceNode],
        ['target-above', targetAbove],
        ['target-below', targetBelow],
      ])

      const edges: EdgeDef[] = [
        { id: 'edge-below', source_node_id: 'source', target_node_id: 'target-below' },
        { id: 'edge-above', source_node_id: 'source', target_node_id: 'target-above' },
      ]

      const edgeInfos = analyzeEdges(edges, nodeMap)
      const { sourceAssignments } = assignPorts(edgeInfos)

      const aboveIdx = sourceAssignments.get('edge-above')!.index
      const belowIdx = sourceAssignments.get('edge-below')!.index

      // Edge going up should use top port (lower index)
      expect(aboveIdx).toBeLessThan(belowIdx)
    })

    it('calculates port offsets correctly', () => {
      // PORT_SPACING is 25 in the implementation
      // 3 edges: indices 0, 1, 2
      // Offsets should be: -25, 0, +25 (centered around 0)
      expect(calculatePortOffset(0, 3)).toBe(-25)
      expect(calculatePortOffset(1, 3)).toBe(0)
      expect(calculatePortOffset(2, 3)).toBe(25)

      // 2 edges: indices 0, 1
      // Offsets should be: -12.5, +12.5
      expect(calculatePortOffset(0, 2)).toBe(-12.5)
      expect(calculatePortOffset(1, 2)).toBe(12.5)

      // 1 edge: no offset
      expect(calculatePortOffset(0, 1)).toBe(0)
    })

    it('prevents double crossings for multiple edges between same nodes', () => {
      // Two nodes side by side
      const nodeA: NodeRect = {
        id: 'nodeA',
        canvas_x: 0,
        canvas_y: 100,
        width: 200,
        height: 100,
      }

      const nodeB: NodeRect = {
        id: 'nodeB',
        canvas_x: 400,
        canvas_y: 100,
        width: 200,
        height: 100,
      }

      const nodeMap = new Map<string, NodeRect>([
        ['nodeA', nodeA],
        ['nodeB', nodeB],
      ])

      // Three edges between the same two nodes
      const edges: EdgeDef[] = [
        { id: 'edge1', source_node_id: 'nodeA', target_node_id: 'nodeB' },
        { id: 'edge2', source_node_id: 'nodeA', target_node_id: 'nodeB' },
        { id: 'edge3', source_node_id: 'nodeA', target_node_id: 'nodeB' },
      ]

      const edgeInfos = analyzeEdges(edges, nodeMap)
      const { sourceAssignments, targetAssignments } = assignPorts(edgeInfos)

      // Get indices at source and target
      const srcIdx1 = sourceAssignments.get('edge1')!.index
      const srcIdx2 = sourceAssignments.get('edge2')!.index
      const srcIdx3 = sourceAssignments.get('edge3')!.index

      const tgtIdx1 = targetAssignments.get('edge1')!.index
      const tgtIdx2 = targetAssignments.get('edge2')!.index
      const tgtIdx3 = targetAssignments.get('edge3')!.index

      // CRITICAL: The relative ordering must be the same at both ends
      // to prevent double crossings
      // If edge1 < edge2 at source, then edge1 < edge2 at target
      if (srcIdx1 < srcIdx2) {
        expect(tgtIdx1).toBeLessThan(tgtIdx2)
      } else {
        expect(tgtIdx1).toBeGreaterThan(tgtIdx2)
      }

      if (srcIdx2 < srcIdx3) {
        expect(tgtIdx2).toBeLessThan(tgtIdx3)
      } else {
        expect(tgtIdx2).toBeGreaterThan(tgtIdx3)
      }

      if (srcIdx1 < srcIdx3) {
        expect(tgtIdx1).toBeLessThan(tgtIdx3)
      } else {
        expect(tgtIdx1).toBeGreaterThan(tgtIdx3)
      }
    })
  })
})
