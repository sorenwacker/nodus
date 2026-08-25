/**
 * Every registered tool reaches a model, or says why not
 * (PRODUCT_DESIGN.md > Tool reachability).
 *
 * 27 of 71 registered tools were exposed by no mode, and the system prompt
 * documented five of them to the model in detail - instructing it to call
 * tools that were stripped from the request.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { toolRegistry } from '../llm/registry'
import { registerCoreTools } from '../llm/tools'
import { getAgentMode, UNEXPOSED_TOOLS } from '../llm/agentModes'
import type { AgentMode } from '../llm/types'

registerCoreTools()

const NODE_AGENT_TOOLS = (() => {
  const src = readFileSync(
    resolve(__dirname, '../canvas/composables/agent/useNodeAgent.ts'),
    'utf-8'
  )
  return new Set([...src.matchAll(/'([a-z_]+)'/g)].map(m => m[1]))
})()

function exposedNames(): Set<string> {
  const names = new Set<string>()
  for (const mode of ['explore', 'plan', 'execute'] as AgentMode[]) {
    for (const name of getAgentMode(mode).toolWhitelist) names.add(name)
  }
  for (const name of NODE_AGENT_TOOLS) names.add(name)
  return names
}

describe('tool reachability', () => {
  it('exposes every registered tool, or lists it as deliberately unexposed', () => {
    const registered = toolRegistry.getToolDefinitions().map(t => t.function.name)
    const exposed = exposedNames()

    const unreachable = registered.filter(
      name => !exposed.has(name) && !UNEXPOSED_TOOLS.has(name)
    )

    expect(unreachable, 'registered but reachable from no agent surface').toEqual([])
  })

  it('never leaves a tool the system prompt documents unreachable', () => {
    // Documenting a tool the request does not contain tells the model to call
    // something that cannot exist
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

  it('keeps the unexposed ledger honest: nothing listed there is also exposed', () => {
    const exposed = exposedNames()
    const contradictions = [...UNEXPOSED_TOOLS].filter(name => exposed.has(name))

    expect(contradictions).toEqual([])
  })
})
