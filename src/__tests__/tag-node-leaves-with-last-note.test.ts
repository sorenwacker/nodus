/**
 * A tag node leaves with the last note that used it
 * (docs/content/features.md > Tags).
 *
 * Deleting the hashtag from the text withdrew the tag node; deleting the note
 * did not, so the tag node stayed behind as an unconnected node.
 */
import { describe, it, expect, vi } from 'vitest'
import { tagNodesTaggedBy, emptiedTagNodes } from '../lib/tagSync'
import { planTagNodeRepair, runTagNodeRepair } from '../composables/tagNodeRepair'
import type { Edge, Node } from '../types'

function tagged(id: string, source: string, target: string): Edge {
  return { id, source_node_id: source, target_node_id: target, link_type: 'tagged' } as Edge
}
function tagNode(id: string, title = `#${id}`): Node {
  return { id, title, node_type: 'tag', workspace_id: 'w' } as Node
}
function note(id: string): Node {
  return { id, title: id, node_type: 'note', workspace_id: 'w' } as Node
}

describe('tag nodes of deleted notes', () => {
  it('finds the tag nodes the notes are connected to', () => {
    const edges = [
      tagged('e1', 'a', 't1'),
      tagged('e2', 'b', 't2'),
      { id: 'e3', source_node_id: 'a', target_node_id: 'b', link_type: 'wikilink' } as Edge,
    ]
    expect(tagNodesTaggedBy(['a'], edges)).toEqual(['t1'])
  })

  it('names a tag node nothing is connected to any more', () => {
    // After the deletion: a's edges are gone, c still uses t2
    const nodes = [tagNode('t1'), tagNode('t2'), note('c')]
    const edges = [tagged('e2', 'c', 't2'), tagged('e9', 'gone', 't1')]
    expect(emptiedTagNodes(['t1', 't2'], nodes, edges)).toEqual(['t1'])
  })

  it('skips a tag node that was itself among the deleted', () => {
    expect(emptiedTagNodes(['t1'], [note('c')], [])).toEqual([])
  })
})

describe('repairing tag nodes nothing uses', () => {
  it('plans to delete a tag node without a tagged edge', () => {
    const nodes = [tagNode('t1'), tagNode('t2'), note('a')]
    const plan = planTagNodeRepair(nodes, [tagged('e1', 'a', 't2')], 'w')
    expect(plan.unusedIds).toEqual(['t1'])
  })

  it('counts an edge only while the note at its other end exists', () => {
    const plan = planTagNodeRepair([tagNode('t1')], [tagged('e1', 'deleted-note', 't1')], 'w')
    expect(plan.unusedIds).toEqual(['t1'])
  })

  it('leaves the tag nodes of other workspaces, whose edges are not loaded', () => {
    const elsewhere = { ...tagNode('t3'), workspace_id: 'other' } as Node
    const unnamed = { ...tagNode('t4'), workspace_id: null } as Node
    expect(planTagNodeRepair([tagNode('t1'), elsewhere, unnamed], [], 'w').unusedIds).toEqual(['t1'])
    expect(planTagNodeRepair([tagNode('t1'), elsewhere, unnamed], [], 'default').unusedIds).toEqual(['t4'])
  })

  it('does not count a duplicate that the merge already drops', () => {
    const nodes = [tagNode('t1', '#x'), tagNode('t2', '#x'), note('a')]
    const plan = planTagNodeRepair(nodes, [tagged('e1', 'a', 't1')], 'w')
    expect(plan.merges[0].dropIds).toEqual(['t2'])
    expect(plan.unusedIds).toEqual([])
  })

  it('deletes them and reports how many', async () => {
    const deleteNode = vi.fn(async () => {})
    const result = await runTagNodeRepair(
      { merges: [], renames: [], unusedIds: ['t1', 't9'] },
      { createTaggedEdge: vi.fn(), deleteEdge: vi.fn(), deleteNode, renameNode: vi.fn() }
    )
    expect(deleteNode).toHaveBeenCalledTimes(2)
    expect(result.removedUnused).toBe(2)
  })
})

describe('deleting notes in the store', () => {
  const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }))
  vi.mock('@tauri-apps/api/core', () => ({ invoke: invokeMock }))
  vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn().mockResolvedValue(() => {}) }))

  async function storeWith(nodes: Node[], edges: Edge[]) {
    const { setActivePinia, createPinia } = await import('pinia')
    const { useNodesStore } = await import('../stores/nodes')
    const { useEdgesStore } = await import('../stores/edges')
    setActivePinia(createPinia())
    invokeMock.mockReset()
    invokeMock.mockImplementation(async (command: string, args?: { ids?: string[] }) => {
      if (command === 'delete_nodes') return args?.ids ?? []
      if (command === 'delete_node') return undefined
      throw new Error(`Mock: unhandled ${command}`)
    })
    const store = useNodesStore()
    store.nodes = nodes
    useEdgesStore().edges = edges
    return store
  }

  it('deletes a tag node with the last notes that used it, and keeps one still in use', async () => {
    const store = await storeWith(
      [note('a'), note('b'), note('c'), tagNode('gone'), tagNode('kept')],
      [tagged('e1', 'a', 'gone'), tagged('e2', 'b', 'gone'), tagged('e3', 'a', 'kept'), tagged('e4', 'c', 'kept')]
    )

    await store.deleteNodes(['a', 'b'])

    expect(store.nodes.map(n => n.id).sort()).toEqual(['c', 'kept'])
    expect(invokeMock).toHaveBeenCalledWith('delete_node', { id: 'gone' })
    expect(invokeMock).not.toHaveBeenCalledWith('delete_node', { id: 'kept' })
  })

  it('does the same for a single deletion', async () => {
    const store = await storeWith([note('a'), tagNode('gone')], [tagged('e1', 'a', 'gone')])

    await store.deleteNode('a')

    expect(store.nodes).toEqual([])
  })

  it('does not restore an edge to a tag node that went with its note', async () => {
    const { useEdgesStore } = await import('../stores/edges')
    const store = await storeWith([note('a')], [])

    store.restoreEdge(tagged('e1', 'a', 'gone'))
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(useEdgesStore().edges).toEqual([])
    expect(invokeMock).not.toHaveBeenCalledWith('restore_edge', expect.anything())
  })
})
