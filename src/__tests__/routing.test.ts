/**
 * Tests for edge routing module
 */

import { describe, it, expect, beforeEach } from 'vitest'
import {
  routeAllEdges,
  optimizeNodeEntrypoints,
  clearPortCache,
  getSide,
  getPortPoint,
  calculatePortOffset,
  PORT_SPACING,
  type NodeRect,
  type EdgeDef
} from '../canvas/routing'

describe('routing module', () => {
  describe('getSide', () => {
    const node: NodeRect = { canvas_x: 100, canvas_y: 100, width: 200, height: 120 }

    it('returns right when target is to the right', () => {
      expect(getSide(node, 400, 160)).toBe('right')
    })

    it('returns left when target is to the left', () => {
      expect(getSide(node, 0, 160)).toBe('left')
    })

    it('returns bottom when target is below', () => {
      expect(getSide(node, 200, 400)).toBe('bottom')
    })

    it('returns top when target is above', () => {
      expect(getSide(node, 200, 0)).toBe('top')
    })
  })

  describe('getPortPoint', () => {
    const node: NodeRect = { canvas_x: 100, canvas_y: 100, width: 200, height: 120 }

    it('returns point on right edge at center when offset is 0', () => {
      const point = getPortPoint(node, 'right', 0)
      expect(point.x).toBe(300) // canvas_x + width
      expect(point.y).toBe(160) // canvas_y + height/2
    })

    it('returns point offset from center', () => {
      const point = getPortPoint(node, 'right', 20)
      expect(point.x).toBe(300)
      expect(point.y).toBe(180) // 160 + 20
    })

    it('clamps offset within bounds', () => {
      const point = getPortPoint(node, 'right', 1000) // Way beyond bounds
      expect(point.y).toBeLessThan(220) // Should not exceed node height - corner margin
    })
  })

  describe('calculatePortOffset', () => {
    it('returns 0 for single edge', () => {
      expect(calculatePortOffset(0, 1)).toBe(0)
    })

    it('spreads two edges evenly', () => {
      const offset0 = calculatePortOffset(0, 2)
      const offset1 = calculatePortOffset(1, 2)
      expect(offset0).toBe(-PORT_SPACING / 2)
      expect(offset1).toBe(PORT_SPACING / 2)
    })

    it('spreads three edges evenly', () => {
      const offset0 = calculatePortOffset(0, 3)
      const offset1 = calculatePortOffset(1, 3)
      const offset2 = calculatePortOffset(2, 3)
      expect(offset0).toBe(-PORT_SPACING)
      expect(offset1).toBe(0)
      expect(offset2).toBe(PORT_SPACING)
    })
  })

  describe('routeAllEdges', () => {
    it('routes edges with different entry points when multiple edges enter same side', () => {
      // Central node with three nodes connected from the right
      const nodes: NodeRect[] = [
        { id: 'center', canvas_x: 200, canvas_y: 200, width: 200, height: 120 },
        { id: 'right1', canvas_x: 500, canvas_y: 100, width: 200, height: 120 },
        { id: 'right2', canvas_x: 500, canvas_y: 200, width: 200, height: 120 },
        { id: 'right3', canvas_x: 500, canvas_y: 300, width: 200, height: 120 },
      ]

      const nodeMap = new Map(nodes.map(n => [n.id!, n]))

      const edges: EdgeDef[] = [
        { id: 'e1', source_node_id: 'center', target_node_id: 'right1' },
        { id: 'e2', source_node_id: 'center', target_node_id: 'right2' },
        { id: 'e3', source_node_id: 'center', target_node_id: 'right3' },
      ]

      const result = routeAllEdges(edges, nodes, nodeMap)

      expect(result.size).toBe(3)

      // Extract the first point of each path (source port)
      const e1Path = result.get('e1')!.path
      const e2Path = result.get('e2')!.path
      const e3Path = result.get('e3')!.path

      // All start on the right side of center node (x = 400)
      expect(e1Path[0].x).toBe(400)
      expect(e2Path[0].x).toBe(400)
      expect(e3Path[0].x).toBe(400)

      // But y coordinates should be different (port spreading)
      const yCoords = [e1Path[0].y, e2Path[0].y, e3Path[0].y]
      const uniqueYCoords = new Set(yCoords)
      expect(uniqueYCoords.size).toBe(3) // All three should be different
    })

    it('routes all edges including multiple edges between same node pair', () => {
      const nodes: NodeRect[] = [
        { id: 'a', canvas_x: 0, canvas_y: 0, width: 200, height: 120 },
        { id: 'b', canvas_x: 300, canvas_y: 0, width: 200, height: 120 },
      ]

      const nodeMap = new Map(nodes.map(n => [n.id!, n]))

      const edges: EdgeDef[] = [
        { id: 'e1', source_node_id: 'a', target_node_id: 'b' },
        { id: 'e2', source_node_id: 'a', target_node_id: 'b' }, // Same pair, different edge
        { id: 'e3', source_node_id: 'b', target_node_id: 'a' }, // Reverse direction
      ]

      const result = routeAllEdges(edges, nodes, nodeMap)

      // All edges with unique IDs should be routed (no deduplication by node pair)
      expect(result.size).toBe(3)

      // Each edge should have a unique path due to port spreading
      const paths = [...result.values()].map(r => r.svgPath)
      expect(new Set(paths).size).toBe(3)
    })
  })

  describe('optimizeNodeEntrypoints', () => {
    beforeEach(() => {
      clearPortCache()
    })

    it('reduces crossings for edges connected to a central node', () => {
      /**
       * Test scenario: Star topology with central node and 4 surrounding nodes
       * arranged in a pattern that creates crossings with default port ordering.
       *
       *       top1 (x=250)
       *          |
       *   left1 --- center --- right1
       *          |
       *       bottom1 (x=250)
       *
       * Plus additional edges that would cross without optimization:
       * - Edge from center to a node at top-right that should use top-right port
       * - Edge from center to a node at bottom-left that should use bottom-left port
       */
      const nodes: NodeRect[] = [
        { id: 'center', canvas_x: 200, canvas_y: 200, width: 200, height: 120 },
        // Top nodes - edges from center should spread across top side
        { id: 'top-left', canvas_x: 50, canvas_y: 0, width: 100, height: 60 },
        { id: 'top-right', canvas_x: 450, canvas_y: 0, width: 100, height: 60 },
        // Right nodes - edges should spread on right side
        { id: 'right-top', canvas_x: 500, canvas_y: 100, width: 100, height: 60 },
        { id: 'right-bottom', canvas_x: 500, canvas_y: 300, width: 100, height: 60 },
      ]

      const nodeMap = new Map(nodes.map(n => [n.id!, n]))

      // Create edges that would cross without proper optimization:
      // - top-left and top-right both connect from center's top
      // - right-top and right-bottom both connect from center's right
      const edges: EdgeDef[] = [
        { id: 'e-top-left', source_node_id: 'center', target_node_id: 'top-left' },
        { id: 'e-top-right', source_node_id: 'center', target_node_id: 'top-right' },
        { id: 'e-right-top', source_node_id: 'center', target_node_id: 'right-top' },
        { id: 'e-right-bottom', source_node_id: 'center', target_node_id: 'right-bottom' },
      ]

      // Run optimization for the central node
      const result = optimizeNodeEntrypoints('center', edges, nodeMap)

      // The optimization should report improvement or no crossings
      // (barycentric should order edges correctly)
      expect(result.finalCrossings).toBeLessThanOrEqual(result.initialCrossings)

      // Now route edges using the cached optimized indices
      const routed = routeAllEdges(edges, nodes, nodeMap)

      // Verify all edges got routed
      expect(routed.size).toBe(4)

      // Get the source ports (first point of each path)
      const topLeftPort = routed.get('e-top-left')!.path[0]
      const topRightPort = routed.get('e-top-right')!.path[0]

      // For top side: top-left target is at x=100, top-right target is at x=500
      // Optimized order should have top-left edge to the left of top-right edge
      // (lower x coordinate for the port)
      expect(topLeftPort.x).toBeLessThan(topRightPort.x)
    })

    it('handles nodes with many edges without increasing crossings', () => {
      // Hub node with 6 edges going to nodes arranged in a semicircle on the right
      const nodes: NodeRect[] = [
        { id: 'hub', canvas_x: 0, canvas_y: 200, width: 200, height: 120 },
        // Nodes arranged from top to bottom on the right
        { id: 'r1', canvas_x: 400, canvas_y: 50, width: 100, height: 60 },
        { id: 'r2', canvas_x: 450, canvas_y: 120, width: 100, height: 60 },
        { id: 'r3', canvas_x: 480, canvas_y: 200, width: 100, height: 60 },
        { id: 'r4', canvas_x: 450, canvas_y: 280, width: 100, height: 60 },
        { id: 'r5', canvas_x: 400, canvas_y: 350, width: 100, height: 60 },
      ]

      const nodeMap = new Map(nodes.map(n => [n.id!, n]))

      const edges: EdgeDef[] = [
        { id: 'e1', source_node_id: 'hub', target_node_id: 'r1' },
        { id: 'e2', source_node_id: 'hub', target_node_id: 'r2' },
        { id: 'e3', source_node_id: 'hub', target_node_id: 'r3' },
        { id: 'e4', source_node_id: 'hub', target_node_id: 'r4' },
        { id: 'e5', source_node_id: 'hub', target_node_id: 'r5' },
      ]

      const result = optimizeNodeEntrypoints('hub', edges, nodeMap)

      // Should not make things worse
      expect(result.finalCrossings).toBeLessThanOrEqual(result.initialCrossings)
    })

    it('returns early for nodes with fewer than 2 edges', () => {
      const nodes: NodeRect[] = [
        { id: 'a', canvas_x: 0, canvas_y: 0, width: 100, height: 60 },
        { id: 'b', canvas_x: 200, canvas_y: 0, width: 100, height: 60 },
      ]

      const nodeMap = new Map(nodes.map(n => [n.id!, n]))

      const edges: EdgeDef[] = [
        { id: 'e1', source_node_id: 'a', target_node_id: 'b' },
      ]

      const result = optimizeNodeEntrypoints('a', edges, nodeMap)

      // Single edge - nothing to optimize
      expect(result.improved).toBe(false)
      expect(result.swapsPerformed).toBe(0)
    })
  })
})
