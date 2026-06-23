import { describe, it, expect } from 'vitest'
import { classifyStepAction, summarizePlanIntent } from '../llm/planIntent'
import { getAgentMode } from '../llm/agentModes'
import type { AgentPlan } from '../llm/types'

function plan(steps: AgentPlan['steps']): AgentPlan {
  return { id: 'p', title: 'T', steps, status: 'draft', createdAt: 0 }
}

describe('classifyStepAction', () => {
  it('uses the declared action when present', () => {
    expect(classifyStepAction({ action: 'create', description: 'whatever' })).toBe('create')
    expect(classifyStepAction({ action: 'edit', description: 'Create nodes' })).toBe('edit')
  })

  it('falls back to keywords when action is missing', () => {
    expect(classifyStepAction({ description: 'Create 7 nodes for regions' })).toBe('create')
    expect(classifyStepAction({ description: 'Update node titles' })).toBe('edit')
    expect(classifyStepAction({ description: 'Connect related concepts' })).toBe('connect')
    expect(classifyStepAction({ description: 'Remove duplicate nodes' })).toBe('delete')
    expect(classifyStepAction({ description: 'Research the topic' })).toBe('research')
    expect(classifyStepAction({ description: 'Apply layout' })).toBe('other')
  })
})

describe('summarizePlanIntent', () => {
  it('counts actions and lists distinct create/edit targets', () => {
    const intent = summarizePlanIntent(
      plan([
        { id: '1', description: 'Create regions', status: 'pending', action: 'create', targets: ['Cerebrum', 'Cerebellum'] },
        { id: '2', description: 'Create more', status: 'pending', action: 'create', targets: ['Cerebrum', 'Brainstem'] },
        { id: '3', description: 'Refine intro', status: 'pending', action: 'edit', targets: ['Overview'] },
        { id: '4', description: 'Link them', status: 'pending', action: 'connect' },
      ])
    )
    expect(intent.counts.create).toBe(2)
    expect(intent.counts.edit).toBe(1)
    expect(intent.counts.connect).toBe(1)
    expect(intent.createTargets).toEqual(['Cerebrum', 'Cerebellum', 'Brainstem'])
    expect(intent.editTargets).toEqual(['Overview'])
  })

  it('handles a null plan', () => {
    const intent = summarizePlanIntent(null)
    expect(intent.counts.create).toBe(0)
    expect(intent.createTargets).toEqual([])
  })
})

describe('plan mode is read-only (plan-first guarantee)', () => {
  it('does not expose any graph-write tools', () => {
    const planTools = new Set(getAgentMode('plan').toolWhitelist)
    for (const writeTool of [
      'create_node',
      'create_nodes_batch',
      'create_edge',
      'create_edges_batch',
      'update_node',
      'delete_node',
      'batch_update',
      'auto_layout',
    ]) {
      expect(planTools.has(writeTool)).toBe(false)
    }
    // It can still research and propose.
    expect(planTools.has('create_plan')).toBe(true)
    expect(planTools.has('request_approval')).toBe(true)
    expect(planTools.has('wikipedia_search')).toBe(true)
  })

  it('still lets execute mode create nodes after approval', () => {
    expect(new Set(getAgentMode('execute').toolWhitelist).has('create_node')).toBe(true)
  })
})
