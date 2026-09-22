/**
 * A plan reaches the approval dialog with the steps it was created with.
 *
 * The plan is created once, by the create_plan handler, through the plan
 * service. It used to be created a second time by a marker handler from a
 * payload carrying no steps; requestApproval() refuses a plan with no steps,
 * so no dialog opened and the agent said it was waiting for approval on a plan
 * the user never saw (PRODUCT_DESIGN.md > One creator per plan).
 */
import { describe, it, expect } from 'vitest'
import { usePlanState } from '../llm/planState'
import { toolRegistry } from '../llm/registry'
import { registerCoreTools } from '../llm/tools'
import { buildAgentToolContext } from '../canvas/composables/agent/agentToolContext'
import { fakeAgentToolContextDeps } from './fixtures/agentToolContextDeps'

registerCoreTools()

const STEPS = [
  { description: 'Create 8 risk nodes', action: 'create' as const, details: 'Lack of Local GPU Infrastructure, ...' },
  { description: 'Connect the consequences', action: 'connect' as const },
  { description: 'Colour the risk nodes red', action: 'other' as const },
]

function contextWith(planState: ReturnType<typeof usePlanState>) {
  return buildAgentToolContext(fakeAgentToolContextDeps({ planState }))
}

describe('plan approval dialog', () => {
  it('creates the plan once, with every step', async () => {
    const planState = usePlanState()

    await toolRegistry.execute('create_plan', { title: 'Risk analysis', steps: STEPS }, contextWith(planState))

    expect(planState.currentPlan.value?.steps).toHaveLength(3)
    expect(planState.currentPlan.value?.title).toBe('Risk analysis')
  })

  it('pauses the run with a typed signal once approval is requested', async () => {
    const planState = usePlanState()
    const ctx = contextWith(planState)

    await toolRegistry.execute('create_plan', { title: 'Risk analysis', steps: STEPS }, ctx)
    const outcome = await toolRegistry.execute('request_approval', {}, ctx)

    expect(outcome.signal).toBe('await_approval')
    expect(planState.showApprovalModal.value).toBe(true)
    expect(planState.currentPlan.value?.status).toBe('pending_approval')
  })

  it('refuses to request approval when no plan exists', async () => {
    const outcome = await toolRegistry.execute('request_approval', {}, contextWith(usePlanState()))

    expect(outcome.signal).toBeUndefined()
    expect(outcome.text).toMatch(/create_plan/)
  })
})

describe('a created plan is presented', () => {
  // The prompt asks for request_approval() after create_plan(), but nothing
  // guarantees the model makes that call. When it skipped it, the plan existed
  // in state with no dialog, and the user got prose asking "would you like me
  // to proceed?" (PRODUCT_DESIGN.md > A created plan is presented)
  it('opens the dialog on creation, without a separate approval call', () => {
    const planState = usePlanState()

    planState.createPlan('Risk analysis', STEPS)

    expect(planState.showApprovalModal.value).toBe(true)
    expect(planState.currentPlan.value?.steps).toHaveLength(3)
  })

  it('shows the newer plan when a second one is created', () => {
    const planState = usePlanState()

    planState.createPlan('First attempt', STEPS)
    planState.createPlan('Second attempt', [STEPS[0]])

    expect(planState.showApprovalModal.value).toBe(true)
    expect(planState.currentPlan.value?.title).toBe('Second attempt')
    expect(planState.currentPlan.value?.steps).toHaveLength(1)
  })

  it('can be approved straight from creation', () => {
    const planState = usePlanState()

    planState.createPlan('Risk analysis', STEPS)

    expect(planState.approvePlan()).toBe(true)
  })

  it('opens nothing on a plan with no steps', () => {
    // There is nothing to approve, and the dialog would be empty
    const planState = usePlanState()

    planState.createPlan('Empty', [])

    expect(planState.showApprovalModal.value).toBe(false)
  })
})
