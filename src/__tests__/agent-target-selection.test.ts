/**
 * The agent acts on what was selected when you asked, not when it got there.
 *
 * A run started with node A selected, and the user clicking node B while the
 * model was still thinking, wrote A's new text into B - overwriting a node the
 * user never asked to change. The capture is taken here, when the prompt is
 * sent; agent-tool-context-selection covers what the tools read from it
 * (PRODUCT_DESIGN.md > What the agent acts on).
 */
import { describe, it, expect, vi } from 'vitest'
import { ref } from 'vue'

describe('the target of an agent run', () => {
  it('captures at the start and releases when the run truly ends', async () => {
    // A capture never released would make a later run target a stale set; one
    // released too early would expose the resumed half of an approved plan.
    const { useAgentPrompt } = await import('../canvas/composables/agent/useAgentPrompt')
    const prompt = ref('do the thing')
    const isLoading = ref(false)
    let status = 'done'

    const { sendPrompt, runSelection } = useAgentPrompt({
      prompt,
      isLoading,
      getSelectedNodeIds: () => ['a'],
      savePromptToHistory: vi.fn(),
      run: async () => ({ status }),
      reportError: vi.fn(),
    })

    await sendPrompt()
    expect(runSelection.value, 'a finished run releases its capture').toBeNull()

    // A run paused for approval is not finished
    status = 'paused'
    prompt.value = 'do the thing'
    await sendPrompt()
    expect(runSelection.value, 'a paused run keeps its capture').toEqual(['a'])
  })

  it('does not start a second run while one is in flight', async () => {
    const { useAgentPrompt } = await import('../canvas/composables/agent/useAgentPrompt')
    const run = vi.fn(async () => ({ status: 'done' }))
    const { sendPrompt } = useAgentPrompt({
      prompt: ref('something'),
      isLoading: ref(true),
      getSelectedNodeIds: () => [],
      savePromptToHistory: vi.fn(),
      run,
      reportError: vi.fn(),
    })

    await sendPrompt()

    expect(run).not.toHaveBeenCalled()
  })
})
