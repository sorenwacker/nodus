/**
 * A tool is one registry entry: definition, declaration, handler
 * (PRODUCT_DESIGN.md > One implementation per tool, Tool signals,
 * A tool declares its modes).
 *
 * A call used to pass through four mechanisms - the registry, string-marker
 * handlers, a second registry and a switch in the canvas - and its modes lived
 * in hand-written name lists beside them. These gates fail when any of that
 * comes back.
 */
import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import {
  toolRegistry,
  defineTool,
  ToolRegistry,
  AGENT_TOOL_MODES,
  type ToolContext,
} from '../llm/registry'
import { registerCoreTools } from '../llm/tools'
import { getAgentMode } from '../llm/agentModes'

registerCoreTools()

const SRC = resolve(__dirname, '..')
const AGENT_DIR = join(SRC, 'canvas/composables/agent')

function sourcesUnder(dir: string): Array<{ file: string; text: string }> {
  return readdirSync(dir, { recursive: true, encoding: 'utf-8' })
    .filter(f => /\.(ts|vue)$/.test(f))
    .map(f => ({ file: join(dir, f), text: readFileSync(join(dir, f), 'utf-8') }))
}

const registeredNames = () => toolRegistry.getToolDefinitions().map(t => t.function.name)

/** A context with no optional service, so every requirement is unmet. */
function bareContext(): ToolContext {
  return {
    store: {
      filteredNodes: [],
      filteredEdges: [],
      createNode: async () => { throw new Error('unused') },
      createEdge: async () => { throw new Error('unused') },
      deleteNode: async () => {},
      deleteEdge: async () => {},
      updateNodePosition: async () => {},
      updateNodeContent: async () => {},
      updateNodeTitle: async () => {},
    },
    log: () => {},
    screenToCanvas: (x, y) => ({ x, y }),
    snapToGrid: v => v,
    model: 'test',
    contextLength: 8192,
  }
}

