import { describe, it, expect } from 'vitest'
import { toolRegistry, type ToolContext } from '../llm/registry'
import { registerCoreTools } from '../llm/tools'
import { cleanContent } from '../llm/utils'

// Every tool is answered by its registered handler; a tool whose service the
// context lacks says so rather than pretending to run
// (PRODUCT_DESIGN.md > One implementation per tool)
describe('tools that need the model', () => {
  const ctx = {
    log: () => {},
    store: { filteredNodes: [{ id: '1', title: 'A' }], filteredEdges: [] },
  } as unknown as ToolContext

  it.each([
    ['smart_move', { instruction: 'move cars left, animals right' }],
    ['smart_connect', { groups: 'animals, car brands' }],
    ['web_search', { query: 'graph databases' }],
  ])('%s names the service it is missing instead of handing the call on', async (name, args) => {
    registerCoreTools()
    const { text, signal } = await toolRegistry.execute(name, args, ctx)
    expect(text).toMatch(/not available in this context/)
    expect(text).not.toMatch(/^__/)
    expect(signal).toBeUndefined()
  })
})

describe('the tool that walks the nodes', () => {
  it('matches the filter against content as well as title', async () => {
    registerCoreTools()
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
      llm: { generate: async () => '', isCancelled: () => false },
    } as unknown as ToolContext

    await toolRegistry.execute('for_each_node', { filter: 'beta', action: 'set', template: 'x' }, ctx)

    expect(updated, 'a search term only in the body matched nothing').toEqual(['1'])
  })
})

describe('cleanContent', () => {
  it('preserves LaTeX commands starting with n or t', () => {
    expect(cleanContent('$\\nabla f(x)$')).toBe('$\\nabla f(x)$')
    expect(cleanContent('$a \\neq b$')).toBe('$a \\neq b$')
    expect(cleanContent('$x \\times y$')).toBe('$x \\times y$')
    expect(cleanContent('$\\theta = 0$')).toBe('$\\theta = 0$')
    expect(cleanContent('\\text{speed} = 5')).toBe('\\text{speed} = 5')
  })

  it('unescapes literal escape sequences in single-line JSON-style output', () => {
    expect(cleanContent('line one\\nline two')).toBe('line one\nline two')
    expect(cleanContent('col1\\tcol2')).toBe('col1\tcol2')
  })

  it('leaves content with real newlines untouched', () => {
    const text = 'first line\nsecond line with \\nabla'
    expect(cleanContent(text)).toBe(text)
  })

  it('does not strip semicolons from code', () => {
    const code = 'const x = 1;\nconst y = 2;'
    expect(cleanContent(code)).toBe(code)
  })
})
