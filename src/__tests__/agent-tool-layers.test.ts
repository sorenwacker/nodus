/**
 * One layer answers a tool call.
 *
 * The canvas tries the registry, then the marker handlers, then the
 * LLM-dependent dispatcher, and takes the first real answer. Four tools had a
 * real handler in the registry AND a case in the dispatcher, so the case could
 * never run - and the unreachable copy was the one later edits were made
 * against (PRODUCT_DESIGN.md > One implementation per tool).
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { toolRegistry } from '../llm/registry'
import { registerCoreTools } from '../llm/tools'

registerCoreTools()

const TOOLS_DIR = resolve(__dirname, '../llm/tools')
const toolsSource = readdirSync(TOOLS_DIR)
  .filter(f => f.endsWith('.ts'))
  .map(f => readFileSync(join(TOOLS_DIR, f), 'utf-8'))
  .join('\n')

const dispatcherSource = readFileSync(
  resolve(__dirname, '../canvas/composables/agent/useLLMTools.ts'),
  'utf-8'
)

function dispatcherCases(): string[] {
  return [...dispatcherSource.matchAll(/^ {6}case '([a-z_]+)':/gm)].map(m => m[1])
}

describe('the layer that answers a tool call', () => {
  it('finds the cases in the LLM-dependent dispatcher', () => {
    expect(dispatcherCases().length).toBeGreaterThan(4)
  })

  it('is one layer: a case here means the registry hands the call on', () => {
    const registered = new Set(toolRegistry.getToolDefinitions().map(t => t.function.name))
    const shadowed = dispatcherCases().filter(
      name => registered.has(name) && !toolsSource.includes(`__UNHANDLED__:${name}`)
    )

    expect(shadowed, 'the registry answers first, so these cases can never run').toEqual([])
  })
})

describe('the tool that walks the nodes', () => {
  it('matches the filter against content as well as title', async () => {
    const updated: string[] = []
    const ctx = {
      store: {
        filteredNodes: [
          { id: '1', title: 'Alpha', markdown_content: 'mentions beta' },
          { id: '2', title: 'Gamma', markdown_content: 'nothing here' },
        ],
        updateNodeContent: async (id: string) => {
          updated.push(id)
        },
      },
      log: () => {},
    } as never

    await toolRegistry.execute('for_each_node', { filter: 'beta', action: 'set', template: 'x' }, ctx)

    expect(updated, 'a search term only in the body matched nothing').toEqual(['1'])
  })
})
