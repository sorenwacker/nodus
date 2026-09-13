/**
 * Reading an event stream, and showing a task's stored context.
 *
 * The accumulator split only on "\n\n", so a server using CRLF produced no
 * events at all and the stream was reported as having ended before it was
 * complete; whatever remained buffered when the stream closed was dropped
 * (PRODUCT_DESIGN.md > Reading an event stream).
 *
 * A task's context is stored as an object and was interpolated straight into
 * text, printing "[object Object]", so the context the model pushed came back
 * to it as nothing (PRODUCT_DESIGN.md > Showing a task's stored context).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createSseAccumulator } from '../llm/providers/sse'

const httpStreamFetchMock = vi.fn()

vi.mock('../llm/providers/http', () => ({
  httpFetch: vi.fn(),
  httpStreamFetch: (...args: unknown[]) => httpStreamFetchMock(...args),
}))

function delta(text: string) {
  return JSON.stringify({ choices: [{ delta: { content: text } }] })
}

describe('an event stream', () => {
  it('reads events delimited the way the specification allows', () => {
    const crlf = createSseAccumulator()
    crlf.push(`data: ${delta('Hello')}\r\n\r\n`)
    crlf.push(`data: ${delta(' world')}\r\n\r\n`)

    expect(crlf.text(), 'a CRLF stream produced no events at all').toBe('Hello world')
  })

  it('still reads a stream delimited by line feeds', () => {
    const lf = createSseAccumulator()
    lf.push(`data: ${delta('Hello')}\n\n`)

    expect(lf.text()).toBe('Hello')
  })

  it('reports the end of the stream however it is delimited', () => {
    const acc = createSseAccumulator()
    acc.push('data: [DONE]\r\n\r\n')

    expect(acc.done()).toBe(true)
  })

  it('dispatches what is left in the buffer when the stream closes', () => {
    const acc = createSseAccumulator()
    // A complete event, but the server closed without the trailing blank line
    acc.push(`data: ${delta('Hello')}`)
    acc.flush()

    expect(acc.text(), 'the last event was dropped').toBe('Hello')
  })
})

describe("a task's stored context", () => {
  function contextFor(task: unknown) {
    return {
      store: { currentWorkspaceId: 'w1' },
      agentMemoryStorage: {
        popTask: () => task,
        peekTask: () => task,
      },
      log: vi.fn(),
    } as never
  }

  const task = {
    id: 't1',
    description: 'Summarise the vault',
    priority: 'high',
    context: { vault: 'TU Delft', since: '2026-09-01' },
  }

  it('is readable when the task is popped', async () => {
    const { popTaskHandler } = await import('../llm/tools/handlers/memoryHandlers')

    const result = await popTaskHandler({}, contextFor(task))

    expect(result, 'the context came back as [object Object]').toContain('TU Delft')
    expect(result).not.toContain('[object Object]')
  })

  it('is readable when the stack is peeked', async () => {
    const { peekStackHandler } = await import('../llm/tools/handlers/memoryHandlers')

    const result = await peekStackHandler({}, contextFor(task))

    expect(result).toContain('TU Delft')
    expect(result).not.toContain('[object Object]')
  })
})

describe('a provider reading a stream', () => {
  beforeEach(() => {
    httpStreamFetchMock.mockReset()
  })

  it('keeps the last event when the stream closes without a blank line', async () => {
    const { OpenAICompatibleProvider } = await import('../llm/providers/openai-compatible')
    const provider = new OpenAICompatibleProvider()
    provider.configure({ baseUrl: 'https://api.example.org/v1', model: 'm' })

    httpStreamFetchMock.mockImplementation(
      async (_url: string, opts: { onChunk: (c: string) => void }) => {
        opts.onChunk(`data: ${delta('Hello')}\n\n`)
        // The server closes here: a complete event with no trailing blank line
        opts.onChunk('data: [DONE]')
        return 200
      }
    )

    const result = await provider.generate({ prompt: 'hi' })

    expect(result.content).toBe('Hello')
  })
})
