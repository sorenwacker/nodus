/**
 * A failure that says the provider is busy, unreachable for a moment, or took
 * too long is tried again before it reaches the user; one that says the request
 * itself was wrong is not (PRODUCT_DESIGN.md > Retrying a provider failure).
 *
 * A gateway timeout was missing from the retryable list, so the most ordinary
 * way a long agent run fails - a proxy giving up on a slow generation - ended
 * the run on the first refusal. It arrived as "API error 504: {}", because a
 * gateway that times out sends no body to quote.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockHttpFetch = vi.hoisted(() => vi.fn())
vi.mock('../llm/providers/http', () => ({ httpFetch: mockHttpFetch }))

import { withRetry } from '../llm/retry'
import { OpenAICompatibleProvider } from '../llm/providers/openai-compatible'

const NO_DELAY = { maxRetries: 2, initialDelayMs: 0, maxDelayMs: 0 }

describe('retrying a transient provider failure', () => {
  it('retries a gateway timeout', async () => {
    let calls = 0
    const result = await withRetry(async () => {
      calls++
      if (calls === 1) throw new Error('API error 504: {}')
      return 'ok'
    }, NO_DELAY)

    expect(result).toBe('ok')
    expect(calls).toBe(2)
  })

  it('retries a gateway that could not reach the model', async () => {
    let calls = 0
    const result = await withRetry(async () => {
      calls++
      if (calls === 1) throw new Error('API error 502: bad gateway')
      return 'ok'
    }, NO_DELAY)

    expect(result).toBe('ok')
    expect(calls).toBe(2)
  })

  it('does not retry a request the provider rejected as wrong', async () => {
    // Retrying a bad key or an unknown model only repeats the same answer
    // more slowly
    let calls = 0
    await expect(
      withRetry(async () => {
        calls++
        throw new Error('API error 401: invalid api key')
      }, NO_DELAY)
    ).rejects.toThrow('401')

    expect(calls).toBe(1)
  })
})

describe('reporting a status that carried no body', () => {
  beforeEach(() => {
    mockHttpFetch.mockReset()
  })

  it('says what the status means instead of showing an empty body', async () => {
    mockHttpFetch.mockResolvedValue({
      ok: false,
      status: 504,
      json: async () => {
        throw new Error('Unexpected end of JSON input')
      },
    })
    const provider = new OpenAICompatibleProvider()
    provider.configure({ baseUrl: 'http://localhost:1234/v1', model: 'm' })

    const err = (await provider
      .chat({ messages: [{ role: 'user', content: 'hi' }] })
      .catch(e => e)) as Error

    expect(err.message).toContain('504')
    expect(err.message).not.toContain('{}')
    expect(err.message.toLowerCase()).toMatch(/gateway|timed out/)
  })

  it('still quotes a message the provider did send', async () => {
    mockHttpFetch.mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: { message: 'unknown model' } }),
    })
    const provider = new OpenAICompatibleProvider()
    provider.configure({ baseUrl: 'http://localhost:1234/v1', model: 'm' })

    const err = (await provider
      .chat({ messages: [{ role: 'user', content: 'hi' }] })
      .catch(e => e)) as Error

    expect(err.message).toContain('unknown model')
  })
})
