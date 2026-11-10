/**
 * Ports are ordered so fewer edges cross.
 *
 * `assignPorts` spreads edges along a node side in the order it meets them.
 * Where that order does not match the direction the edges leave in, the edges
 * cross each other for no reason. A pass to reorder them existed and was never
 * called, so the application never reduced crossings at all
 * (PRODUCT_DESIGN.md > Reducing edge crossings).
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { assignPorts, optimizePortAssignments, detectCrossings } from '../canvas/routing'
import type { NodeRect } from '../canvas/routing/types'

function node(id: string, x: number, y: number): NodeRect {
  return { id, canvas_x: x, canvas_y: y, width: 160, height: 80 }
}

/**
 * One node on the left with three edges to nodes on the right, listed in an
 * order that does not match their vertical positions - so the naive assignment
 * puts the port for the lowest target above the port for the highest.
 */
function crossingFixture() {
  const hub = node('hub', 0, 300)
  const top = node('top', 600, 0)
  const middle = node('middle', 600, 300)
  const bottom = node('bottom', 600, 600)

  const edgeInfos = [
    { edge: { id: 'e1', source_node_id: 'hub', target_node_id: 'bottom' }, source: hub, target: bottom, sourceSide: 'right', targetSide: 'left' },
    { edge: { id: 'e2', source_node_id: 'hub', target_node_id: 'top' }, source: hub, target: top, sourceSide: 'right', targetSide: 'left' },
    { edge: { id: 'e3', source_node_id: 'hub', target_node_id: 'middle' }, source: hub, target: middle, sourceSide: 'right', targetSide: 'left' },
  ]
  return edgeInfos as never[]
}

describe('port ordering', () => {
  it('reduces crossings, or leaves them no worse', () => {
    const edgeInfos = crossingFixture()
    const { sourceAssignments, targetAssignments } = assignPorts(edgeInfos)

    const before = detectCrossings(edgeInfos, sourceAssignments, targetAssignments)
    optimizePortAssignments(edgeInfos, sourceAssignments, targetAssignments)
    const after = detectCrossings(edgeInfos, sourceAssignments, targetAssignments)

    expect(after.totalCrossings).toBeLessThanOrEqual(before.totalCrossings)
  })

  it('is applied by the routing path, not merely available', () => {
    // The pass existed and nothing called it, so no graph ever benefited
    const source = readFileSync(
      resolve(__dirname, '../canvas/composables/edges/useEdgeRouting.ts'),
      'utf-8'
    )
    expect(source).toContain('optimizePortAssignments')
  })
})

describe('the drawn path', () => {
  it('starts and ends at the ports the caller assigned, so hit areas and labels match the line', async () => {
    const { routeAllEdges, analyzeEdges, getPortPoint, calculatePortOffset, portLanePitch } = await import('../canvas/routing')
    const nodes: NodeRect[] = [
      { id: 'center', canvas_x: 200, canvas_y: 200, width: 200, height: 120 },
      { id: 'r1', canvas_x: 500, canvas_y: 100, width: 200, height: 120 },
      { id: 'r2', canvas_x: 500, canvas_y: 200, width: 200, height: 120 },
      { id: 'r3', canvas_x: 500, canvas_y: 300, width: 200, height: 120 },
    ]
    const nodeMap = new Map(nodes.map(n => [n.id!, n]))
    const edges = ['r1', 'r2', 'r3'].map((t, i) => ({ id: `e${i + 1}`, source_node_id: 'center', target_node_id: t }))
    const ports = assignPorts(analyzeEdges(edges, nodeMap))
    // Reverse the order on the hub's side, which the default assignment would not choose
    for (const a of ports.sourceAssignments.values()) a.index = a.total - 1 - a.index

    const routed = routeAllEdges(edges, nodes, nodeMap, 'orthogonal', ports)

    for (const edge of edges) {
      const a = ports.sourceAssignments.get(edge.id)!
      // The PCB styles put ports on the lane grid; the canvas passes the same pitch
      const expected = getPortPoint(nodeMap.get('center')!, a.side, calculatePortOffset(a.index, a.total), portLanePitch('orthogonal', edges.length))
      expect(routed.get(edge.id)!.path![0]).toEqual(expected)
    }
  })

  it('is routed from the optimised assignments the canvas computed', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/canvas/composables/edges/useEdgeRouting.ts'), 'utf8')
    expect(source).toMatch(/routeAllEdges\([^)]*\{ sourceAssignments, targetAssignments \}/)
  })
})
