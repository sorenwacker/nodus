/**
 * Streaming responses (PRODUCT_DESIGN.md > Streaming responses).
 *
 * A buffered response is indistinguishable from a stalled connection while the
 * model generates, and gateways cut it. Streaming keeps bytes flowing; these
 * tests cover reading the stream back into a message.
 */
import { describe, it, expect } from 'vitest'
import { createSseAccumulator } from '../llm/providers/sse'

describe('reading a streamed completion', () => {
  it('joins the deltas into the message', () => {
    const sse = createSseAccumulator()

    sse.push('data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n')
    sse.push('data: {"choices":[{"delta":{"content":" world"}}]}\n\n')
    sse.push('data: [DONE]\n\n')

    expect(sse.text()).toBe('Hello world')
    expect(sse.done()).toBe(true)
  })

  it('handles a chunk that splits an event in half', () => {
    // A network chunk boundary falls wherever it falls
    const sse = createSseAccumulator()

    sse.push('data: {"choices":[{"delta":{"con')
    sse.push('tent":"split"}}]}\n\ndata: [DONE]\n\n')

    expect(sse.text()).toBe('split')
  })

  it('ignores keep-alive comments and blank lines', () => {
    const sse = createSseAccumulator()

    sse.push(': keep-alive\n\n')
    sse.push('\n')
    sse.push('data: {"choices":[{"delta":{"content":"x"}}]}\n\n')

    expect(sse.text()).toBe('x')
  })

  it('reports a stream that ended before it was done', () => {
    // Returning a truncated generation would corrupt the text being cleaned
    const sse = createSseAccumulator()
    sse.push('data: {"choices":[{"delta":{"content":"half"}}]}\n\n')

    expect(sse.done()).toBe(false)
  })

  it('surfaces an error object sent in place of deltas', () => {
    const sse = createSseAccumulator()
    sse.push('data: {"error":{"message":"context length exceeded"}}\n\n')

    expect(sse.error()).toContain('context length exceeded')
  })

  it('ignores a delta with no content, such as a role announcement', () => {
    const sse = createSseAccumulator()
    sse.push('data: {"choices":[{"delta":{"role":"assistant"}}]}\n\n')
    sse.push('data: {"choices":[{"delta":{"content":"body"}}]}\n\n')

    expect(sse.text()).toBe('body')
  })
})

describe('assembling streamed tool calls', () => {
  // A streamed call arrives as fragments, each carrying the index of the call
  // it belongs to; the name comes in one delta and the arguments over many
  it('joins the fragments of one call by index', () => {
    const sse = createSseAccumulator()
    sse.push('data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","type":"function","function":{"name":"read_node","arguments":""}}]}}]}\n\n')
    sse.push('data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"{\\"ti"}}]}}]}\n\n')
    sse.push('data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"tle\\":\\"FIP\\"}"}}]}}]}\n\n')
    sse.push('data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}\n\n')
    sse.push('data: [DONE]\n\n')

    expect(sse.toolCalls()).toEqual([
      { id: 'call_1', type: 'function', function: { name: 'read_node', arguments: '{"title":"FIP"}' } },
    ])
    expect(sse.done()).toBe(true)
  })

  it('keeps two interleaved calls apart', () => {
    const sse = createSseAccumulator()
    sse.push('data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"a","function":{"name":"query_nodes","arguments":"{\\"filter\\":"}}]}}]}\n\n')
    sse.push('data: {"choices":[{"delta":{"tool_calls":[{"index":1,"id":"b","function":{"name":"think","arguments":"{}"}}]}}]}\n\n')
    sse.push('data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"\\"FIPs\\"}"}}]}}]}\n\n')

    expect(sse.toolCalls().map(c => [c.function.name, c.function.arguments])).toEqual([
      ['query_nodes', '{"filter":"FIPs"}'],
      ['think', '{}'],
    ])
  })

  it('reports no calls for a plain text reply', () => {
    const sse = createSseAccumulator()
    sse.push('data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n')
    expect(sse.toolCalls()).toEqual([])
  })
})
