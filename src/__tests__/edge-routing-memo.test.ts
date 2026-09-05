/**
 * The edge list keeps its identity when nothing that shapes an edge changed.
 *
 * `edgeLines` re-ran its whole O(edges) pipeline - dedup, port assignment,
 * sort, geometry - on every reactive invalidation, 65-88ms for ~1,000 edges,
 * even though the routing itself was cached. Downstream computeds saw a new
 * array each time and re-ran too. The memo returns the previous product by
 * identity unless the memo key (edge set, layout version, style) differs.
 *
 * The other half of the fix is at the source: `updateNodeSize` bumped
 * nodeLayoutVersion even when a measurement wrote back the size the node
 * already had, and that version is the signal every routing cache keys on.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref, computed, reactive, nextTick } from 'vue'
import type { Node, Edge } from '../types'

const invokeMock = vi.fn().mockResolvedValue(undefined)
vi.mock('../lib/tauri', () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}))

import { useEdgeRouting } from '../canvas/composables/edges/useEdgeRouting'
import { updateNodeSize } from '../stores/nodes/crud'

function makeGraph(nodeCount: number, edgeCount: number) {
  const nodes = Array.from({ length: nodeCount }, (_, i) => ({
    id: `n${i}`,
    title: `Node ${i}`,
    canvas_x: (i % 10) * 300,
    canvas_y: Math.floor(i / 10) * 200,
    width: 200,
    height: 120,
    markdown_content: '',
  })) as Node[]
  const edges = Array.from({ length: edgeCount }, (_, i) => ({
    id: `e${i}`,
    source_node_id: `n${i % nodeCount}`,
    target_node_id: `n${(i + 1) % nodeCount}`,
    link_type: 'related',
    label: null,
    directed: true,
  })) as Edge[]
  return { nodes, edges }
}

function routingFor(store: { nodeLayoutVersion: number; nodes: Node[]; edges: Edge[]; filteredEdges: Edge[] }) {
  return useEdgeRouting({
    store,
    displayNodes: computed(() => store.nodes),
    neighborhoodMode: ref(false),
    focusNodeId: ref(null),
    isMassiveGraph: computed(() => false),
    isHugeGraph: computed(() => false),
    isLODMode: computed(() => false),
    globalEdgeStyle: ref('straight'),
    edgeStyleMap: ref({}),
    getNodeHeight: node => node.height ?? 120,
  })
}

describe('edgeLines memo', () => {
  it('returns the same array identity when only node props were touched', async () => {
    const { nodes, edges } = makeGraph(10, 9)
    const store = reactive({ nodeLayoutVersion: 0, nodes, edges, filteredEdges: edges })
    const { edgeLines } = routingFor(store as never)

    const first = edgeLines.value
    expect(first.length).toBeGreaterThan(0)

    // A node property write without a layout-version bump: previously this
    // invalidated the computed and rebuilt everything from scratch
    store.nodes[0].width = 210
    await nextTick()
    expect(edgeLines.value).toBe(first)
  })

  it('produces a new list when the layout version moves', async () => {
    const { nodes, edges } = makeGraph(10, 9)
    const store = reactive({ nodeLayoutVersion: 0, nodes, edges, filteredEdges: edges })
    const { edgeLines } = routingFor(store as never)

    const first = edgeLines.value
    store.nodes[0].canvas_x += 500
    store.nodeLayoutVersion++
    await nextTick()
    const second = edgeLines.value
    expect(second).not.toBe(first)
    // and the geometry actually followed the node
    expect(second[0].x1).not.toBe(first[0].x1)
  })

  it('produces a new list when the edge set changes', async () => {
    const { nodes, edges } = makeGraph(10, 9)
    const store = reactive({ nodeLayoutVersion: 0, nodes, edges, filteredEdges: edges })
    const { edgeLines } = routingFor(store as never)

    const first = edgeLines.value
    store.filteredEdges = store.filteredEdges.slice(1)
    await nextTick()
    expect(edgeLines.value).not.toBe(first)
    expect(edgeLines.value.length).toBe(first.length - 1)
  })
})

describe('updateNodeSize no-op guard', () => {
  beforeEach(() => invokeMock.mockClear())

  function makeDeps(node: Partial<Node>) {
    return {
      state: {
        nodes: ref([node]),
        nodeLayoutVersion: ref(0),
      },
    } as never
  }

  it('does not bump the layout version for the size the node already has', async () => {
    const node = { id: 'a', width: 200, height: 120 }
    const deps = makeDeps(node)
    await updateNodeSize(deps, 'a', 200, 120, false)
    expect((deps as { state: { nodeLayoutVersion: { value: number } } }).state.nodeLayoutVersion.value).toBe(0)
    expect(invokeMock).not.toHaveBeenCalled()
  })

  it('still bumps it for a real change', async () => {
    const node = { id: 'a', width: 200, height: 120 }
    const deps = makeDeps(node)
    await updateNodeSize(deps, 'a', 260, 120, false)
    expect((deps as { state: { nodeLayoutVersion: { value: number } } }).state.nodeLayoutVersion.value).toBe(1)
    expect(node.width).toBe(260)
  })
})
