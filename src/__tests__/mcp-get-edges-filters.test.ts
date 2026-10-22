/**
 * Edges can be read by label, and the labels in use can be counted.
 *
 * Finding four unlabelled edges and the 80-label vocabulary of a workspace
 * needed a full edge dump, a node dump to resolve the ids, and a script
 * (PRODUCT_DESIGN.md > Reading edges by label).
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { createMcpMessageHandler, type McpStoreInterface } from '../mcp/messageHandler'
import type { Edge, Node } from '../types'

function makeNode(id: string, title: string): Node {
  return {
    id,
    title,
    file_path: null,
    markdown_content: null,
    node_type: 'note',
    canvas_x: 0,
    canvas_y: 0,
    width: 200,
    height: 120,
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

function makeEdge(id: string, source: string, target: string, label: string | null): Edge {
  return {
    id,
    source_node_id: source,
    target_node_id: target,
    label,
    link_type: 'related',
    weight: 1,
    color: null,
    storyline_id: null,
    created_at: 0,
    directed: true,
  }
}

describe('reading edges by label', () => {
  const nodes = [makeNode('a', 'Alpha'), makeNode('b', 'Beta'), makeNode('c', 'Gamma')]
  const edges = [
    makeEdge('e1', 'a', 'b', 'supports'),
    makeEdge('e2', 'b', 'c', 'supports'),
    makeEdge('e3', 'a', 'c', null),
    makeEdge('e4', 'c', 'a', '  '),
    makeEdge('e5', 'c', 'b', 'Supports'),
    makeEdge('e6', 'a', 'b', 'cites'),
  ]
  let handler: ReturnType<typeof createMcpMessageHandler>

  beforeEach(() => {
    const store = {
      getFilteredNodes: () => nodes,
      getFilteredEdges: () => edges,
      getNode: (id: string) => nodes.find(n => n.id === id),
      getWorkspaces: () => [{ id: 'default', name: 'Default', current: true }],
    } as unknown as McpStoreInterface
    handler = createMcpMessageHandler(store)
  })

  async function call(method: string, params: Record<string, unknown> = {}) {
    const res = await handler.handleRequest({ jsonrpc: '2.0' as const, id: 1, method, params }, 'conn')
    return res.result
  }

  it('filters by an exact label', async () => {
    const result = (await call('get_edges', { label: 'supports' })) as Edge[]
    expect(result.map(e => e.id)).toEqual(['e1', 'e2'])
  })

  it('keeps only edges with no label or a blank one', async () => {
    const result = (await call('get_edges', { unlabelled_only: true })) as Edge[]
    expect(result.map(e => e.id)).toEqual(['e3', 'e4'])
  })

  it('combines the label filter with the node filter', async () => {
    const result = (await call('get_edges', { label: 'supports', node_id: 'c' })) as Edge[]
    expect(result.map(e => e.id)).toEqual(['e2'])
  })

  it('adds the endpoint titles only when asked', async () => {
    const plain = (await call('get_edges', { node_id: 'a', limit: 1 })) as Record<string, unknown>[]
    expect(plain[0]).not.toHaveProperty('source_title')

    const titled = (await call('get_edges', { node_id: 'a', limit: 1, include_titles: true })) as Record<string, unknown>[]
    expect(titled[0]).toMatchObject({ id: 'e1', source_title: 'Alpha', target_title: 'Beta' })
  })

  it('counts the edges per distinct label, most frequent first', async () => {
    expect(await call('get_edge_labels')).toEqual({
      labels: [
        { label: 'supports', count: 2 },
        { label: 'Supports', count: 1 },
        { label: 'cites', count: 1 },
      ],
      unlabelled: 2,
    })
  })
})
