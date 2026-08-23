/**
 * Provider status (PRODUCT_DESIGN.md > Provider status).
 *
 * The status light used to probe the model listing while the work went to the
 * completions endpoint, so it could show green beside a provider that failed
 * every real request.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const fetchMock = vi.fn()
vi.mock('../llm/providers/http', () => ({ httpFetch: (...args: unknown[]) => fetchMock(...args) }))

async function makeProvider() {
  const { OpenAICompatibleProvider } = await import('../llm/providers/openai-compatible')
  const provider = new OpenAICompatibleProvider()
  provider.configure({ baseUrl: 'https://api.example.org/v1', model: 'test-model' })
  return provider
}

describe('provider availability', () => {
  beforeEach(() => {
    fetchMock.mockClear()
    fetchMock.mockReset()
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) })
  })

  it('asks the endpoint the application actually uses', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) })

    const provider = await makeProvider()
    await provider.isAvailable()

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toContain('/chat/completions')
    expect((init as { method: string }).method).toBe('POST')
  })

  it('is offline when completions fail even though the model list works', async () => {
    // The exact case that showed green beside a failing provider
    fetchMock.mockImplementation((url: string = '') =>
      url.includes('/models')
        ? Promise.resolve({ ok: true, json: async () => ({ data: [] }) })
        : Promise.resolve({ ok: false, status: 403, text: async () => 'forbidden' })
    )

    const provider = await makeProvider()

    expect(await provider.isAvailable()).toBe(false)
  })

  it('is offline when the endpoint cannot be reached', async () => {
    fetchMock.mockRejectedValue(new Error('error sending request'))

    const provider = await makeProvider()

    expect(await provider.isAvailable()).toBe(false)
  })

  it('keeps why the check failed, so the user knows what to fix', async () => {
    fetchMock.mockRejectedValue(new Error('error sending request for url'))

    const provider = await makeProvider()
    await provider.isAvailable()

    expect(provider.lastAvailabilityError).toContain('error sending request')
  })

  it('reports online when a completion comes back', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ choices: [] }) })

    const provider = await makeProvider()

    expect(await provider.isAvailable()).toBe(true)
    expect(provider.lastAvailabilityError).toBeNull()
  })
})
