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
const mockHttpStreamFetch = vi.hoisted(() => vi.fn())
vi.mock('../llm/providers/http', () => ({ httpFetch: mockHttpFetch, httpStreamFetch: mockHttpStreamFetch }))

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

describe('waiting for the backend to recover', () => {
  // Three attempts within three seconds all landed in the same stall
  it('waits about 5, 15 and 45 seconds between attempts', async () => {
    vi.useFakeTimers()
    const delays: number[] = []
    let calls = 0
    const run = withRetry(
      async () => {
        calls++
        throw new Error('API error 504: the gateway timed out waiting for the model')
      },
      { onRetry: (_attempt, _error, delayMs) => delays.push(delayMs) }
    )
    run.catch(() => {})
    await vi.advanceTimersByTimeAsync(200_000)
    await expect(run).rejects.toThrow('504')
    vi.useRealTimers()

    expect(calls).toBe(4)
    expect(delays).toHaveLength(3)
    expect(delays[0]).toBeGreaterThanOrEqual(5_000)
    expect(delays[0]).toBeLessThan(7_000)
    expect(delays[1]).toBeGreaterThanOrEqual(15_000)
    expect(delays[1]).toBeLessThan(19_000)
    expect(delays[2]).toBeGreaterThanOrEqual(45_000)
    expect(delays[2]).toBeLessThan(57_000)
  })

  it('stops waiting when the run is stopped', async () => {
    // A retry waiting 45 seconds would otherwise keep the run alive that long
    vi.useFakeTimers()
    const controller = new AbortController()
    let calls = 0
    const run = withRetry(
      async () => {
        calls++
        throw new Error('API error 504: gateway')
      },
      { signal: controller.signal }
    )
    run.catch(() => {})
    await vi.advanceTimersByTimeAsync(1_000)
    controller.abort()
    await vi.advanceTimersByTimeAsync(0)
    await expect(run).rejects.toThrow('Cancelled')
    vi.useRealTimers()

    expect(calls).toBe(1)
  })
})

describe('a chat request with tools', () => {
  beforeEach(() => {
    mockHttpStreamFetch.mockReset()
  })

  it('streams, and assembles the tool call the stream carried', async () => {
    // Buffered, the answer after a long read looked stalled to the gateway
    mockHttpStreamFetch.mockImplementation(async (_url: string, options: { onChunk: (c: string) => void }) => {
      options.onChunk('data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"c1","function":{"name":"read_node","arguments":"{\\"title\\":"}}]}}]}\n\n')
      options.onChunk('data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"\\"FIP\\"}"}}]}}]}\n\n')
      options.onChunk('data: [DONE]\n\n')
      return 200
    })
    const provider = new OpenAICompatibleProvider()
    provider.configure({ baseUrl: 'http://localhost:1234/v1', model: 'm' })

    const result = await provider.chat({
      messages: [{ role: 'user', content: 'what is a FIP' }],
      tools: [{ type: 'function', function: { name: 'read_node', description: 'd', parameters: { type: 'object', properties: {} } } }],
    })

    const body = JSON.parse(mockHttpStreamFetch.mock.calls[0][1].body)
    expect(body.stream).toBe(true)
    expect(body.tools).toHaveLength(1)
    expect(result.message.tool_calls).toEqual([
      { id: 'c1', type: 'function', function: { name: 'read_node', arguments: '{"title":"FIP"}' } },
    ])
  })

  it('returns the text of a reply without tool calls', async () => {
    mockHttpStreamFetch.mockImplementation(async (_url: string, options: { onChunk: (c: string) => void }) => {
      options.onChunk('data: {"choices":[{"delta":{"content":"A FIP records"}}]}\n\ndata: [DONE]\n\n')
      return 200
    })
    const provider = new OpenAICompatibleProvider()
    provider.configure({ baseUrl: 'http://localhost:1234/v1', model: 'm' })

    const result = await provider.chat({ messages: [{ role: 'user', content: 'hi' }] })
    expect(result.message.content).toBe('A FIP records')
    expect(result.message.tool_calls ?? []).toEqual([])
  })
})

describe('reporting a status that carried no body', () => {
  beforeEach(() => {
    mockHttpFetch.mockReset()
    mockHttpStreamFetch.mockReset()
  })

  it('says what the status means instead of showing an empty body', async () => {
    mockHttpStreamFetch.mockResolvedValue(504)
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
    mockHttpStreamFetch.mockImplementation(async (_url: string, options: { onChunk: (c: string) => void }) => {
      options.onChunk('{"error":{"message":"unknown model"}}')
      return 400
    })
    const provider = new OpenAICompatibleProvider()
    provider.configure({ baseUrl: 'http://localhost:1234/v1', model: 'm' })

    const err = (await provider
      .chat({ messages: [{ role: 'user', content: 'hi' }] })
      .catch(e => e)) as Error

    expect(err.message).toContain('unknown model')
  })
})
