/**
 * Changing an edge's type outlives a reload.
 *
 * `updateEdgeLinkType` rewrote the in-memory array and called no backend
 * command - none existed - so the change was lost on reload, unlike the colour
 * and label paths beside it (PRODUCT_DESIGN.md > Changing an edge's type).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

const invoke = vi.fn()
vi.mock('@tauri-apps/api/core', () => ({ invoke: (...a: unknown[]) => invoke(...a) }))

describe('changing an edge type', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    invoke.mockReset()
    invoke.mockResolvedValue(undefined)
  })

  async function storeWithEdge() {
    const { useEdgesStore } = await import('../stores/edges')
    const store = useEdgesStore()
    store.edges = [
      {
        id: 'e1',
        source_node_id: 'n1',
        target_node_id: 'n2',
        link_type: 'related',
        created_at: 0,
      },
    ] as never
    return store
  }

  it('persists the new type through the backend', async () => {
    const store = await storeWithEdge()

    await store.updateEdgeLinkType('e1', 'supports')

    expect(invoke).toHaveBeenCalledWith('update_edge_link_type', {
      id: 'e1',
      linkType: 'supports',
    })
    expect(store.edges[0].link_type).toBe('supports')
  })

  it('leaves the shown type unchanged when the backend refuses', async () => {
    // The unique constraint covers (source, target, link_type), so this can
    // fail for a real reason. Showing a change that was not stored is worse
    // than showing none.
    const store = await storeWithEdge()
    invoke.mockRejectedValue(new Error('An edge of that type already connects these nodes'))

    await expect(store.updateEdgeLinkType('e1', 'supports')).rejects.toThrow()

    expect(store.edges[0].link_type).toBe('related')
  })
})
