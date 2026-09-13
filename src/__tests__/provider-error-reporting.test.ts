/**
 * A failed request says what the provider said.
 *
 * Anthropic parsed the API's message and threw it inside the `try` whose own
 * `catch` replaced it with generic text, so a bad key, a rate limit and an
 * unknown model all arrived as one sentence. Ollama mapped every non-abort
 * exception to a connection failure, so a malformed chunk from a running
 * server told the user to start a server that was already running
 * (PRODUCT_DESIGN.md > Reporting a provider failure).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const httpFetchMock = vi.fn()

vi.mock('../llm/providers/http', () => ({
  httpFetch: (...args: unknown[]) => httpFetchMock(...args),
}))

/** A body that streams the given chunks, as the Ollama reader expects. */
function streamOf(chunks: string[]) {
  let i = 0
  return {
    getReader: () => ({
      read: async () => {
        if (i >= chunks.length) return { done: true, value: undefined }
        return { done: false, value: new TextEncoder().encode(chunks[i++]) }
      },
    }),
  }
}

describe('an Anthropic failure', () => {
  beforeEach(() => {
    httpFetchMock.mockReset()
  })

  it('carries the message the API returned', async () => {
    const { AnthropicProvider } = await import('../llm/providers/anthropic')
    const provider = new AnthropicProvider()
    provider.configure({ apiKey: 'k', baseUrl: 'https://api.example.org', model: 'm' })

    httpFetchMock.mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => JSON.stringify({ error: { message: 'model "m" not found' } }),
    })

    await expect(provider.generate({ prompt: 'hi' })).rejects.toThrow(/model "m" not found/)
  })
})

describe('an Ollama failure', () => {
  beforeEach(() => {
    httpFetchMock.mockReset()
  })

  it('is not reported as a connection failure when the server answered', async () => {
    const { OllamaProvider } = await import('../llm/providers/ollama')
    const provider = new OllamaProvider()
    provider.configure({ baseUrl: 'http://localhost:11434', model: 'm' })

    // This provider streams through the global fetch. The server is up and
    // answering; one line of the stream is not valid JSON.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        body: streamOf(['{"response":"part"}\n', 'not json at all\n']),
      }))
    )

    // Naming the parse failure, so this cannot pass on an unrelated crash
    await expect(
      provider.generate({ prompt: 'hi', onProgress: () => {} })
    ).rejects.toThrow(/JSON|Unexpected token|not valid/i)
  })
})

describe('the OpenAI-compatible provider', () => {
  beforeEach(() => {
    httpFetchMock.mockReset()
  })

  it('records why a check failed, as the shared rule does', async () => {
    const { OpenAICompatibleProvider } = await import('../llm/providers/openai-compatible')
    const provider = new OpenAICompatibleProvider()
    provider.configure({ baseUrl: 'https://api.example.org/v1', model: 'm' })

    httpFetchMock.mockResolvedValue({
      ok: false,
      status: 503,
      text: async () => 'upstream is down',
    })

    expect(await provider.isAvailable()).toBe(false)
    expect(provider.lastAvailabilityError).toBe('HTTP 503: upstream is down')
  })

  it('clears the recorded reason once a check succeeds', async () => {
    const { OpenAICompatibleProvider } = await import('../llm/providers/openai-compatible')
    const provider = new OpenAICompatibleProvider()
    provider.configure({ baseUrl: 'https://api.example.org/v1', model: 'm' })

    httpFetchMock.mockResolvedValue({ ok: true, status: 200, text: async () => '' })

    expect(await provider.isAvailable()).toBe(true)
    expect(provider.lastAvailabilityError).toBeNull()
  })
})
