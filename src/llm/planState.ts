/**
 * Plan State Machine
 *
 * Manages agent plan lifecycle:
 * - Create plans with steps
 * - Request user approval
 * - Track approval/rejection
 * - Modify steps before approval
 */

import { ref, computed } from 'vue'
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

  // Plan history for session
  const planHistory = ref<AgentPlan[]>([])

  // Whether approval modal should be shown
  const showApprovalModal = ref(false)

  // Computed: is there a pending plan?
  const hasPendingPlan = computed(() =>
    currentPlan.value?.status === 'pending_approval'
  )

  // Computed: is plan approved and ready to execute?
  const isApproved = computed(() =>
    currentPlan.value?.status === 'approved'
  )

  // Computed: current step being executed
  const currentStepIndex = computed(() => {
    if (!currentPlan.value || currentPlan.value.status !== 'executing') return -1
    return currentPlan.value.steps.findIndex(s => s.status === 'in_progress')
  })

  // Computed: progress percentage
  const progress = computed(() => {
    if (!currentPlan.value) return 0
    const total = currentPlan.value.steps.length
    if (total === 0) return 0
    const done = currentPlan.value.steps.filter(s =>
      s.status === 'done' || s.status === 'error'
    ).length
    return Math.round((done / total) * 100)
  })

  /**
   * Create a new plan
   */
  function createPlan(title: string, steps: Array<{ description: string; details?: string }>): AgentPlan {
    const plan: AgentPlan = {
      id: generateId(),
      title,
      steps: steps.map(s => ({
        id: generateId(),
        description: s.description,
        details: s.details,
        status: 'pending',
      })),
      status: 'draft',
      createdAt: Date.now(),
    }
    currentPlan.value = plan
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
  function rejectPlan(reason?: string): boolean {
    if (!currentPlan.value) return false

    // Mark all steps as rejected
    for (const step of currentPlan.value.steps) {
      step.status = 'rejected'
    }

    currentPlan.value.status = 'cancelled'
    planHistory.value.push({ ...currentPlan.value })

    // Keep plan for reference but close modal
    showApprovalModal.value = false

    // Log rejection reason if provided
    if (reason) {
      console.log('[PlanState] Plan rejected:', reason)
    }

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

  /**
   * Mark current step as done and move to next
   */
  function completeCurrentStep(): PlanStep | null {
    if (!currentPlan.value || currentPlan.value.status !== 'executing') return null

    const current = currentPlan.value.steps.find(s => s.status === 'in_progress')
    if (!current) return null

    current.status = 'done'

    // Find next approved step
    const nextStep = currentPlan.value.steps.find(s => s.status === 'approved')
    if (nextStep) {
      nextStep.status = 'in_progress'
      return nextStep
    }

    // No more steps - plan complete
    currentPlan.value.status = 'completed'
    planHistory.value.push({ ...currentPlan.value })
    return null
  }

  /**
   * Mark current step as failed
   */
  function failCurrentStep(error: string): void {
    if (!currentPlan.value || currentPlan.value.status !== 'executing') return

    const current = currentPlan.value.steps.find(s => s.status === 'in_progress')
    if (current) {
      current.status = 'error'
      current.details = (current.details || '') + `\nError: ${error}`
    }
  }

  /**
   * Update step status by index (for agent use)
   */
  function updateStepStatus(stepIndex: number, status: PlanStep['status']): boolean {
    if (!currentPlan.value) return false
    if (stepIndex < 0 || stepIndex >= currentPlan.value.steps.length) return false

    currentPlan.value.steps[stepIndex].status = status

    // Check if all steps are done
    const allDone = currentPlan.value.steps.every(s =>
      s.status === 'done' || s.status === 'error' || s.status === 'rejected'
    )
    if (allDone && currentPlan.value.status === 'executing') {
      currentPlan.value.status = 'completed'
      planHistory.value.push({ ...currentPlan.value })
    }

    return true
  }

  /**
   * Clear current plan
   */
  function clearPlan(): void {
    if (currentPlan.value) {
      planHistory.value.push({ ...currentPlan.value })
    }
    currentPlan.value = null
    showApprovalModal.value = false
  }

  /**
   * Get plan summary for context
   */
  function getPlanSummary(): string {
    if (!currentPlan.value) return 'No active plan'

    const plan = currentPlan.value
    const stepsSummary = plan.steps
      .map((s, i) => `${i + 1}. [${s.status}] ${s.description}`)
      .join('\n')

    return `Plan: ${plan.title} (${plan.status})\n${stepsSummary}`
  }

  return {
    // State
    currentPlan,
    planHistory,
    showApprovalModal,

    // Computed
    hasPendingPlan,
    isApproved,
    currentStepIndex,
    progress,

    // Actions
    createPlan,
    requestApproval,
    approvePlan,
    rejectPlan,
    modifyStep,
    addStep,
    removeStep,
    startExecution,
    completeCurrentStep,
    failCurrentStep,
    updateStepStatus,
    clearPlan,
    getPlanSummary,
  }
}
