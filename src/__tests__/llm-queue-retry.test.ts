/**
 * The queue reports each retry to the caller
 * (PRODUCT_DESIGN.md > Retrying a provider failure).
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'

const chat = vi.fn()
vi.mock('../llm/providers', () => ({
  providerRegistry: { getActiveProvider: () => ({ chat: (...args: unknown[]) => chat(...args) }) },
}))

import { llmQueue } from '../llm/queue'

describe('a chat request through the queue', () => {
  beforeEach(() => {
    chat.mockReset()
  })
  afterEach(() => vi.useRealTimers())

  it('reports a retry to the caller and then returns the answer', async () => {
    vi.useFakeTimers()
    chat
      .mockRejectedValueOnce(new Error('API error 504: the gateway timed out waiting for the model'))
      .mockResolvedValueOnce({ message: { role: 'assistant', content: 'ok' } })
    const retries: Array<[number, string, number]> = []

    const pending = llmQueue.chat([{ role: 'user', content: 'hi' }], undefined, {
      onRetry: (attempt, error, delayMs) => retries.push([attempt, error.message, delayMs]),
    })
    await vi.advanceTimersByTimeAsync(10_000)
    const result = await pending

    expect(result.message.content).toBe('ok')
    expect(retries).toHaveLength(1)
    expect(retries[0][0]).toBe(1)
    expect(retries[0][1]).toContain('504')
    expect(retries[0][2]).toBeGreaterThanOrEqual(5_000)
  })

  it('ends the wait when the current request is cancelled', async () => {
    vi.useFakeTimers()
    chat.mockRejectedValue(new Error('API error 504: gateway'))

    const pending = llmQueue.chat([{ role: 'user', content: 'hi' }])
    pending.catch(() => {})
    await vi.advanceTimersByTimeAsync(1_000)
    llmQueue.cancelCurrent()
    await vi.advanceTimersByTimeAsync(0)

    await expect(pending).rejects.toThrow('Cancelled')
    expect(chat).toHaveBeenCalledTimes(1)
  })
})
