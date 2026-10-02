/**
 * The prompt field is emptied when the prompt is sent.
 *
 * It was emptied only when the run ended, so for the length of the run it
 * showed the text already standing in the transcript, which reads as a prompt
 * that was not sent (PRODUCT_DESIGN.md > The prompt field after sending).
 */
import { describe, it, expect, vi } from 'vitest'
import { ref } from 'vue'
import { useAgentPrompt } from '../canvas/composables/agent/useAgentPrompt'

function harness(run: (prompt: string) => Promise<{ status: string } | undefined>) {
  const prompt = ref('what is the outlook?')
  const reportError = vi.fn()
  const { sendPrompt } = useAgentPrompt({
    prompt,
    isLoading: ref(false),
    getSelectedNodeIds: () => [],
    savePromptToHistory: vi.fn(),
    run,
    reportError,
  })
  return { prompt, reportError, sendPrompt }
}

describe('the prompt field after sending', () => {
  it('is empty while the run is in progress', async () => {
    let fieldDuringRun: string | null = null
    const h = harness(async () => {
      fieldDuringRun = h.prompt.value
      return { status: 'done' }
    })

    await h.sendPrompt()

    expect(fieldDuringRun).toBe('')
  })

  it('still hands the run the text that was sent', async () => {
    const run = vi.fn(async () => ({ status: 'done' }))
    const h = harness(run)

    await h.sendPrompt()

    expect(run).toHaveBeenCalledWith('what is the outlook?')
    expect(h.prompt.value).toBe('')
  })

  it('gets the text back when the run fails, so it can be sent again', async () => {
    const h = harness(async () => {
      throw new Error('provider unreachable')
    })

    await h.sendPrompt()

    expect(h.reportError).toHaveBeenCalledWith('provider unreachable')
    expect(h.prompt.value).toBe('what is the outlook?')
  })

  it('keeps what was typed since rather than overwriting it on failure', async () => {
    const h = harness(async () => {
      h.prompt.value = 'a new question'
      throw new Error('provider unreachable')
    })

    await h.sendPrompt()

    expect(h.prompt.value).toBe('a new question')
  })
})
