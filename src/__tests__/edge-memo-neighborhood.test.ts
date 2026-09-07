/**
 * Entering neighbourhood mode must re-route the edges.
 *
 * Neighbourhood positions are an overlay: they are deliberately never written
 * to the store, so leaving the mode restores the canvas exactly. But the edge
 * memo keys geometry on nodeLayoutVersion, which the store bumps on a position
 * write - and an overlay is not one. The memo therefore reported a hit and
 * returned edges routed against where the nodes used to be, drawn as stubs
 * radiating from the focus node
 * (PRODUCT_DESIGN.md > Re-routing edges during an interaction).
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { ref, computed } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { useEdgeRouting } from '../canvas/composables/edges/useEdgeRouting'
import type { Node } from '../types'

function node(id: string, x: number, y: number): Node {
  return { id, title: id, markdown_content: '', canvas_x: x, canvas_y: y, width: 200, height: 120 } as unknown as Node
}

function setup() {
  const neighborhoodMode = ref(false)
  const focusNodeId = ref<string | null>(null)
  const laidOut = ref(false)

  // The overlay moves the neighbour; the store's layout version never changes
  const displayNodes = computed(() =>
    laidOut.value
      ? [node('hub', 0, 0), node('a', 900, 900)]
      : [node('hub', 0, 0), node('a', 100, 100)]
  )
  const edges = [{ id: 'e1', source_node_id: 'hub', target_node_id: 'a', link_type: 'related' }]

  const { edgeLines } = useEdgeRouting({
    store: { nodeLayoutVersion: 1, nodes: displayNodes.value, edges, filteredEdges: edges },
    displayNodes,
    neighborhoodMode,
    focusNodeId,
    isMassiveGraph: computed(() => false),
    isHugeGraph: computed(() => false),
    isLODMode: computed(() => false),
    globalEdgeStyle: ref('straight'),
    edgeStyleMap: ref({}),
    getNodeHeight: () => 120,
    isDragging: ref(false),
  } as never)

  return { edgeLines, neighborhoodMode, focusNodeId, laidOut }
}

describe('edge routing across a neighbourhood overlay', () => {
  beforeAll(() => setActivePinia(createPinia()))

  it('re-routes when the overlay moves a node', () => {
    const { edgeLines, neighborhoodMode, focusNodeId, laidOut } = setup()

    const before = edgeLines.value[0]
    expect(before).toBeDefined()

    neighborhoodMode.value = true
    focusNodeId.value = 'hub'
    laidOut.value = true

    const after = edgeLines.value[0]
    expect(after).toBeDefined()
    // The edge must reach where the node now is, not where it was
    expect(`${after.x2},${after.y2}`).not.toBe(`${before.x2},${before.y2}`)
  })

  it('re-routes again when the mode is left and the nodes go back', () => {
    const { edgeLines, neighborhoodMode, focusNodeId, laidOut } = setup()

    neighborhoodMode.value = true
    focusNodeId.value = 'hub'
    laidOut.value = true
    const inMode = edgeLines.value[0]

    neighborhoodMode.value = false
    focusNodeId.value = null
    laidOut.value = false
    const out = edgeLines.value[0]

    expect(`${out.x2},${out.y2}`).not.toBe(`${inMode.x2},${inMode.y2}`)
  })
})
