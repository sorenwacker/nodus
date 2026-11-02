/**
 * The add_to_zotero tool (PRODUCT_DESIGN.md > Adding to Zotero from an agent).
 *
 * "Add to Zotero" existed only as a context-menu action, so an agent that had
 * collected references could not put them in the library. The tool is that
 * action on both agent surfaces, and all three go through one function.
 */
import { describe, it, expect, vi } from 'vitest'
import { ref } from 'vue'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createMcpMessageHandler, type McpStoreInterface, type McpZoteroInterface } from '../mcp/messageHandler'
import { JsonRpcErrorCodes } from '../mcp/types'
import { canvasMcpAccess, type McpCanvas } from '../mcp/appStore'
import { NODUS_TOOLS } from '../../packages/nodus-mcp-server/src/tools'
import { toolRegistry, type ToolContext } from '../llm/registry'
import { registerCoreTools } from '../llm/tools'
import { getAgentMode } from '../llm/agentModes'
import { useCanvasZotero } from '../canvas/composables/util/useCanvasZotero'
import type { Node } from '../types'

const addNodesToLibrary = vi.hoisted(() => vi.fn())
vi.mock('../composables/useZotero', () => ({
  useZotero: () => ({ addNodesToZotero: addNodesToLibrary }),
}))

registerCoreTools()

const node = (id: string, title: string, content: string | null): Node =>
  ({ id, title, markdown_content: content, node_type: 'citation' }) as unknown as Node

const papers = [node('p1', 'Paper one', 'doi: 10.1/one'), node('p2', 'Paper two', 'doi: 10.1/two')]
const report = { added: 2, duplicates: 0, skipped: 0, errors: [] as string[] }

describe('add_to_zotero over MCP', () => {
  const store = { getNode: (id: string) => papers.find(n => n.id === id) } as unknown as McpStoreInterface

  function handlerWith(zotero?: McpZoteroInterface) {
    return createMcpMessageHandler(store, undefined, undefined, zotero)
  }
  const call = (handler: ReturnType<typeof handlerWith>, params: unknown) =>
    handler.handleRequest({ jsonrpc: '2.0', id: 1, method: 'add_to_zotero', params } as never)

  it('is declared with the node ids as its one required argument', () => {
    const tool = NODUS_TOOLS.find(t => t.name === 'add_to_zotero')
    expect(tool?.inputSchema.required).toEqual(['node_ids'])
    expect(tool?.inputSchema.properties?.node_ids).toMatchObject({ type: 'array', items: { type: 'string' } })
  })

  it('adds the named nodes and returns the counts', async () => {
    const addNodes = vi.fn(async () => report)
    const response = await call(handlerWith({ addNodes }), { node_ids: ['p1', 'p2'] })
    expect(addNodes).toHaveBeenCalledWith(papers)
    expect(response.result).toEqual(report)
  })

  it('reports an id that names no node and adds the others', async () => {
    const addNodes = vi.fn(async () => ({ ...report, added: 1 }))
    const response = await call(handlerWith({ addNodes }), { node_ids: ['p1', 'gone'] })
    expect(addNodes).toHaveBeenCalledWith([papers[0]])
    expect(response.result).toEqual({ added: 1, duplicates: 0, skipped: 0, errors: ['Node not found: gone'] })
  })

  it('sends nothing to Zotero when no id names a node', async () => {
    const addNodes = vi.fn(async () => report)
    const response = await call(handlerWith({ addNodes }), { node_ids: ['gone'] })
    expect(addNodes).not.toHaveBeenCalled()
    expect(response.result).toEqual({ added: 0, duplicates: 0, skipped: 0, errors: ['Node not found: gone'] })
  })

  it.each([[{}], [{ node_ids: [] }], [{ node_ids: 'p1' }], [{ node_ids: [1] }]])('refuses %j as invalid parameters', async params => {
    const response = await call(handlerWith({ addNodes: vi.fn() }), params)
    expect(response.error?.code).toBe(JsonRpcErrorCodes.INVALID_PARAMS)
  })

  it('says so when the application supplies no Zotero access', async () => {
    const response = await call(handlerWith(undefined), { node_ids: ['p1'] })
    expect(response.error?.message).toMatch(/Zotero/)
  })
})

