/**
 * Sending a test message (PRODUCT_DESIGN.md > Sending a test message).
 *
 * The status light says whether the provider accepts a one-token request; it
 * cannot say whether the provider can finish a written answer.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const generate = vi.fn()
vi.mock('../llm/queue', () => ({
  llmQueue: { generate: (...args: unknown[]) => generate(...args) },
}))

import { useProviderTestMessage } from '../llm/providerTestMessage'

type Progress = (textSoFar: string) => void
type Options = { onRetry?: (attempt: number, error: Error, delayMs: number) => void }

describe('a test message', () => {
  beforeEach(() => {
    generate.mockReset()
    vi.useFakeTimers()
  })
  afterEach(() => vi.useRealTimers())

  it('starts from a default prompt the user can edit', () => {
    const test = useProviderTestMessage('Say hello.')
    expect(test.prompt.value).toBe('Say hello.')
    test.prompt.value = 'Say goodbye.'
    expect(test.prompt.value).toBe('Say goodbye.')
  })

  it('streams the reply and reports first byte, total time and attempts', async () => {
    generate.mockImplementation(async (_p: string, _s: unknown, _pri: number, onProgress: Progress) => {
      await vi.advanceTimersByTimeAsync(300)
      onProgress('A knowledge')
      await vi.advanceTimersByTimeAsync(700)
      onProgress('A knowledge graph links notes.')
      return 'A knowledge graph links notes.'
    })
    const test = useProviderTestMessage('What is a knowledge graph?')

    const pending = test.send()
    expect(test.running.value).toBe(true)
    await pending

    expect(test.running.value).toBe(false)
    expect(test.reply.value).toBe('A knowledge graph links notes.')
    expect(test.result.value).toMatchObject({ attempts: 1, reply: 'A knowledge graph links notes.' })
    expect(test.result.value?.firstByteMs).toBeGreaterThanOrEqual(300)
    expect(test.result.value?.firstByteMs).toBeLessThan(700)
    expect(test.result.value?.totalMs).toBeGreaterThanOrEqual(1000)
    expect(test.error.value).toBeNull()
  })

  it('sends with the priority of interactive work and no system prompt', async () => {
    generate.mockResolvedValue('ok')
    const test = useProviderTestMessage('hi')
    await test.send()
    expect(generate.mock.calls[0][0]).toBe('hi')
    expect(generate.mock.calls[0][1]).toBeUndefined()
    expect(generate.mock.calls[0][2]).toBe(10)
  })

  it('shows the failure the agent would have shown, with attempts and elapsed time', async () => {
    const gateway = new Error('malformed response: unexpected EOF during chunk size line')
    generate.mockImplementation(async (_p: string, _s: unknown, _pri: number, _on: Progress, options: Options) => {
      options.onRetry?.(1, gateway, 5000)
      options.onRetry?.(2, gateway, 15000)
      await vi.advanceTimersByTimeAsync(62_000)
      throw gateway
    })
    const test = useProviderTestMessage('hi')
    await test.send()

    expect(test.error.value).toMatch(/unexpected EOF.*after 3 attempts over 1 min 2 s/)
    expect(test.result.value).toBeNull()
    expect(test.running.value).toBe(false)
  })

  it('does not send an empty prompt or a second request while one runs', async () => {
    generate.mockImplementation(() => new Promise(() => {}))
    const test = useProviderTestMessage('   ')
    await test.send()
    expect(generate).not.toHaveBeenCalled()

    test.prompt.value = 'hi'
    void test.send()
    void test.send()
    expect(generate).toHaveBeenCalledTimes(1)
  })
})

describe('the AI settings panel', () => {
  const panel = readFileSync(resolve(__dirname, '../components/settings/LLMSettingsPanel.vue'), 'utf-8')
  const storage = readFileSync(resolve(__dirname, '../lib/storage.ts'), 'utf-8')

  it('offers the test message', () => {
    expect(panel).toContain("t('llm.testMessage.send')")
    expect(panel).toContain('testMessage.send()')
    expect(panel).toContain("t('llm.testMessage.timing'")
  })

  it('no longer shows a streaming switch that nothing read', () => {
    expect(panel).not.toContain('llmStreaming')
    expect(panel).not.toContain('llm.streaming')
    expect(storage).not.toContain('LLMStreaming')
  })
})
