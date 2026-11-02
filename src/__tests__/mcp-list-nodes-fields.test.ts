/**
 * A node listing can be shaped by field, and nodes can be read by tag.
 *
 * A full listing of 134 notes overran the client's context, the compact form
 * lacked the degree, and there was no way to ask for the nodes carrying a tag
 * (PRODUCT_DESIGN.md > Listing nodes by field and by tag).
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { createMcpMessageHandler, type McpStoreInterface } from '../mcp/messageHandler'
import { JsonRpcErrorCodes } from '../mcp/types'
import type { Edge, Node } from '../types'

function makeNode(id: string, title: string, tags: string | null, nodeType = 'note'): Node {
  return {
    id,
    title,
    file_path: null,
    markdown_content: `Body of ${title}`,
    node_type: nodeType,
    canvas_x: 0,
    canvas_y: 0,
    width: 200,
    height: 120,
    z_index: 0,
    color_theme: null,
    is_collapsed: false,
    tags,
    workspace_id: null,
    checksum: null,
    created_at: 0,
    updated_at: 0,
    deleted_at: null,
  }
}

function makeEdge(id: string, source: string, target: string): Edge {
  return {
    id,
    source_node_id: source,
    target_node_id: target,
    label: null,
    link_type: 'related',
    weight: 1,
    color: null,
    storyline_id: null,
    created_at: 0,
    directed: true,
  }
}

describe('listing nodes by field and by tag', () => {
  const nodes = [
    makeNode('a', 'Alpha', '["Person","place"]'),
    makeNode('b', 'Beta', '["person"]'),
    makeNode('c', 'Gamma', null),
    makeNode('t', '#person', '["person"]', 'tag'),
  ]
  const edges = [makeEdge('e1', 'a', 'b'), makeEdge('e2', 'c', 'a'), makeEdge('e3', 'a', 't')]
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

  function call(method: string, params: Record<string, unknown> = {}) {
    return handler.handleRequest({ jsonrpc: '2.0' as const, id: 1, method, params }, 'conn')
  }

  it('returns only the requested fields, with the id', async () => {
    const res = await call('list_nodes', { fields: ['title', 'tags'], limit: 2 })
    expect(res.result).toEqual([
      { id: 'a', title: 'Alpha', tags: ['Person', 'place'] },
      { id: 'b', title: 'Beta', tags: ['person'] },
    ])
  })

  it('computes the degree over both ends of the edges', async () => {
    const res = await call('list_nodes', { fields: ['degree'] })
    expect(res.result).toEqual([
      { id: 'a', degree: 3 },
      { id: 'b', degree: 1 },
      { id: 'c', degree: 1 },
      { id: 't', degree: 1 },
    ])
  })

  it('returns the content when it is a requested field', async () => {
    const res = await call('list_nodes', { fields: ['markdown_content'], limit: 1 })
    expect(res.result).toEqual([{ id: 'a', markdown_content: 'Body of Alpha' }])
  })

  it('rejects a field the node does not have and names the known ones', async () => {
    const res = await call('list_nodes', { fields: ['title', 'colour'] })
    expect(res.error?.code).toBe(JsonRpcErrorCodes.INVALID_PARAMS)
    expect(res.error?.message).toContain('colour')
    expect(res.error?.message).toContain('degree')
  })

  it('leaves the listing unchanged without fields', async () => {
    const res = await call('list_nodes', { limit: 1 })
    expect(res.result).toEqual([
      expect.objectContaining({ id: 'a', title: 'Alpha', node_type: 'note', canvas_x: 0, width: 200 }),
    ])
    expect((res.result as Record<string, unknown>[])[0]).not.toHaveProperty('markdown_content')
  })

  it('finds the nodes carrying a tag, ignoring the hash and the case, and skips tag nodes', async () => {
    const res = await call('get_nodes_by_tag', { tag: '#PERSON' })
    expect(res.result).toEqual([
      { id: 'a', title: 'Alpha', tags: ['Person', 'place'] },
      { id: 'b', title: 'Beta', tags: ['person'] },
    ])
  })

  it('shapes the nodes of a tag by the same fields', async () => {
    const res = await call('get_nodes_by_tag', { tag: 'place', fields: ['degree'] })
    expect(res.result).toEqual([{ id: 'a', degree: 3 }])
  })

  it('requires a tag', async () => {
    const res = await call('get_nodes_by_tag', {})
    expect(res.error?.code).toBe(JsonRpcErrorCodes.INVALID_PARAMS)
  })
})
