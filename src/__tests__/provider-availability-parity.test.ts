/**
 * Every provider answers the availability question the same way.
 *
 * The rule - probe the endpoint the application uses for work, and record why a
 * check failed - was implemented in one provider of four. Anthropic probed a
 * hardcoded legacy model and read any status other than 401 as online, so the
 * light showed green beside a configured model that answered nothing. OpenAI
 * and Ollama probed a model listing, which can answer while completions fail on
 * authorisation, routing or timeout (PRODUCT_DESIGN.md > Provider status).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ILLMProvider } from '../llm/providers/types'

const httpFetchMock = vi.fn()
const globalFetchMock = vi.fn()

vi.mock('../llm/providers/http', () => ({
  httpFetch: (...args: unknown[]) => httpFetchMock(...args),
}))

/** Each provider, with the endpoint it uses for real work. */
const PROVIDERS: Array<{
  id: string
  workEndpoint: string
  make: () => Promise<ILLMProvider>
}> = [
  {
    id: 'anthropic',
    workEndpoint: '/v1/messages',
    make: async () => {
      const { AnthropicProvider } = await import('../llm/providers/anthropic')
      const p = new AnthropicProvider()
      p.configure({ apiKey: 'k', baseUrl: 'https://api.example.org', model: 'configured-model' })
      return p
    },
  },
  {
    id: 'openai',
    workEndpoint: '/chat/completions',
    make: async () => {
      const { OpenAIProvider } = await import('../llm/providers/openai')
      const p = new OpenAIProvider()
      p.configure({ apiKey: 'k', baseUrl: 'https://api.example.org/v1', model: 'configured-model' })
      return p
    },
  },
  {
    id: 'openai-compatible',
    workEndpoint: '/chat/completions',
    make: async () => {
      const { OpenAICompatibleProvider } = await import('../llm/providers/openai-compatible')
      const p = new OpenAICompatibleProvider()
      p.configure({ baseUrl: 'https://api.example.org/v1', model: 'configured-model' })
      return p
    },
  },
  {
    id: 'ollama',
    workEndpoint: '/api/chat',
    make: async () => {
      const { OllamaProvider } = await import('../llm/providers/ollama')
      const p = new OllamaProvider()
      p.configure({ baseUrl: 'http://localhost:11434', model: 'configured-model' })
      return p
    },
  },
]

function urlsCalled(): string[] {
  return [
    ...httpFetchMock.mock.calls.map(c => String(c[0])),
    ...globalFetchMock.mock.calls.map(c => String(c[0])),
  ]
}

describe.each(PROVIDERS)('$id availability', ({ workEndpoint, make }) => {
  beforeEach(() => {
    httpFetchMock.mockReset()
    globalFetchMock.mockReset()
    vi.stubGlobal('fetch', globalFetchMock)
    const ok = {
      ok: true,
      status: 200,
      json: async () => ({ models: [], data: [] }),
      text: async () => '',
    }
    httpFetchMock.mockResolvedValue(ok)
    globalFetchMock.mockResolvedValue(ok)
  })

  it('probes the endpoint used for work', async () => {
    const provider = await make()

    await provider.isAvailable()

    expect(urlsCalled().some(u => u.includes(workEndpoint))).toBe(true)
  })

  it('uses the configured model, not a hardcoded one', async () => {
    const provider = await make()

    await provider.isAvailable()

    const bodies = [...httpFetchMock.mock.calls, ...globalFetchMock.mock.calls]
      .map(c => String((c[1] as { body?: unknown } | undefined)?.body ?? ''))
      .join(' ')
    expect(bodies).toContain('configured-model')
  })

  it('reports unavailable on any failing status', async () => {
    // 404 for a retired model, 429, 500 - none of these mean "online"
    for (const status of [400, 404, 429, 500]) {
      const failing = {
        ok: false,
        status,
        json: async () => ({}),
        text: async () => 'nope',
      }
      httpFetchMock.mockResolvedValue(failing)
      globalFetchMock.mockResolvedValue(failing)

      const provider = await make()
      expect(await provider.isAvailable(), `status ${status} must not read as online`).toBe(false)
    }
  })

  it('records why the check failed', async () => {
    const failing = { ok: false, status: 404, json: async () => ({}), text: async () => 'no model' }
    httpFetchMock.mockResolvedValue(failing)
    globalFetchMock.mockResolvedValue(failing)

    const provider = await make()
    await provider.isAvailable()

    // Read through the interface, not a structural cast to one implementation
    expect(provider.lastAvailabilityError).toBeTruthy()
    expect(provider.lastAvailabilityError).toContain('404')
  })

  it('clears the recorded reason once the check succeeds', async () => {
    const provider = await make()
    const failing = { ok: false, status: 500, json: async () => ({}), text: async () => 'x' }
    httpFetchMock.mockResolvedValue(failing)
    globalFetchMock.mockResolvedValue(failing)
    await provider.isAvailable()

    const ok = { ok: true, status: 200, json: async () => ({}), text: async () => '' }
    httpFetchMock.mockResolvedValue(ok)
    globalFetchMock.mockResolvedValue(ok)
    await provider.isAvailable()

    expect(provider.lastAvailabilityError).toBeNull()
  })
})
