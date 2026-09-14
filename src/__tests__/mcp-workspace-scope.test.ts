import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMcpMessageHandler, type McpStoreInterface } from '../mcp/messageHandler'
import type { Node, Edge } from '../types'

function makeNode(id: string, title: string, workspaceId: string | null): Node {
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
    frame_id: null,
    color_theme: null,
    is_collapsed: false,
    tags: null,
    workspace_id: workspaceId,
    checksum: null,
    created_at: 0,
    updated_at: 0,
    deleted_at: null,
  }
}

const researchEdge: Edge = {
  id: 'e-research',
  source_node_id: 'r1',
  target_node_id: 'r2',
  label: null,
  link_type: 'related',
  weight: 1,
  color: null,
  storyline_id: null,
  created_at: 0,
  directed: true,
}

function makeFakeStore() {
  const allNodes = [
    makeNode('c1', 'Current one', null),
    makeNode('r1', 'Research one', 'ws-research'),
    makeNode('r2', 'Research two', 'ws-research'),
  ]
  const createNode = vi.fn(async (data: { title: string; workspace_id?: string }) =>
    makeNode('new', data.title, data.workspace_id ?? null)
  )
  const loadWorkspaceEdges = vi.fn(async (workspaceId: string | null) =>
    workspaceId === 'ws-research' ? [researchEdge] : []
  )
  const allFrames = [
    { id: 'f-open', title: 'Open frame', workspace_id: null },
    { id: 'f-research', title: 'Research frame', workspace_id: 'ws-research' },
  ]
  const allStorylines = [
    { id: 's-open', title: 'Open storyline', workspace_id: null },
    { id: 's-research', title: 'Research storyline', workspace_id: 'ws-research' },
  ]
  const createFrame = vi.fn()
  const createStoryline = vi.fn(async (title: string) => ({ id: 'new-storyline', title }))

  const store = {
    // Unscoped view follows the open (default) workspace
    getFilteredNodes: () => allNodes.filter(n => n.workspace_id === null),
    getFilteredEdges: () => [] as Edge[],
    getNode: (id: string) => allNodes.find(n => n.id === id),
    getAllNodes: () => allNodes,
    getAllFrames: () => allFrames,
    getAllStorylines: () => allStorylines,
    createFrame,
    // The app's own views, which follow the workspace the user has open
    getFilteredStorylines: () => allStorylines.filter(s => s.workspace_id === null),
    getStoryline: (id: string) =>
      allStorylines.filter(s => s.workspace_id === null).find(s => s.id === id),
    createStoryline,
    getWorkspaces: () => [
      { id: 'default', name: 'Default', current: true },
      { id: 'ws-research', name: 'Research', current: false },
    ],
    loadWorkspaceEdges,
    createEdgeRaw: vi.fn(),
    deleteEdgeRaw: vi.fn(),
    createNode,
    getFilteredFrames: () => allFrames.filter(f => f.workspace_id === null),
    getFrame: (id: string) =>
      allFrames.filter(f => f.workspace_id === null).find(f => f.id === id),
  } as unknown as McpStoreInterface
  return { store, createNode, loadWorkspaceEdges, createFrame, createStoryline }
}

describe('MCP workspace scoping', () => {
  let store: McpStoreInterface
  let createNode: ReturnType<typeof vi.fn>
  let createFrame: ReturnType<typeof vi.fn>
  let createStoryline: ReturnType<typeof vi.fn>
  let handler: ReturnType<typeof createMcpMessageHandler>

  beforeEach(() => {
    const fake = makeFakeStore()
    store = fake.store
    createNode = fake.createNode
    createFrame = fake.createFrame
    createStoryline = fake.createStoryline
    handler = createMcpMessageHandler(store)
  })

  function request(method: string, params: Record<string, unknown> = {}, id = 1) {
    return { jsonrpc: '2.0' as const, id, method, params }
  }

  it('lists workspaces with the current one marked', async () => {
    const res = await handler.handleRequest(request('list_workspaces'), 'conn-a')
    expect(res.result).toEqual([
      { id: 'default', name: 'Default', current: true },
      { id: 'ws-research', name: 'Research', current: false },
    ])
  })

  it('scopes reads to the set workspace, per connection', async () => {
    await handler.handleRequest(request('set_workspace', { workspace: 'Research' }), 'conn-a')

    const scoped = await handler.handleRequest(request('list_nodes'), 'conn-a')
    const titles = (scoped.result as Array<{ title: string }>).map(n => n.title)
    expect(titles).toEqual(['Research one', 'Research two'])

    // A different connection still follows the open workspace
    const unscoped = await handler.handleRequest(request('list_nodes'), 'conn-b')
    expect((unscoped.result as Array<{ title: string }>).map(n => n.title)).toEqual([
      'Current one',
    ])
  })

  it('creates nodes in the scoped workspace', async () => {
    await handler.handleRequest(request('set_workspace', { workspace: 'ws-research' }), 'conn-a')
    await handler.handleRequest(
      request('create_node', { title: 'Agent note', x: 0, y: 0 }),
      'conn-a'
    )
    expect(createNode).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Agent note', workspace_id: 'ws-research' })
    )
  })

  it('serves the scoped workspace edges', async () => {
    await handler.handleRequest(request('set_workspace', { workspace: 'Research' }), 'conn-a')
    const res = await handler.handleRequest(request('get_edges'), 'conn-a')
    expect((res.result as Edge[]).map(e => e.id)).toEqual(['e-research'])
  })

  it('creates frames in the scoped workspace', async () => {
    await handler.handleRequest(request('set_workspace', { workspace: 'Research' }), 'conn-a')
    await handler.handleRequest(request('create_frame', { title: 'Agent frame' }), 'conn-a')

    // The workspace is the sixth argument the frames store takes
    expect(createFrame).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything(),
      'Agent frame',
      'ws-research'
    )
  })

  it('lists the scoped workspace storylines, not the open one', async () => {
    await handler.handleRequest(request('set_workspace', { workspace: 'Research' }), 'conn-a')

    const res = await handler.handleRequest(request('list_storylines'), 'conn-a')
    const titles = (res.result as Array<{ title: string }>).map(s => s.title)

    expect(titles).toEqual(['Research storyline'])
  })

  it('creates storylines in the scoped workspace', async () => {
    await handler.handleRequest(request('set_workspace', { workspace: 'Research' }), 'conn-a')
    await handler.handleRequest(
      request('create_storyline', { title: 'Agent storyline' }),
      'conn-a'
    )

    expect(createStoryline).toHaveBeenCalledWith(
      'Agent storyline',
      undefined,
      undefined,
      'ws-research'
    )
  })

  it('rejects unknown workspaces and reports scope via get_workspace', async () => {
    const bad = await handler.handleRequest(
      request('set_workspace', { workspace: 'nope' }),
      'conn-a'
    )
    expect(bad.error).toBeDefined()

    await handler.handleRequest(request('set_workspace', { workspace: 'Research' }), 'conn-a')
    const info = await handler.handleRequest(request('get_workspace'), 'conn-a')
    expect(info.result).toEqual({ scoped: true, workspace: 'Research' })

    handler.handleConnectionClosed('conn-a')
    const after = await handler.handleRequest(request('get_workspace'), 'conn-a')
    expect(after.result).toEqual({ scoped: false, workspace: 'Default' })
  })
})
