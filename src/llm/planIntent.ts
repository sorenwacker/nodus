/**
 * Plan intent summary.
 *
 * Turns an agent plan into a clear "what will happen to the graph" overview so
 * the approval UI can tell the user how many nodes will be created versus edited
 * before they approve. Each step declares its action (see create_plan); when an
 * older or sloppy plan omits it, the description is classified by keyword.
 */
import type { AgentPlan, PlanStep, PlanStepAction } from './types'

const ACTION_KEYWORDS: Array<[PlanStepAction, RegExp]> = [
  ['delete', /\b(delete|remove|drop)\b/i],
  ['create', /\b(create|add|new|generate|build)\b/i],
  ['connect', /\b(connect|edge|link|relate)\b/i],
  ['edit', /\b(edit|update|change|modify|rename|rewrite|revise)\b/i],
  ['research', /\b(research|search|read|gather|find|investigate)\b/i],
]

/** The action a step performs, using its declared action or a keyword fallback. */
export function classifyStepAction(step: Pick<PlanStep, 'action' | 'description'>): PlanStepAction {
  if (step.action) return step.action
  const text = step.description || ''
  for (const [action, pattern] of ACTION_KEYWORDS) {
    if (pattern.test(text)) return action
  }
  return 'other'
}

export interface PlanIntent {
  counts: Record<PlanStepAction, number>
  /** Distinct node titles the plan will create. */
  createTargets: string[]
  /** Distinct node titles the plan will edit. */
  editTargets: string[]
  /**
   * Edit steps that name no targets. Their scope is unknown - one node or
   * every node - so they are reported as unstated rather than counted as one
   * (PRODUCT_DESIGN.md > Plan approval summary).
   */
  unscopedEdits: number
  /** Delete steps that name no targets; same reasoning as unscopedEdits */
  unscopedDeletes: number
}

function dedupe(values: string[]): string[] {
  return [...new Set(values.filter(v => v && v.trim()))]
}

/** Summarize a plan's effect on the graph, grouped by action. */
export function summarizePlanIntent(plan: AgentPlan | null): PlanIntent {
  const counts: Record<PlanStepAction, number> = {
    create: 0,
    edit: 0,
    delete: 0,
    connect: 0,
    research: 0,
    other: 0,
  }
  const createTargets: string[] = []
  const editTargets: string[] = []
  let unscopedEdits = 0
  let unscopedDeletes = 0

  for (const step of plan?.steps || []) {
    const action = classifyStepAction(step)
    counts[action]++
    const named = step.targets?.filter(t => t && t.trim()) ?? []
    if (action === 'create' && named.length) createTargets.push(...named)
    if (action === 'edit') {
      if (named.length) editTargets.push(...named)
      else unscopedEdits++
    }
    if (action === 'delete' && named.length === 0) unscopedDeletes++
  }

  return {
    counts,
    createTargets: dedupe(createTargets),
    editTargets: dedupe(editTargets),
    unscopedEdits,
    unscopedDeletes,
  }
}
