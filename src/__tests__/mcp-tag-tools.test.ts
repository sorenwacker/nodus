/**
 * Tags are listed with their tag nodes, and tag nodes can be rebuilt, over MCP.
 *
 * After deleting one tag node a client could not tell what else had changed,
 * and could not put the tag layer back other than by guessing
 * (PRODUCT_DESIGN.md > Tag nodes over MCP).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMcpMessageHandler, type McpStoreInterface } from '../mcp/messageHandler'
import { JsonRpcErrorCodes } from '../mcp/types'
import type { Edge, Node } from '../types'

function makeNode(id: string, title: string, tags: string | null, nodeType = 'note', workspaceId: string | null = null): Node {
  return {
    id,
    title,
    file_path: null,
    markdown_content: null,
    node_type: nodeType,
    canvas_x: 0,
    canvas_y: 0,
    width: 200,
    height: 120,
    z_index: 0,
    color_theme: null,
    is_collapsed: false,
    tags,
    workspace_id: workspaceId,
    checksum: null,
    created_at: 0,
    updated_at: 0,
    deleted_at: null,
  }
}

function makeEdge(id: string, source: string, target: string, linkType = 'tagged'): Edge {
  return {
    id,
    source_node_id: source,
    target_node_id: target,
    label: null,
    link_type: linkType,
    weight: 1,
    color: null,
    storyline_id: null,
    created_at: 0,
    directed: true,
  }
}

const REPORT = { merged: 1, renamed: 0, removed_unused: 2, edges_repointed: 3, edges_deleted: 0, edges_added: 4 }

describe('tag tools over MCP', () => {
  const nodes = [
    makeNode('a', 'Alpha', '["person","Place"]'),
    makeNode('b', 'Beta', '["#person"]'),
    makeNode('T', '#person', null, 'tag'),
    makeNode('U', '#orphan', null, 'tag'),
    makeNode('r', 'Research note', '["lab"]', 'note', 'ws-r'),
  ]
  const edges = [makeEdge('e1', 'a', 'T'), makeEdge('e2', 'b', 'T'), makeEdge('e3', 'a', 'b', 'related')]
  let rebuildTagNodes: ReturnType<typeof vi.fn>
  let handler: ReturnType<typeof createMcpMessageHandler>

  beforeEach(() => {
    rebuildTagNodes = vi.fn().mockResolvedValue(REPORT)
    const store = {
      getFilteredNodes: () => nodes.filter(n => !n.workspace_id),
      getFilteredEdges: () => edges,
      getNode: (id: string) => nodes.find(n => n.id === id),
      getAllNodes: () => nodes,
      getAllStorylines: () => [],
      getWorkspaces: () => [
        { id: 'default', name: 'Default', current: true },
        { id: 'ws-r', name: 'Research', current: false },
      ],
      loadWorkspaceEdges: vi.fn(async () => []),
      rebuildTagNodes,
    } as unknown as McpStoreInterface
    handler = createMcpMessageHandler(store)
  })

  function call(method: string, params: Record<string, unknown> = {}, conn = 'conn') {
    return handler.handleRequest({ jsonrpc: '2.0' as const, id: 1, method, params }, conn)
  }

  it('lists every tag with its note count, its tag node and the edges at it, most used first', async () => {
    const res = await call('list_tags')
    expect(res.result).toEqual({
      tags: [
        { tag: 'person', notes: 2, node_id: 'T', edges: 2 },
        { tag: 'place', notes: 1, node_id: null, edges: 0 },
        { tag: 'orphan', notes: 0, node_id: 'U', edges: 0 },
      ],
    })
  })

  it('rebuilds the tag nodes and reports what changed', async () => {
    const res = await call('rebuild_tag_nodes')
    expect(rebuildTagNodes).toHaveBeenCalledTimes(1)
    expect(res.result).toEqual(REPORT)
  })

  it('refuses to rebuild for a connection scoped to a workspace that is not open', async () => {
    await call('set_workspace', { workspace: 'Research' }, 'scoped')
    const res = await call('rebuild_tag_nodes', {}, 'scoped')

    expect(rebuildTagNodes).not.toHaveBeenCalled()
    expect(res.error?.code).toBe(JsonRpcErrorCodes.INVALID_PARAMS)
    expect(res.error?.message).toContain('Research')
    expect(res.error?.message).toContain('Default')
  })

  it('rebuilds for a connection scoped to the workspace that is open', async () => {
    await call('set_workspace', { workspace: 'Default' }, 'scoped')
    const res = await call('rebuild_tag_nodes', {}, 'scoped')

    expect(rebuildTagNodes).toHaveBeenCalledTimes(1)
    expect(res.result).toEqual(REPORT)
  })
})
