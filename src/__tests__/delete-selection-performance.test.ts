/**
 * Deleting a group of nodes (PRODUCT_DESIGN.md > Canvas rendering).
 *
 * Collecting undo data scanned every edge in the workspace once per deleted
 * node, so deleting a selection cost nodes x edges. The database side is a
 * single UPDATE; the wait was entirely in the interface.
 */
import { describe, it, expect, vi } from 'vitest'
import { computed } from 'vue'
import { useSelectionActions } from '../canvas/composables/selection/useSelectionActions'
import type { Node, Edge } from '../types'

const SLACK = 6

function workspace(nodeCount: number, edgeCount: number) {
  const nodes: Node[] = Array.from({ length: nodeCount }, (_, i) => ({
    id: `n${i}`,
    title: `Node ${i}`,
  })) as unknown as Node[]

  const edges: Edge[] = Array.from({ length: edgeCount }, (_, i) => ({
    id: `e${i}`,
    source_node_id: `n${i % nodeCount}`,
    target_node_id: `n${(i * 7 + 3) % nodeCount}`,
  })) as unknown as Edge[]

  const byId = new Map(nodes.map(n => [n.id, n]))

  return {
    nodes,
    edges,
    store: {
      getNode: (id: string) => byId.get(id),
      selectedNodeIds: [] as string[],
      filteredEdges: edges,
      deleteNodes: vi.fn().mockResolvedValue(undefined),
    },
  }
}

describe('deleting a selection', () => {
  it('does not slow down with the size of the workspace around it', async () => {
    // The cost must follow what is deleted and what it connects to, not the
    // total number of edges in the workspace
    const small = workspace(1000, 500)
    const large = workspace(1000, 8000)

    async function timeDelete(w: ReturnType<typeof workspace>) {
      const actions = useSelectionActions({
        store: w.store,
        displayNodes: computed(() => w.nodes),
        pushDeletionUndo: () => {},
      })
      const ids = w.nodes.slice(0, 200).map(n => n.id)

      const start = performance.now()
      await actions.deleteSelectedNodes(ids)
      return performance.now() - start
    }

    const smallMs = await timeDelete(small)
    const largeMs = await timeDelete(large)

    console.log(
      `delete 200 nodes: 500 edges ${smallMs.toFixed(1)}ms, 8000 edges ${largeMs.toFixed(1)}ms`
    )

    // 16x the edges must not cost anything like 16x the time. The floor keeps
    // timer noise from failing the ratio when the small case rounds to ~0, and
    // SLACK covers running alongside the rest of the suite - the shape of the
    // scaling is the claim here, not a wall-clock budget
    expect(largeMs).toBeLessThan(Math.max(smallMs, 3) * 4 * SLACK)
  })

  it('deletes a large selection quickly', async () => {
    const w = workspace(2000, 6000)
    const actions = useSelectionActions({
      store: w.store,
      displayNodes: computed(() => w.nodes),
      pushDeletionUndo: () => {},
    })
    const ids = w.nodes.slice(0, 500).map(n => n.id)

    const start = performance.now()
    await actions.deleteSelectedNodes(ids)
    const ms = performance.now() - start

    expect(ms).toBeLessThan(50 * SLACK)
  })

  it('still hands undo every edge that was attached to a deleted node', async () => {
    const w = workspace(50, 200)
    const captured: Array<{ node: Node; edges: Edge[] }> = []
    const actions = useSelectionActions({
      store: w.store,
      displayNodes: computed(() => w.nodes),
      pushDeletionUndo: (node, edges) => captured.push({ node, edges }),
    })

    await actions.deleteSelectedNodes(['n3'])

    const expected = w.edges.filter(
      e => e.source_node_id === 'n3' || e.target_node_id === 'n3'
    )
    expect(captured).toHaveLength(1)
    expect(captured[0].edges.map(e => e.id).sort()).toEqual(expected.map(e => e.id).sort())
  })
})
