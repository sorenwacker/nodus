import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { OllamaProvider } from '../llm/providers/ollama'

/**
 * Streaming generation: when a caller passes onProgress, the Ollama provider
 * requests a streamed response and reports the accumulated text after each
 * token, still resolving with the complete text. The running total (not
 * deltas) keeps consumers correct if the queue retries mid-stream. Without
 * onProgress the request stays non-streaming, so nothing changes for existing
 * callers.
 */

function ndjsonStream(lines: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  return new ReadableStream({
    start(controller) {
      for (const line of lines) controller.enqueue(encoder.encode(line + '\n'))
      controller.close()
    },
  })
}

let provider: OllamaProvider
let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  provider = new OllamaProvider()
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('OllamaProvider streaming', () => {
  it('reports accumulated text through onProgress and resolves with the full text', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      body: ndjsonStream([
        JSON.stringify({ response: 'Hello', done: false }),
        JSON.stringify({ response: ' world', done: false }),
        JSON.stringify({ response: '!', done: true }),
      ]),
    })

    const progress: string[] = []
    const result = await provider.generate({
      prompt: 'p',
      onProgress: t => progress.push(t),
    })

    expect(progress).toEqual(['Hello', 'Hello world', 'Hello world!'])
    expect(result.content).toBe('Hello world!')
  })

  it('requests a streamed response only when onProgress is given', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      body: ndjsonStream([JSON.stringify({ response: 'x', done: true })]),
    })
    await provider.generate({ prompt: 'p', onProgress: () => {} })
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).stream).toBe(true)

    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ response: 'x' }) })
    await provider.generate({ prompt: 'p' })
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).stream).toBe(false)
  })

  it('survives NDJSON lines split across network chunks', async () => {
    const encoder = new TextEncoder()
    const full = JSON.stringify({ response: 'AB', done: false }) + '\n' + JSON.stringify({ response: 'CD', done: true }) + '\n'
    const mid = Math.floor(full.length / 2) - 3
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(full.slice(0, mid)))
        controller.enqueue(encoder.encode(full.slice(mid)))
        controller.close()
      },
    })
    fetchMock.mockResolvedValue({ ok: true, body })

    const progress: string[] = []
    const result = await provider.generate({ prompt: 'p', onProgress: t => progress.push(t) })

    expect(result.content).toBe('ABCD')
    expect(progress).toEqual(['AB', 'ABCD'])
  })

  it('reports an HTTP error instead of hanging the stream', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500 })

    await expect(provider.generate({ prompt: 'p', onProgress: () => {} })).rejects.toThrow()
  })
})
