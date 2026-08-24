/**
 * Plan approval summary (PRODUCT_DESIGN.md > Plan approval summary).
 *
 * The dialog exists so the user can see a plan's effect before consenting. A
 * step that rewrote every node in the workspace was summarised as editing one,
 * because the count came from steps rather than targets.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { summarizePlanIntent } from '../llm/planIntent'
import type { AgentPlan } from '../llm/types'

function plan(steps: Array<Partial<AgentPlan['steps'][number]>>): AgentPlan {
  return {
    id: 'p1',
    title: 'Test plan',
    status: 'pending_approval',
    steps: steps.map((s, i) => ({
      id: `s${i}`,
      description: '',
      status: 'pending',
      ...s,
    })),
  } as AgentPlan
}

describe('scope of an edit step', () => {
  it('counts the targets a step names', () => {
    const intent = summarizePlanIntent(
      plan([{ action: 'edit', targets: ['Alpha', 'Beta'], description: 'Update two nodes' }])
    )

    expect(intent.editTargets).toEqual(['Alpha', 'Beta'])
    expect(intent.unscopedEdits).toBe(0)
  })

  it('reports an unnamed scope instead of counting the step as one node', () => {
    // This is the plan that displayed as "edit 1 existing node" while
    // describing all 317 nodes in the workspace
    const intent = summarizePlanIntent(
      plan([{ action: 'edit', description: 'Update content for all 317 nodes to follow formatting' }])
    )

    expect(intent.editTargets).toEqual([])
    expect(intent.unscopedEdits).toBe(1)
  })

  it('reports an unnamed scope for deletions too', () => {
    const intent = summarizePlanIntent(plan([{ action: 'delete', description: 'Remove stale nodes' }]))

    expect(intent.unscopedDeletes).toBe(1)
  })

  it('does not warn when every step names its targets', () => {
    const intent = summarizePlanIntent(
      plan([
        { action: 'create', targets: ['New one'], description: 'Create' },
        { action: 'edit', targets: ['Alpha'], description: 'Edit' },
      ])
    )

    expect(intent.unscopedEdits).toBe(0)
    expect(intent.unscopedDeletes).toBe(0)
  })
})

describe('the dialog states an unnamed scope', () => {
  it('never labels a step count as a node count', () => {
    const modal = readFileSync(
      resolve(__dirname, '../components/PlanApprovalModal.vue'),
      'utf-8'
    )
    // The old expression fell back to the step count
    expect(modal).not.toContain('c.editTargets.length || c.counts.edit')
    expect(modal).toContain('unscopedEdits')
  })
})
