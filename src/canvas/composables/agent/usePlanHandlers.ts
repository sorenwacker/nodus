/**
 * Plan approval handlers composable
 *
 * Handles the plan approval flow: approve, reject, modify steps
 */

import type { Ref } from 'vue'
import type { usePlanState } from '../../../llm/planState'
import type { useAgentRunner } from './useAgentRunner'
import type { useAgentTasksStore } from '../../../stores/agentTasks'
import type { PlanStep } from '../../../llm/types'

export interface UsePlanHandlersContext {
  planState: ReturnType<typeof usePlanState>
  agentRunner: ReturnType<typeof useAgentRunner>
  agentLog: Ref<string[]>
  agentTasksStore: ReturnType<typeof useAgentTasksStore>
  /**
   * Told how a resumed run returned, so the selection the run captured is
   * released once it truly ends (PRODUCT_DESIGN.md > What the agent acts on)
   */
  onResumeSettled: (result: { status: string } | undefined) => void
}

export interface UsePlanHandlersReturn {
  handlePlanApprove: () => Promise<void>
  handlePlanReject: (reason?: string) => void
  handlePlanModify: (stepId: string, newDescription: string) => void
  handlePlanAddStep: (description: string, afterStepId?: string) => void
  handlePlanRemoveStep: (stepId: string) => void
  closePlanModal: () => void
}

export function usePlanHandlers(ctx: UsePlanHandlersContext): UsePlanHandlersReturn {
  const { planState, agentRunner, agentLog, agentTasksStore, onResumeSettled } = ctx

  async function resumeRun(...args: Parameters<typeof agentRunner.resume>): Promise<void> {
    let result: { status: string } | undefined
    try {
      result = await agentRunner.resume(...args)
    } finally {
      onResumeSettled(result)
    }
  }

  async function handlePlanApprove() {
    console.log('[usePlanHandlers] handlePlanApprove called')
    const success = planState.approvePlan()
    console.log('[usePlanHandlers] approvePlan result:', success)
    if (success) {
      agentLog.value.push('> Plan approved')
      // Set tasks in store
      if (planState.currentPlan.value) {
        agentTasksStore.setTasks(
          planState.currentPlan.value.steps.map((s: PlanStep) => ({
            description: s.description,
            details: s.details,
          }))
        )
        // Start execution
        planState.startExecution()
        // Resume agent with approval. The selection captured when the run
        // started is still held, so execution acts on the nodes the user had
        // selected when they asked (PRODUCT_DESIGN.md > What the agent acts on)
        // The runner is handed the plan rather than reaching for it: its
        // prompt is rebuilt around what the user approved
        // (PRODUCT_DESIGN.md > The prompt of an approved run carries its plan)
        await resumeRun({ approved: true }, planState.currentPlan.value)
      }
    }
  }

  function handlePlanReject(reason?: string) {
    console.log('[usePlanHandlers] handlePlanReject called')
    planState.rejectPlan(reason)
    agentLog.value.push(`> Plan rejected${reason ? ': ' + reason : ''}`)
    // Resume agent to revise plan
    void resumeRun({ approved: false, message: reason })
  }

  function handlePlanModify(stepId: string, newDescription: string) {
    planState.modifyStep(stepId, { description: newDescription })
    agentLog.value.push(`> Step modified: ${newDescription.slice(0, 40)}...`)
  }

  function handlePlanAddStep(description: string, afterStepId?: string) {
    planState.addStep(description, undefined, afterStepId)
    agentLog.value.push(`> Step added: ${description.slice(0, 40)}...`)
  }

  function handlePlanRemoveStep(stepId: string) {
    planState.removeStep(stepId)
    agentLog.value.push('> Step removed')
  }

  function closePlanModal() {
    planState.showApprovalModal.value = false
  }

  return {
    handlePlanApprove,
    handlePlanReject,
    handlePlanModify,
    handlePlanAddStep,
    handlePlanRemoveStep,
    closePlanModal,
  }
}
