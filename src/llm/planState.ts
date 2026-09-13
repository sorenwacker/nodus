/**
 * Plan State Machine
 *
 * Manages a plan up to the point the user approves it: create it with steps,
 * modify those steps, and approve or reject. What happens after approval is
 * reported through the agent tasks store, which the task tools write.
 */

import { ref } from 'vue'
import type { AgentPlan, PlanStep } from './types'

/**
 * Generate unique ID for plans and steps
 */
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

/**
 * Plan state composable
 */
export function usePlanState() {
  // Current plan being worked on
  const currentPlan = ref<AgentPlan | null>(null)

  // Whether approval modal should be shown
  const showApprovalModal = ref(false)

  /**
   * Create a new plan
   */
  function createPlan(
    title: string,
    steps: Array<{ description: string; action?: PlanStep['action']; targets?: string[]; details?: string }>
  ): AgentPlan {
    const plan: AgentPlan = {
      id: generateId(),
      title,
      steps: steps.map(s => ({
        id: generateId(),
        description: s.description,
        details: s.details,
        action: s.action,
        targets: s.targets,
        status: 'pending',
      })),
      // A plan exists to be approved, and whether the user sees it must not
      // depend on the model also calling request_approval
      // (PRODUCT_DESIGN.md > A created plan is presented)
      status: steps.length > 0 ? 'pending_approval' : 'draft',
      createdAt: Date.now(),
    }
    currentPlan.value = plan
    // A plan with no steps has nothing to approve, so it opens no dialog
    showApprovalModal.value = plan.steps.length > 0
    return plan
  }

  /**
   * Request user approval for current plan
   */
  function requestApproval(): boolean {
    if (!currentPlan.value) return false
    if (currentPlan.value.steps.length === 0) return false

    currentPlan.value.status = 'pending_approval'
    showApprovalModal.value = true
    return true
  }

  /**
   * User approves the plan
   */
  function approvePlan(): boolean {
    if (!currentPlan.value) return false
    if (currentPlan.value.status !== 'pending_approval') return false

    // Mark all pending steps as approved
    for (const step of currentPlan.value.steps) {
      if (step.status === 'pending') {
        step.status = 'approved'
      }
    }

    currentPlan.value.status = 'approved'
    currentPlan.value.approvedAt = Date.now()
    showApprovalModal.value = false
    return true
  }

  /**
   * User rejects the plan
   */
  function rejectPlan(_reason?: string): boolean {
    if (!currentPlan.value) return false

    // Mark all steps as rejected
    for (const step of currentPlan.value.steps) {
      step.status = 'rejected'
    }

    currentPlan.value.status = 'cancelled'

    // Keep plan for reference but close modal
    showApprovalModal.value = false

    return true
  }

  /**
   * Modify a step before approval
   */
  function modifyStep(stepId: string, updates: Partial<PlanStep>): boolean {
    if (!currentPlan.value) return false
    if (currentPlan.value.status !== 'pending_approval' && currentPlan.value.status !== 'draft') {
      return false
    }

    const step = currentPlan.value.steps.find(s => s.id === stepId)
    if (!step) return false

    Object.assign(step, updates)
    return true
  }

  /**
   * Add a step to the plan
   */
  function addStep(description: string, details?: string, afterStepId?: string): PlanStep | null {
    if (!currentPlan.value) return null
    if (currentPlan.value.status !== 'pending_approval' && currentPlan.value.status !== 'draft') {
      return null
    }

    const newStep: PlanStep = {
      id: generateId(),
      description,
      details,
      status: 'pending',
    }

    if (afterStepId) {
      const index = currentPlan.value.steps.findIndex(s => s.id === afterStepId)
      if (index >= 0) {
        currentPlan.value.steps.splice(index + 1, 0, newStep)
      } else {
        currentPlan.value.steps.push(newStep)
      }
    } else {
      currentPlan.value.steps.push(newStep)
    }

    return newStep
  }

  /**
   * Remove a step from the plan
   */
  function removeStep(stepId: string): boolean {
    if (!currentPlan.value) return false
    if (currentPlan.value.status !== 'pending_approval' && currentPlan.value.status !== 'draft') {
      return false
    }

    const index = currentPlan.value.steps.findIndex(s => s.id === stepId)
    if (index < 0) return false

    currentPlan.value.steps.splice(index, 1)
    return true
  }

  /**
   * Start executing the plan
   */
  function startExecution(): boolean {
    if (!currentPlan.value) return false
    if (currentPlan.value.status !== 'approved') return false

    currentPlan.value.status = 'executing'

    // Start first approved step
    const firstStep = currentPlan.value.steps.find(s => s.status === 'approved')
    if (firstStep) {
      firstStep.status = 'in_progress'
    }

    return true
  }

  return {
    // State
    currentPlan,
    showApprovalModal,

    // Actions
    createPlan,
    requestApproval,
    approvePlan,
    rejectPlan,
    modifyStep,
    addStep,
    removeStep,
    startExecution,
  }
}
