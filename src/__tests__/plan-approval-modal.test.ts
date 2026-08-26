/**
 * A plan reaches the approval dialog with the steps it was created with.
 *
 * The create_plan handler built the plan, then returned a marker carrying only
 * {planId, title, stepCount}. The marker handler created the plan a SECOND time
 * from that payload, so `steps` was []. requestApproval() refuses a plan with no
 * steps, so no dialog opened: the agent said it was waiting for approval on a
 * plan the user never saw (PRODUCT_DESIGN.md > One creator per plan).
 */
import { describe, it, expect, vi } from 'vitest'
import { usePlanState } from '../llm/planState'
import { useMarkerHandlers } from '../canvas/composables/agent/useMarkerHandlers'
import { ref } from 'vue'

const STEPS = [
  { description: 'Create 8 risk nodes', action: 'create' as const, details: 'Lack of Local GPU Infrastructure, ...' },
  { description: 'Connect the consequences', action: 'connect' as const },
  { description: 'Colour the risk nodes red', action: 'other' as const },
]

function markerHandlers(planState: ReturnType<typeof usePlanState>) {
  return useMarkerHandlers({
    planState,
    nodes: ref([]),
    log: vi.fn(),
  })
}

describe('plan approval dialog', () => {
  it('keeps the created steps when the marker is processed', async () => {
    const planState = usePlanState()
    const { handleMarker } = markerHandlers(planState)

    // What the create_plan handler does: build the plan, then emit its marker
    const plan = planState.createPlan('Risk analysis', STEPS)
    await handleMarker(
      `__CREATE_PLAN__:${JSON.stringify({
        planId: plan.id,
        title: 'Risk analysis',
        stepCount: STEPS.length,
      })}`
    )

    expect(planState.currentPlan.value?.steps).toHaveLength(3)
    expect(planState.currentPlan.value?.id).toBe(plan.id)
  })

  it('opens the dialog once approval is requested', async () => {
    const planState = usePlanState()
    const { handleMarker } = markerHandlers(planState)

    const plan = planState.createPlan('Risk analysis', STEPS)
    await handleMarker(
      `__CREATE_PLAN__:${JSON.stringify({ planId: plan.id, title: 'Risk analysis', stepCount: 3 })}`
    )
    expect(planState.requestApproval()).toBe(true)
    await handleMarker(`__REQUEST_APPROVAL__:${JSON.stringify({ planId: plan.id })}`)

    expect(planState.showApprovalModal.value).toBe(true)
    expect(planState.currentPlan.value?.status).toBe('pending_approval')
  })

  it('still creates the plan when the payload carries the steps itself', async () => {
    // The registry's create_plan returns its raw arguments, with no plan id,
    // because on that path nothing has created the plan yet
    const planState = usePlanState()
    const { handleMarker } = markerHandlers(planState)

    await handleMarker(`__CREATE_PLAN__:${JSON.stringify({ title: 'Risk analysis', steps: STEPS })}`)

    expect(planState.currentPlan.value?.steps).toHaveLength(3)
    expect(planState.requestApproval()).toBe(true)
  })
})
