/**
 * A question about the notes is answered, not planned
 * (PRODUCT_DESIGN.md > Answering a question).
 *
 * Every mode's instructions described building, and the default mode told the
 * model to research and draft a plan whatever the request was, so a plain
 * question set off nine tool calls.
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('../lib/storage', () => ({
  llmStorage: { getAgentPrompt: (fallback: string) => fallback },
  agentMemoryStorage: { getAgentMemory: () => ({ session: null, stack: [], facts: [] }) },
}))

import { buildSystemPrompt } from '../canvas/composables/agent/systemPrompt'
import { getModeSystemPrompt } from '../llm/agentModes'
import type { AgentMode } from '../llm/types'

const MODES: AgentMode[] = ['explore', 'plan', 'execute']

function promptFor(mode: AgentMode): string {
  return buildSystemPrompt([], [], 'workspace-1', mode).content
}

describe('the instructions for a question', () => {
  it.each(MODES)('are part of the %s mode prompt', mode => {
    const prompt = promptFor(mode)
    expect(prompt).toContain('QUESTIONS')
    expect(prompt).toMatch(/done\(summary\) with the answer/)
  })

  it.each(MODES)('come before the %s method and say they take precedence', mode => {
    const prompt = promptFor(mode)
    const rule = prompt.indexOf('QUESTIONS')
    const method = prompt.indexOf(getModeSystemPrompt(mode).trim().split('\n')[0])

    expect(method).toBeGreaterThan(-1)
    expect(rule).toBeLessThan(method)
    expect(prompt.slice(rule, method)).toMatch(/takes precedence over the mode/)
  })

  it('rule out a plan, approval, changes and unrequested web research', () => {
    const prompt = promptFor('plan')
    const rule = prompt.slice(prompt.indexOf('QUESTIONS'), prompt.indexOf('MODE: PLAN'))

    expect(rule).toMatch(/no plan/i)
    expect(rule).toMatch(/no approval/i)
    expect(rule).toMatch(/change nothing/i)
    expect(rule).toMatch(/web research only when/i)
  })

  it('no longer introduce the agent as a builder only', () => {
    expect(promptFor('plan')).not.toContain('You are a graph builder agent.')
  })
})
