/**
 * A storyline's chain edges belong to that storyline.
 *
 * The duplicate guard matched on source and target alone, so two nodes already
 * connected by anything - a wikilink, a `supports` edge - suppressed the chain
 * edge, and the storyline was left with a gap in the sequence the reader walks.
 * The reconnect path had the same guard (PRODUCT_DESIGN.md > Storyline chain
 * edges).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useStorylinesStore } from '../stores/storylines'
import type { Edge } from '../types'

const invokeMock = vi.fn()
vi.mock('@tauri-apps/api/core', () => ({ invoke: (...a: unknown[]) => invokeMock(...a) }))
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn().mockResolvedValue(() => {}) }))

function edge(id: string, source: string, target: string, storylineId?: string): Edge {
  return {
    id,
    source_node_id: source,
    target_node_id: target,
    link_type: 'related',
    storyline_id: storylineId ?? null,
    created_at: 0,
  } as Edge
}

describe('storyline chain edges', () => {
  let createEdge: ReturnType<typeof vi.fn>
  let deleteEdge: ReturnType<typeof vi.fn>
  let edges: Edge[]

  beforeEach(() => {
    setActivePinia(createPinia())
    createEdge = vi.fn().mockResolvedValue(undefined)
    deleteEdge = vi.fn().mockResolvedValue(undefined)
    edges = []
    invokeMock.mockReset()
    invokeMock.mockResolvedValue(undefined)

    const store = useStorylinesStore()
    store.setDependencies({
      getCurrentWorkspaceId: () => null,
      getEdges: () => edges,
      getNodes: () => [],
      createEdge: createEdge as never,
      deleteEdge: deleteEdge as never,
    })
  })

  it('creates a chain edge even when the nodes are already connected otherwise', async () => {
    const store = useStorylinesStore()
    store.storylines = [{ id: 's1', title: 'Argument', created_at: 0, updated_at: 0 }] as never
    store.storylineNodes = new Map([['s1', ['a']]])
    // The user has already linked these two nodes for their own reasons
    edges = [edge('user-edge', 'a', 'b')]

    await store.addNodeToStoryline('s1', 'b')

    expect(createEdge).toHaveBeenCalledOnce()
    expect(createEdge.mock.calls[0][0]).toMatchObject({
      source_node_id: 'a',
      target_node_id: 'b',
      storyline_id: 's1',
    })
  })

  it('creates no second chain edge when this storyline already links the pair', async () => {
    const store = useStorylinesStore()
    store.storylines = [{ id: 's1', title: 'Argument', created_at: 0, updated_at: 0 }] as never
    store.storylineNodes = new Map([['s1', ['a']]])
    edges = [edge('chain', 'a', 'b', 's1')]

    await store.addNodeToStoryline('s1', 'b')

    expect(createEdge).not.toHaveBeenCalled()
  })

  it('reconnects across a removed node even when the neighbours are already connected', async () => {
    const store = useStorylinesStore()
    store.storylines = [{ id: 's1', title: 'Argument', created_at: 0, updated_at: 0 }] as never
    store.storylineNodes = new Map([['s1', ['a', 'b', 'c']]])
    edges = [
      edge('chain-ab', 'a', 'b', 's1'),
      edge('chain-bc', 'b', 'c', 's1'),
      // An unrelated link the user made between the neighbours
      edge('user-edge', 'a', 'c'),
    ]

    await store.removeNodeFromStoryline('s1', 'b')

    expect(createEdge).toHaveBeenCalledOnce()
    expect(createEdge.mock.calls[0][0]).toMatchObject({
      source_node_id: 'a',
      target_node_id: 'c',
      storyline_id: 's1',
    })
    // The user's own edge is not one of the storyline edges removed with the node
    expect(deleteEdge.mock.calls.map(c => c[0])).not.toContain('user-edge')
  })
})