describe('add_to_zotero for the in-app agent', () => {
  const context = (addNodesToZotero?: ToolContext['addNodesToZotero']) =>
    ({ store: { filteredNodes: papers }, log: () => {}, addNodesToZotero }) as unknown as ToolContext

  it('is offered in execute mode', () => {
    expect(toolRegistry.has('add_to_zotero')).toBe(true)
    expect(getAgentMode('execute').toolWhitelist).toContain('add_to_zotero')
  })

  it('adds the named nodes and reports the counts', async () => {
    const addNodes = vi.fn(async () => ({ added: 1, duplicates: 1, skipped: 0, errors: [] }))
    const result = await toolRegistry.execute('add_to_zotero', { node_ids: ['p1', 'p2', 'gone'] }, context(addNodes))
    expect(addNodes).toHaveBeenCalledWith(papers)
    expect(result).toMatch(/Added 1/)
    expect(result).toMatch(/1 already in the library/)
    expect(result).toMatch(/Node not found: gone/)
  })

  it('says the capability is unavailable where the application does not supply it', async () => {
    const result = await toolRegistry.execute('add_to_zotero', { node_ids: ['p1'] }, context(undefined))
    expect(result).toMatch(/not available/i)
  })
})

describe('the one function behind the menu action and both tools', () => {
  function canvasZotero(affected: string[]) {
    const showToast = vi.fn()
    const zotero = useCanvasZotero({
      store: { getNode: (id: string) => papers.find(n => n.id === id) },
      getAffectedNodeIds: () => affected,
      showToast,
    })
    return { zotero, showToast }
  }

  it('adds nodes, shows the toast and returns the counts', async () => {
    addNodesToLibrary.mockResolvedValueOnce({ added: 2, duplicates: 0, skipped: 0, errors: [], cancelled: false })
    const { zotero, showToast } = canvasZotero([])
    expect(await zotero.addNodesToZotero(papers)).toEqual(report)
    expect(showToast).toHaveBeenCalledWith('Added 2 item(s) to Zotero', 'success')
  })

  it('is what the menu action calls', async () => {
    addNodesToLibrary.mockClear()
    addNodesToLibrary.mockResolvedValueOnce({ added: 1, duplicates: 0, skipped: 0, errors: [], cancelled: false })
    const { zotero, showToast } = canvasZotero(['p2'])
    await zotero.handleAddToZotero()
    expect(addNodesToLibrary).toHaveBeenCalledWith([papers[1]])
    expect(showToast).toHaveBeenCalledWith('Added 1 item(s) to Zotero', 'success')
  })

  it('is what the canvas hands to the in-app agent and to the MCP server', () => {
    const read = (path: string) => readFileSync(resolve(__dirname, '..', path), 'utf8')
    const canvas = read('canvas/GraphCanvas.vue')
    expect(canvas).toMatch(/useCanvasZotero\(/)
    expect(canvas).toMatch(/buildAgentToolContext\(\{[^}]*addNodesToZotero/s)
    expect(canvas).toMatch(/defineExpose\(\{[^}]*addNodesToZotero/s)
    expect(read('App.vue')).toMatch(/\.\.\.canvasMcpAccess\(graphCanvasRef\)/)
  })

  it('reaches the canvas when an MCP request arrives, and says so when the canvas is not open', async () => {
    const addNodesToZotero = vi.fn(async () => report)
    const canvas = ref<McpCanvas | null>(null)
    const { zotero } = canvasMcpAccess(canvas)
    await expect(zotero.addNodes(papers)).rejects.toThrow(/canvas is not open/)
    canvas.value = { addNodesToZotero, focusNode: () => {}, getViewport: () => ({ x: 0, y: 0, zoom: 1 }) }
    expect(await zotero.addNodes(papers)).toEqual(report)
    expect(addNodesToZotero).toHaveBeenCalledWith(papers)
  })
})
