/**
 * The plan state exposes what its consumers use.
 *
 * Half of it was reachable from nothing: the step-execution machine
 * (complete, fail, update status), the plan history those functions fed, a
 * summary, a clear, and four computed values no caller read. Progress the user
 * sees comes from the agent tasks store, which the plan and update_task tools
 * write, so none of this had a surface to appear on.
 */
import { describe, it, expect } from 'vitest'
import { usePlanState } from '../llm/planState'

/** Everything the marker handlers, the plan handlers and the dialog call. */
const USED = [
  'currentPlan',
  'showApprovalModal',
  'createPlan',
  'requestApproval',
  'approvePlan',
  'rejectPlan',
  'modifyStep',
  'addStep',
  'removeStep',
  'startExecution',
].sort()

describe('the plan state', () => {
  it('exposes exactly what is called', () => {
    const exposed = Object.keys(usePlanState()).sort()

    expect(exposed, 'exposed but reachable from nothing').toEqual(USED)
  })
})
