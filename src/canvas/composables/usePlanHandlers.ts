/**
 * Plan approval handlers composable
 *
 * Handles the plan approval flow: approve, reject, modify steps
 */

import type { Ref } from 'vue'
import type { usePlanState } from '../llm/planState'
import type { useAgentRunner } from './useAgentRunner'
import type { useAgentTasksStore } from '../../stores/agentTasks'
import type { PlanStep } from '../llm/types'

export interface UsePlanHandlersContext {
  planState: ReturnType<typeof usePlanState>
  agentRunner: ReturnType<typeof useAgentRunner>
  agentLog: Ref<string[]>
  agentTasksStore: ReturnType<typeof useAgentTasksStore>
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
  const { planState, agentRunner, agentLog, agentTasksStore } = ctx

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
        // Resume agent with approval
        await agentRunner.resume({ approved: true })
      }
    }
  }

  function handlePlanReject(reason?: string) {
    console.log('[usePlanHandlers] handlePlanReject called')
    planState.rejectPlan(reason)
    agentLog.value.push(`> Plan rejected${reason ? ': ' + reason : ''}`)
    // Resume agent to revise plan
    agentRunner.resume({ approved: false, message: reason })
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
