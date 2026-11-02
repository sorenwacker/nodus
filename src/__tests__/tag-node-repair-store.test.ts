/**
 * The tag node repair is one function the settings panel and MCP share
 * (PRODUCT_DESIGN.md > Tag nodes over MCP).
 */
import { describe, it, expect, vi } from 'vitest'
import { repairTagNodes, type TagNodeRepairStore } from '../composables/tagNodeRepair'
import type { Edge, Node } from '../types'

function tagNode(id: string, title: string): Node {
  return {
    id,
    title,
    file_path: null,
    markdown_content: null,
    node_type: 'tag',
    canvas_x: 0,
    canvas_y: 0,
    width: 70,
    height: 22,
    z_index: 0,
    color_theme: null,
    is_collapsed: false,
    tags: null,
    workspace_id: null,
    checksum: null,
    created_at: 0,
    updated_at: 0,
    deleted_at: null,
  }
}

function note(id: string): Node {
  return { ...tagNode(id, id), node_type: 'note' }
}

function taggedEdge(id: string, source: string, target: string): Edge {
  return {
    id,
    source_node_id: source,
    target_node_id: target,
    label: null,
    link_type: 'tagged',
    weight: 1,
    color: null,
    storyline_id: null,
    created_at: 0,
    directed: true,
  }
}

function storeWith(nodes: Node[], edges: Edge[]): TagNodeRepairStore {
  return {
    nodes,
    edges,
    currentWorkspaceId: null,
    createEdge: vi.fn().mockResolvedValue(undefined),
    deleteEdge: vi.fn().mockResolvedValue(undefined),
    deleteNode: vi.fn().mockResolvedValue(undefined),
    updateNodeTitle: vi.fn().mockResolvedValue(undefined),
  }
}

describe('repairTagNodes', () => {
  it('returns null on a healthy vault, writing nothing', async () => {
    const store = storeWith([note('n'), tagNode('t', '#tag')], [taggedEdge('e', 'n', 't')])

    expect(await repairTagNodes(store)).toBeNull()
    expect(store.deleteNode).not.toHaveBeenCalled()
  })

  it('merges a duplicate tag node and moves its edge onto the survivor', async () => {
    const store = storeWith(
      [note('n1'), note('n2'), tagNode('t1', '#tag'), tagNode('t2', 'tag')],
      [taggedEdge('e1', 'n1', 't1'), taggedEdge('e2', 'n2', 't2')]
    )

    const result = await repairTagNodes(store)

    expect(result).toEqual({ merged: 1, edgesRepointed: 1, edgesDeleted: 0, renamed: 0, removedUnused: 0 })
    expect(store.createEdge).toHaveBeenCalledWith({ source_node_id: 'n2', target_node_id: 't1', link_type: 'tagged' })
    expect(store.deleteEdge).toHaveBeenCalledWith('e2')
    expect(store.deleteNode).toHaveBeenCalledWith('t2')
  })
})
