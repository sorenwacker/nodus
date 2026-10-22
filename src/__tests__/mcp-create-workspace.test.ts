/**
 * create_workspace over MCP (PRODUCT_DESIGN.md > MCP Server > Creating a workspace)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMcpMessageHandler, type McpStoreInterface } from '../mcp/messageHandler'
import { appMcpStore, type AppMcpStoreDeps } from '../mcp/appStore'
import { JsonRpcErrorCodes } from '../mcp/types'
import { cleanWorkspaceName } from '../lib/workspaceName'
import { NODUS_TOOLS } from '../../packages/nodus-mcp-server/src/tools'

function makeFakeStore() {
  const workspaces = [
    { id: 'default', name: 'Default', current: true },
    { id: 'ws-research', name: 'Research', current: false },
  ]
  const createWorkspace = vi.fn(async (name: string) => {
    const created = { id: 'ws-new', name }
    workspaces.push({ ...created, current: false })
    return created
  })
  const store = {
    getWorkspaces: () => workspaces,
    createWorkspace,
  } as unknown as McpStoreInterface
  return { store, createWorkspace }
}

describe('MCP create_workspace', () => {
  let createWorkspace: ReturnType<typeof vi.fn>
  let handler: ReturnType<typeof createMcpMessageHandler>

  beforeEach(() => {
    const fake = makeFakeStore()
    createWorkspace = fake.createWorkspace
    handler = createMcpMessageHandler(fake.store)
  })

  function request(method: string, params: Record<string, unknown> = {}) {
    return { jsonrpc: '2.0' as const, id: 1, method, params }
  }

  it('creates the workspace and returns its id and name', async () => {
    const res = await handler.handleRequest(request('create_workspace', { name: 'Field notes' }), 'conn-a')

    expect(res.error).toBeUndefined()
    expect(res.result).toEqual({ id: 'ws-new', name: 'Field notes' })
    expect(createWorkspace).toHaveBeenCalledWith('Field notes')
  })

  it('lists the new workspace afterwards', async () => {
    await handler.handleRequest(request('create_workspace', { name: 'Field notes' }), 'conn-a')

    const listed = await handler.handleRequest(request('list_workspaces'), 'conn-a')
    expect((listed.result as Array<{ name: string }>).map(w => w.name)).toContain('Field notes')
  })

  it('leaves the open workspace and the connection scope unchanged', async () => {
    await handler.handleRequest(request('create_workspace', { name: 'Field notes' }), 'conn-a')

    const info = await handler.handleRequest(request('get_workspace'), 'conn-a')
    expect(info.result).toEqual({ scoped: false, workspace: 'Default' })
  })

  it('passes the sanitized name to the store', async () => {
    const res = await handler.handleRequest(
      request('create_workspace', { name: '  <b>Field</b> notes\u0007 ' }),
      'conn-a'
    )

    expect(createWorkspace).toHaveBeenCalledWith('Field notes')
    expect(res.result).toEqual({ id: 'ws-new', name: 'Field notes' })
  })

  it.each([
    ['an existing name', 'Research'],
    ['an existing name in another case', 'research'],
    ['an existing name once sanitized', ' <i>Research</i> '],
    ['the default workspace name', 'default'],
  ])('rejects %s', async (_label, name) => {
    const res = await handler.handleRequest(request('create_workspace', { name }), 'conn-a')

    expect(res.error?.code).toBe(JsonRpcErrorCodes.INVALID_PARAMS)
    expect(res.error?.message).toContain('already exists')
    expect(createWorkspace).not.toHaveBeenCalled()
  })

  it.each([
    ['a missing name', {}],
    ['a non-string name', { name: 42 }],
    ['an empty name', { name: '' }],
    ['a name of whitespace only', { name: '   ' }],
    ['a name that is empty once sanitized', { name: '<script></script>' }],
  ])('rejects %s', async (_label, params) => {
    const res = await handler.handleRequest(request('create_workspace', params), 'conn-a')

    expect(res.error?.code).toBe(JsonRpcErrorCodes.INVALID_PARAMS)
    expect(createWorkspace).not.toHaveBeenCalled()
  })
})

describe('create_workspace wiring', () => {
  it('is advertised by the MCP server with a required name', () => {
    const tool = NODUS_TOOLS.find(t => t.name === 'create_workspace')

    expect(tool).toBeDefined()
    expect(tool!.inputSchema.required).toEqual(['name'])
    expect(Object.keys(tool!.inputSchema.properties!)).toEqual(['name'])
  })

  it('reaches the application store through the adapter', async () => {
    const created = { id: 'ws-app', name: 'Field notes', created_at: 0 }
    const createWorkspace = vi.fn(async () => created)
    const adapter = appMcpStore({
      store: { createWorkspace },
      edgesStore: {},
      storylinesStore: {},
      invoke: vi.fn(),
    } as unknown as AppMcpStoreDeps)

    await expect(adapter.createWorkspace('Field notes')).resolves.toEqual(created)
    expect(createWorkspace).toHaveBeenCalledWith('Field notes')
  })
})

describe('cleanWorkspaceName', () => {
  it('trims, strips tags and control characters', () => {
    expect(cleanWorkspaceName('  <b>Field</b> notes\u0007 ')).toBe('Field notes')
  })

  it('truncates to 100 characters', () => {
    expect(cleanWorkspaceName('a'.repeat(150))).toHaveLength(100)
  })

  it('returns an empty string when nothing is left', () => {
    expect(cleanWorkspaceName(' <script></script> ')).toBe('')
  })
})
