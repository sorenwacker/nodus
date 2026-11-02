/**
 * Reading a streamed completion.
 *
 * Chunks arrive on network boundaries, which fall wherever they fall, so events
 * are assembled from a running buffer rather than parsed per chunk
 * (PRODUCT_DESIGN.md > Streaming responses).
 */

interface ToolCallDelta {
  index?: number
  id?: string
  type?: 'function'
  function?: { name?: string; arguments?: string }
}

interface StreamDelta {
  choices?: Array<{ delta?: { content?: string; tool_calls?: ToolCallDelta[] } }>
  error?: { message?: string } | string
}

export interface StreamedToolCall {
  id?: string
  type: 'function'
  function: { name: string; arguments: string }
}

export interface SseAccumulator {
  /** Feed a chunk of the response body */
  push(chunk: string): void
  /**
   * Dispatch whatever is still buffered, for a stream that closed without a
   * final blank line. Without it the last event is dropped.
   */
  flush(): void
  /** The message assembled so far */
  text(): string
  /**
   * The tool calls assembled so far. A call arrives as fragments, each with
   * the index of the call it belongs to; they are joined by index so a name in
   * one delta and arguments over many deltas make one call
   * (PRODUCT_DESIGN.md > Streaming responses).
   */
  toolCalls(): StreamedToolCall[]
  /** Whether the stream reported that it finished */
  done(): boolean
  /** An error the stream carried in place of content, if any */
  error(): string | null
}

/**
 * An event boundary is a blank line, and the specification allows either line
 * ending. Splitting only on "\n\n" meant a server sending "\r\n\r\n"
 * produced no events at all (PRODUCT_DESIGN.md > Reading an event stream).
 */
const EVENT_BOUNDARY = /\r\n\r\n|\n\n|\r\r/

export function createSseAccumulator(): SseAccumulator {
  let buffer = ''
  let content = ''
  const calls = new Map<number, StreamedToolCall>()
  let finished = false
  let failure: string | null = null

  function handleEvent(payload: string) {
    const data = payload.trim()
    if (!data) return
    if (data === '[DONE]') {
      finished = true
      return
    }

    let parsed: StreamDelta
    try {
      parsed = JSON.parse(data)
    } catch {
      // A fragment that is not valid JSON is not an event yet
      return
    }

    if (parsed.error) {
      failure = typeof parsed.error === 'string' ? parsed.error : parsed.error.message || 'stream error'
      return
    }

    for (const choice of parsed.choices ?? []) {
      // A delta without content announces the role or a stop reason
      if (choice.delta?.content) content += choice.delta.content
      for (const fragment of choice.delta?.tool_calls ?? []) joinFragment(fragment)
    }
  }

  function joinFragment(fragment: ToolCallDelta) {
    const index = fragment.index ?? 0
    const call = calls.get(index) ?? { type: 'function', function: { name: '', arguments: '' } }
    if (fragment.id) call.id = fragment.id
    if (fragment.function?.name) call.function.name += fragment.function.name
    if (fragment.function?.arguments) call.function.arguments += fragment.function.arguments
    calls.set(index, call)
  }

  function dispatchBlock(block: string) {
    for (const line of block.split(/\r\n|\n|\r/)) {
      // Comments keep the connection alive and carry nothing
      if (line.startsWith(':')) continue
      if (line.startsWith('data:')) handleEvent(line.slice(5))
    }
  }

  return {
    push(chunk: string) {
      buffer += chunk
      let match = EVENT_BOUNDARY.exec(buffer)
      while (match) {
        const block = buffer.slice(0, match.index)
        buffer = buffer.slice(match.index + match[0].length)
        dispatchBlock(block)
        match = EVENT_BOUNDARY.exec(buffer)
      }
    },

    flush() {
      const remaining = buffer
      buffer = ''
      if (remaining.trim()) dispatchBlock(remaining)
    },
    text: () => content,
    toolCalls: () =>
      [...calls.entries()]
        .sort(([a], [b]) => a - b)
        .map(([, call]) => call)
        .filter(call => call.function.name),
    done: () => finished,
    error: () => failure,
  }
}
