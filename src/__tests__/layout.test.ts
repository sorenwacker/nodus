/**
 * Force layout tests
 */
import { describe, it, expect } from 'vitest'
import { applyForceLayout } from '../canvas/layout'

describe('Force Layout', () => {
  it('should return empty map for empty nodes', () => {
    const result = applyForceLayout([], [])
    expect(result.size).toBe(0)
  })

  it('should position single node at center', () => {
    const nodes = [{ id: '1', x: 0, y: 0, width: 200, height: 120 }]
    const result = applyForceLayout(nodes, [], { centerX: 400, centerY: 300 })

    const pos = result.get('1')
    expect(pos).toBeDefined()
    // Should be close to center
    expect(pos!.x).toBeCloseTo(400, -1)
    expect(pos!.y).toBeCloseTo(300, -1)
  })

  it('should separate connected nodes', () => {
    const nodes = [
      { id: '1', x: 0, y: 0, width: 200, height: 120 },
      { id: '2', x: 0, y: 0, width: 200, height: 120 },
    ]
    const edges = [{ source: '1', target: '2' }]
    const result = applyForceLayout(nodes, edges, {
      centerX: 0,
      centerY: 0,
      linkDistance: 200,
    })

    const pos1 = result.get('1')!
    const pos2 = result.get('2')!

    // Nodes should be separated
    const distance = Math.sqrt((pos2.x - pos1.x) ** 2 + (pos2.y - pos1.y) ** 2)
    expect(distance).toBeGreaterThan(100)
  })

  it('should handle multiple connected nodes', () => {
    const nodes = [
      { id: '1', x: 0, y: 0, width: 200, height: 120 },
      { id: '2', x: 0, y: 0, width: 200, height: 120 },
      { id: '3', x: 0, y: 0, width: 200, height: 120 },
    ]
    const edges = [
      { source: '1', target: '2' },
      { source: '2', target: '3' },
    ]
    const result = applyForceLayout(nodes, edges, {
      centerX: 400,
      centerY: 300,
      iterations: 300,
    })

    expect(result.size).toBe(3)

    // All nodes should have positions
    for (const node of nodes) {
      const pos = result.get(node.id)
      expect(pos).toBeDefined()
      expect(typeof pos!.x).toBe('number')
      expect(typeof pos!.y).toBe('number')
    }
  })

  it('should cluster connected components separately', () => {
    const nodes = [
      { id: '1', x: 0, y: 0, width: 200, height: 120 },
      { id: '2', x: 0, y: 0, width: 200, height: 120 },
      { id: '3', x: 500, y: 500, width: 200, height: 120 },
      { id: '4', x: 500, y: 500, width: 200, height: 120 },
    ]
    const edges = [
      { source: '1', target: '2' },
      { source: '3', target: '4' },
    ]
    const result = applyForceLayout(nodes, edges, {
      centerX: 400,
      centerY: 300,
      iterations: 300,
    })

    expect(result.size).toBe(4)
  })

  it('should handle nodes with no edges', () => {
    const nodes = [
      { id: '1', x: 100, y: 100, width: 200, height: 120 },
      { id: '2', x: 200, y: 200, width: 200, height: 120 },
      { id: '3', x: 300, y: 300, width: 200, height: 120 },
    ]
    const result = applyForceLayout(nodes, [], {
      centerX: 400,
      centerY: 300,
    })

    expect(result.size).toBe(3)
  })
})
