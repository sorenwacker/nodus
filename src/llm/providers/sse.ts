/**
 * Reading a streamed completion.
 *
 * Chunks arrive on network boundaries, which fall wherever they fall, so events
 * are assembled from a running buffer rather than parsed per chunk
 * (PRODUCT_DESIGN.md > Streaming responses).
 */

interface StreamDelta {
  choices?: Array<{ delta?: { content?: string } }>
  error?: { message?: string } | string
}

export interface SseAccumulator {
  /** Feed a chunk of the response body */
  push(chunk: string): void
  /** The message assembled so far */
  text(): string
  /** Whether the stream reported that it finished */
  done(): boolean
  /** An error the stream carried in place of content, if any */
  error(): string | null
}

export function createSseAccumulator(): SseAccumulator {
  let buffer = ''
  let content = ''
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
    }
  }

  return {
    push(chunk: string) {
      buffer += chunk
      let boundary = buffer.indexOf('\n\n')
      while (boundary !== -1) {
        const block = buffer.slice(0, boundary)
        buffer = buffer.slice(boundary + 2)
        for (const line of block.split('\n')) {
          // Comments keep the connection alive and carry nothing
          if (line.startsWith(':')) continue
          if (line.startsWith('data:')) handleEvent(line.slice(5))
        }
        boundary = buffer.indexOf('\n\n')
      }
    },
    text: () => content,
    done: () => finished,
    error: () => failure,
  }
}
