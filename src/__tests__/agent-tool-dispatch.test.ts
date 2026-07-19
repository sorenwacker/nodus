import { describe, it, expect } from 'vitest'
import { toolRegistry, type ToolContext } from '../llm/registry'
import { registerCoreTools } from '../llm/tools'
import { cleanContent } from '../llm/utils'

// The canvas dispatcher (PixiCanvas.executeAgentTool) only falls through to
// the real LLM-powered implementations in useLLMTools when the registry
// returns `__UNHANDLED__:<name>`. Any other sentinel (like the former
// `__SMART_MOVE__:` markers) is returned to the model verbatim, silently
// turning the tool into a no-op.
describe('LLM-dependent tools fall through the registry', () => {
  const ctx = {
    log: () => {},
  } as unknown as ToolContext

  it.each([
    ['smart_move', { instruction: 'move cars left, animals right' }],
    ['smart_connect', { groups: 'animals, car brands' }],
    ['web_search', { query: 'graph databases' }],
  ])('%s returns __UNHANDLED__ so the dispatcher runs the real implementation', async (name, args) => {
    registerCoreTools()
    const result = await toolRegistry.execute(name, args, ctx)
    expect(result).toBe(`__UNHANDLED__:${name}`)
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
