/**
 * A tool the prompt documents can be called
 * (PRODUCT_DESIGN.md > Tool reachability).
 *
 * The system prompt described five tools to the model in detail that no mode
 * offered - instructing it to call tools that were stripped from the request.
 * Exposure itself is enforced at registration (tool-declaration.test.ts); this
 * gate keeps the prompt honest about it.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { toolRegistry, AGENT_TOOL_MODES } from '../llm/registry'
import { registerCoreTools } from '../llm/tools'

registerCoreTools()

function exposedNames(): Set<string> {
  const names = new Set<string>()
  for (const mode of AGENT_TOOL_MODES) {
    for (const tool of toolRegistry.getToolsForMode(mode)) names.add(tool.function.name)
  }
  return names
}

describe('tool reachability', () => {
  it('never leaves a tool the system prompt documents unreachable', () => {
    const prompt = readFileSync(
      resolve(__dirname, '../canvas/composables/agent/systemPrompt.ts'),
      'utf-8'
    )
    const exposed = exposedNames()

    const promised = toolRegistry
      .getToolDefinitions()
      .map(t => t.function.name)
      .filter(name => new RegExp(`(^|[^a-z_])${name}\\(`).test(prompt))

    const broken = promised.filter(name => !exposed.has(name))
    expect(broken, 'documented to the model but stripped from the request').toEqual([])
  })

  it('keeps the unexposed tools honest: none is also offered', () => {
    const exposed = exposedNames()
    const contradictions = toolRegistry
      .getToolDefinitions()
      .map(t => t.function.name)
      .filter(name => toolRegistry.declarationOf(name)?.unexposedReason && exposed.has(name))

    expect(contradictions).toEqual([])
  })
})
