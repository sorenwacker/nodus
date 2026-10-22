/**
 * An edge can be created by naming its endpoints by title.
 *
 * Every small addition needed two id lookups first
 * (PRODUCT_DESIGN.md > Creating an edge by node titles).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMcpMessageHandler, type McpStoreInterface } from '../mcp/messageHandler'
import { JsonRpcErrorCodes } from '../mcp/types'
import type { Node } from '../types'

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

describe('create_edge by title', () => {
  const nodes = [makeNode('a', 'Alpha'), makeNode('b', 'Beta'), makeNode('g1', 'Gamma'), makeNode('g2', 'gamma')]
  let createEdge: ReturnType<typeof vi.fn>
  let handler: ReturnType<typeof createMcpMessageHandler>

  beforeEach(() => {
    createEdge = vi.fn(async () => ({ id: 'e-new' }))
    const store = {
      getFilteredNodes: () => nodes,
      getFilteredEdges: () => [],
      getNode: (id: string) => nodes.find(n => n.id === id),
      getWorkspaces: () => [{ id: 'default', name: 'Default', current: true }],
      createEdge,
    } as unknown as McpStoreInterface
    handler = createMcpMessageHandler(store)
  })

  function call(params: Record<string, unknown>) {
    return handler.handleRequest({ jsonrpc: '2.0' as const, id: 1, method: 'create_edge', params }, 'conn')
  }

  it('resolves both ends by title, ignoring case and surrounding whitespace', async () => {
    const res = await call({ source_title: ' alpha ', target_title: 'BETA', label: 'supports' })

    expect(res.result).toEqual({ id: 'e-new' })
    expect(createEdge).toHaveBeenCalledWith(
      expect.objectContaining({ source_node_id: 'a', target_node_id: 'b', label: 'supports' })
    )
  })

  it('mixes an id and a title', async () => {
    await call({ source_node_id: 'a', target_title: 'Beta' })
    expect(createEdge).toHaveBeenCalledWith(expect.objectContaining({ source_node_id: 'a', target_node_id: 'b' }))
  })

  it('refuses a title several nodes share and lists their ids', async () => {
    const res = await call({ source_title: 'Alpha', target_title: 'Gamma' })

    expect(createEdge).not.toHaveBeenCalled()
    expect(res.error?.code).toBe(JsonRpcErrorCodes.INVALID_PARAMS)
    expect(res.error?.message).toContain('g1')
    expect(res.error?.message).toContain('g2')
  })

  it('refuses a title no node has', async () => {
    const res = await call({ source_title: 'Alpha', target_title: 'Delta' })

    expect(createEdge).not.toHaveBeenCalled()
    expect(res.error?.code).toBe(JsonRpcErrorCodes.INVALID_PARAMS)
    expect(res.error?.message).toContain('Delta')
  })

  it('refuses an end given neither by id nor by title', async () => {
    const res = await call({ source_title: 'Alpha' })

    expect(createEdge).not.toHaveBeenCalled()
    expect(res.error?.code).toBe(JsonRpcErrorCodes.INVALID_PARAMS)
    expect(res.error?.message).toMatch(/target_node_id or target_title/)
  })

  it('still refuses an id no node has', async () => {
    const res = await call({ source_node_id: 'zz', target_title: 'Beta' })

    expect(createEdge).not.toHaveBeenCalled()
    expect(res.error?.code).toBe(JsonRpcErrorCodes.INVALID_PARAMS)
  })
})