describe('one implementation per tool', () => {
  it('has no second registry and no marker-handler layer', () => {
    expect(existsSync(join(SRC, 'llm/tools/handlers/index.ts'))).toBe(false)
    expect(existsSync(join(AGENT_DIR, 'useMarkerHandlers.ts'))).toBe(false)
    expect(existsSync(join(AGENT_DIR, 'useLLMTools.ts'))).toBe(false)
  })

  it('dispatches on no tool name outside the registry', () => {
    const names = registeredNames()
    const offenders: string[] = []
    for (const { file, text } of sourcesUnder(AGENT_DIR)) {
      for (const name of names) {
        if (text.includes(`case '${name}'`)) offenders.push(`${file}: case '${name}'`)
      }
    }
    expect(offenders).toEqual([])
  })

  it('never hands a call on with a string marker', async () => {
    // Source: no handler builds a `__NAME__` result
    const toolsDir = join(SRC, 'llm/tools')
    const marked = sourcesUnder(toolsDir)
      .filter(({ text }) => /['`]__[A-Z_]+__/.test(text))
      .map(({ file }) => file)
    expect(marked).toEqual([])

    // Runtime: whatever a tool answers with a bare context, it is an answer
    const ctx = bareContext()
    const leaked: string[] = []
    for (const name of registeredNames()) {
      const outcome = await toolRegistry.execute(name, {}, ctx)
      if (outcome.text.startsWith('__')) leaked.push(`${name}: ${outcome.text.slice(0, 40)}`)
    }
    expect(leaked).toEqual([])
  })

  it('reports a missing service by name instead of failing inside the handler', async () => {
    const outcome = await toolRegistry.execute('smart_move', { instruction: 'x' }, bareContext())
    expect(outcome.text).toMatch(/not available in this context/i)
    expect(outcome.text).toContain('llm')
  })
})

describe('tool signals', () => {
  it('are typed fields, not text prefixes', async () => {
    const ctx = bareContext()
    const done = await toolRegistry.execute('done', { summary: 'finished', force: true }, ctx)
    expect(done.signal).toBe('done')
    expect(done.text).not.toMatch(/^AGENT_DONE/)

    const nodeDone = await toolRegistry.execute(
      'node_done',
      { summary: 'saved' },
      { ...ctx, nodeDraft: { content: 'x', title: 't', saved: true, updateContent: async () => {}, updateTitle: async () => {} } }
    )
    expect(nodeDone.signal).toBe('node_done')
  })

  it('leaves the runner nothing to sniff', () => {
    const runner = readFileSync(join(AGENT_DIR, 'useAgentRunner.ts'), 'utf-8')
    const nodeAgent = readFileSync(join(AGENT_DIR, 'useNodeAgent.ts'), 'utf-8')
    for (const text of [runner, nodeAgent]) {
      expect(text).not.toMatch(/startsWith\(['"](AGENT_|__)/)
      expect(text).not.toMatch(/AGENT_DONE|AGENT_PAUSED|__[A-Z_]+__/)
    }
  })
})

describe('a tool declares its modes', () => {
  it('derives each mode from the declarations, and every name is a tool', () => {
    const registered = new Set(registeredNames())
    for (const mode of AGENT_TOOL_MODES) {
      const offered = toolRegistry.getToolsForMode(mode).map(t => t.function.name)
      expect(offered.length).toBeGreaterThan(0)
      for (const name of offered) expect(registered.has(name), `${mode}: ${name}`).toBe(true)
    }
  })

  it('keeps mode configuration free of tool name lists', () => {
    for (const mode of ['explore', 'plan', 'execute'] as const) {
      expect(getAgentMode(mode)).not.toHaveProperty('toolWhitelist')
    }
    const modes = readFileSync(join(SRC, 'llm/agentModes.ts'), 'utf-8')
    expect(modes).not.toMatch(/UNEXPOSED_TOOLS/)
  })

  it('offers no mutating tool in plan mode', () => {
    const planTools = toolRegistry.getToolsForMode('plan').map(t => t.function.name)
    const mutating = planTools.filter(name => toolRegistry.declarationOf(name)?.mutates)
    expect(mutating).toEqual([])
  })

  it('rejects a mutating tool that declares plan mode', () => {
    const registry = new ToolRegistry()
    expect(() =>
      registry.register(
        { name: 'bad', description: '', parameters: { type: 'object', properties: {} } },
        async () => 'x',
        { modes: ['plan'], mutates: true }
      )
    ).toThrow(/plan/)
  })

  it('rejects an unexposed tool that gives no reason', () => {
    const registry = new ToolRegistry()
    expect(() =>
      registry.register(
        { name: 'bad', description: '', parameters: { type: 'object', properties: {} } },
        async () => 'x',
        { modes: [], mutates: false }
      )
    ).toThrow(/unexposedReason/)
    expect(() =>
      registry.register(
        { name: 'ok', description: '', parameters: { type: 'object', properties: {} } },
        async () => 'x',
        { modes: [], mutates: false, unexposedReason: 'superseded by create_plan' }
      )
    ).not.toThrow()
  })

  it('exposes every registered tool, or says why not', () => {
    const unreachable = registeredNames().filter(name => {
      const decl = toolRegistry.declarationOf(name)!
      return decl.modes.length === 0 && !decl.unexposedReason
    })
    expect(unreachable).toEqual([])
  })

  it('offers, in that mode, every tool a mode prompt tells the model to call', () => {
    const broken: string[] = []
    for (const mode of ['explore', 'plan', 'execute'] as const) {
      const prompt = getAgentMode(mode).systemPromptAddition
      const offered = new Set(toolRegistry.getToolsForMode(mode).map(t => t.function.name))
      for (const name of registeredNames()) {
        if (new RegExp(`(^|[^a-z_])${name}\\(`).test(prompt) && !offered.has(name)) {
          broken.push(`${mode}: ${name}`)
        }
      }
    }
    expect(broken, 'named in a mode prompt but stripped from that mode').toEqual([])
  })

  it('offers, in node mode, every tool the node agent prompt tells the model to call', () => {
    const prompt = readFileSync(join(AGENT_DIR, 'useNodeAgent.ts'), 'utf-8')
    const offered = new Set(toolRegistry.getToolsForMode('node').map(t => t.function.name))
    const broken = registeredNames().filter(
      name => new RegExp(`- ${name}\\(`).test(prompt) && !offered.has(name)
    )
    expect(broken).toEqual([])
  })

  it('answers from the declared requirements before the handler runs', async () => {
    const outcome = await toolRegistry.execute('web_search', { query: 'x' }, bareContext())
    expect(outcome.text).toMatch(/not available in this context \(needs search\)/)
    expect(toolRegistry.declarationOf('think')?.requires ?? []).toEqual([])
  })
})

describe('defineTool', () => {
  it('requires a declaration', () => {
    // A tool without modes is the defect the declaration exists to prevent
    expect(() =>
      // @ts-expect-error - the declaration is required
      defineTool('undeclared', 'x', { type: 'object', properties: {} }, async () => 'x')
    ).toThrow()
  })
})
