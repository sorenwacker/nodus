import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMcpMessageHandler, type McpStoreInterface } from '../mcp/messageHandler'
import type { Node } from '../types'

function makeNode(id: string, content: string | null, tags: string | null = null): Node {
  return {
    id,
    title: 'Alpha',
    file_path: null,
    markdown_content: content,
    node_type: 'note',
    canvas_x: 0,
    canvas_y: 0,
    width: 200,
    height: 120,
    z_index: 0,
    frame_id: null,
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

describe('MCP node metadata (dates and tags)', () => {
  let node: Node
  let createNode: ReturnType<typeof vi.fn>
  let updateNodeContent: ReturnType<typeof vi.fn>
  let updateNodeTags: ReturnType<typeof vi.fn>
  let handler: ReturnType<typeof createMcpMessageHandler>

  beforeEach(() => {
    node = makeNode('n1', '---\ndate: 100\n---\nBody', '["old"]')
    createNode = vi.fn(async () => makeNode('new', null))
    updateNodeContent = vi.fn().mockResolvedValue(undefined)
    updateNodeTags = vi.fn().mockResolvedValue(undefined)
    const store = {
      getFilteredNodes: () => [node],
      getFilteredEdges: () => [],
      getNode: (id: string) => (id === 'n1' ? node : undefined),
      getAllNodes: () => [node],
      getAllFrames: () => [],
      getWorkspaces: () => [{ id: 'default', name: 'Default', current: true }],
      loadWorkspaceEdges: vi.fn(async () => []),
      createEdgeRaw: vi.fn(),
      deleteEdgeRaw: vi.fn(),
      createNode,
      updateNodeContent,
      updateNodeTags,
      updateNodeTitle: vi.fn(),
      getFilteredFrames: () => [],
      getFrame: () => undefined,
    } as unknown as McpStoreInterface
    handler = createMcpMessageHandler(store)
  })

  function request(method: string, params: Record<string, unknown>) {
    return { jsonrpc: '2.0' as const, id: 1, method, params }
  }

  it('creates nodes with date frontmatter and tags', async () => {
    await handler.handleRequest(
      request('create_node', {
        title: 'Event',
        content: 'Something happened',
        date: '20 BC',
        date_end: 'AD 14',
        tags: ['rome'],
      }),
      'conn'
    )
    expect(createNode).toHaveBeenCalledWith(
      expect.objectContaining({
        markdown_content: '---\ndate: 20 BC\ndate_end: AD 14\n---\nSomething happened',
        tags: ['rome'],
      })
    )
  })

  it('updates the date without touching the body', async () => {
    await handler.handleRequest(
      request('update_node', { id: 'n1', updates: { date: '200' } }),
      'conn'
    )
    expect(updateNodeContent).toHaveBeenCalledWith('n1', '---\ndate: 200\n---\nBody')
  })

  it('clears a date with an empty string and replaces tags', async () => {
    await handler.handleRequest(
      request('update_node', { id: 'n1', updates: { date: '', tags: ['fresh'] } }),
      'conn'
    )
    expect(updateNodeContent).toHaveBeenCalledWith('n1', 'Body')
    expect(updateNodeTags).toHaveBeenCalledWith('n1', ['fresh'])
  })

  it('exposes date fields on reads', async () => {
    const res = await handler.handleRequest(request('get_node', { id: 'n1' }), 'conn')
    expect(res.result).toMatchObject({ id: 'n1', date: '100', tags: ['old'] })
  })
})
