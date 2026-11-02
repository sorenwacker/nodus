/**
 * While a layout moves the nodes, edges are drawn as direct lines
 * and routed in their style once the motion ends
 * (PRODUCT_DESIGN.md > Routing while a layout moves the nodes).
 */
import { describe, it, expect, vi } from 'vitest'
import { ref, computed } from 'vue'
import type { Node, Edge } from '../types'

vi.mock('../lib/tauri', () => ({ invoke: vi.fn().mockResolvedValue(undefined) }))

import { useEdgeRouting } from '../canvas/composables/edges/useEdgeRouting'

function setup() {
  // Diagonal neighbours: the orthogonal style bends between them
  const nodes = [
    { id: 'a', title: 'A', canvas_x: 0, canvas_y: 0, width: 200, height: 120, markdown_content: '' },
    { id: 'b', title: 'B', canvas_x: 900, canvas_y: 700, width: 200, height: 120, markdown_content: '' },
  ] as Node[]
  const edges = [{ id: 'e', source_node_id: 'a', target_node_id: 'b', link_type: 'related', label: null, directed: true }] as Edge[]
  const store = { nodeLayoutVersion: 0, nodes, edges, filteredEdges: edges }
  const moving = ref(false)
  const routing = useEdgeRouting({
    store,
    displayNodes: computed(() => store.nodes),
    neighborhoodMode: ref(false),
    focusNodeId: ref(null),
    isMassiveGraph: computed(() => false),
    isHugeGraph: computed(() => false),
    isLODMode: computed(() => false),
    globalEdgeStyle: ref('orthogonal'),
    edgeStyleMap: ref({}),
    getNodeHeight: (node: { height?: number }) => node.height ?? 120,
    isMoving: moving,
  })
  /** Points in the edge's drawn path */
  const points = () => (routing.edgeLines.value[0].path as string).match(/[ML]/g)?.length ?? 0
  return { moving, points }
}

describe('routing while nodes move', () => {
  it('draws a direct line while a layout moves the nodes', () => {
    const { moving, points } = setup()
    expect(points(), 'precondition: the style bends').toBeGreaterThan(2)
    moving.value = true
    expect(points()).toBe(2)
  })

  it('routes in the style again once the motion ends', () => {
    const { moving, points } = setup()
    moving.value = true
    expect(points()).toBe(2)
    moving.value = false
    expect(points()).toBeGreaterThan(2)
  })
})
