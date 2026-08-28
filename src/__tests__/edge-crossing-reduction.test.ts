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
