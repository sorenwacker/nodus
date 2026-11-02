/**
 * The selection a run captured is released when the run truly ends, including
 * a run that paused for plan approval and was resumed
 * (PRODUCT_DESIGN.md > What the agent acts on).
 *
 * Only the prompt path released it. After an approved plan finished, the
 * capture stayed, and tools run later - the toolbar smart layout - acted on
 * the previous run's selection instead of the current one.
 */
import { describe, it, expect, vi } from 'vitest'
import { ref } from 'vue'
import { useAgentPrompt } from '../canvas/composables/agent/useAgentPrompt'
import { usePlanHandlers } from '../canvas/composables/agent/usePlanHandlers'

function setup(resumeStatus: string) {
  const plan = { id: 'p', title: 't', status: 'pending_approval', createdAt: 0, steps: [] }
  const agentRunner = {
    run: vi.fn(async (_prompt: string) => ({ status: 'paused' })),
    resume: vi.fn(async () => ({ status: resumeStatus })),
  }
  const prompt = useAgentPrompt({
    prompt: ref('do it'),
    isLoading: ref(false),
    getSelectedNodeIds: () => ['a'],
    savePromptToHistory: () => {},
    run: p => agentRunner.run(p),
    reportError: () => {},
  })
  const handlers = usePlanHandlers({
    planState: {
      approvePlan: () => true,
      rejectPlan: () => {},
      startExecution: () => {},
      currentPlan: ref(plan),
    } as never,
    agentRunner: agentRunner as never,
    agentLog: ref([]),
    agentTasksStore: { setTasks: () => {} } as never,
    onResumeSettled: prompt.releaseRunSelectionUnlessPaused,
  })
  return { prompt, handlers }
}

describe('the selection an approved run captured', () => {
  it('is held while the run waits for approval', async () => {
    const { prompt } = setup('done')
    await prompt.sendPrompt()
    expect(prompt.runSelection.value).toEqual(['a'])
  })

  it('is released when the approved run ends', async () => {
    const { prompt, handlers } = setup('done')
    await prompt.sendPrompt()
    await handlers.handlePlanApprove()
    expect(prompt.runSelection.value).toBeNull()
  })

  it('is released when a rejected plan is revised and the run ends', async () => {
    const { prompt, handlers } = setup('done')
    await prompt.sendPrompt()
    handlers.handlePlanReject('no')
    await vi.waitFor(() => expect(prompt.runSelection.value).toBeNull())
  })

  it('is still held when the resumed run pauses again', async () => {
    const { prompt, handlers } = setup('paused')
    await prompt.sendPrompt()
    await handlers.handlePlanApprove()
    expect(prompt.runSelection.value).toEqual(['a'])
  })
})
