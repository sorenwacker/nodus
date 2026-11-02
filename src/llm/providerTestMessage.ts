/**
 * Sending a test message to the configured provider
 * (PRODUCT_DESIGN.md > Sending a test message).
 *
 * The status light says whether the provider accepts a one-token request; this
 * sends a real prompt the way the agent does and reports what came back and
 * how long it took.
 */
import { ref } from 'vue'
import { llmQueue } from './queue'
import { describeRequestFailure } from './agentLog'

export interface TestMessageResult {
  reply: string
  /** Milliseconds until the first byte of the reply, null if nothing arrived */
  firstByteMs: number | null
  totalMs: number
  attempts: number
}

export function useProviderTestMessage(defaultPrompt: string) {
  const prompt = ref(defaultPrompt)
  const running = ref(false)
  const reply = ref('')
  const result = ref<TestMessageResult | null>(null)
  const error = ref<string | null>(null)

  async function send(): Promise<void> {
    if (running.value || !prompt.value.trim()) return
    running.value = true
    reply.value = ''
    result.value = null
    error.value = null

    const started = Date.now()
    let firstByteAt: number | null = null
    let attempts = 1

    try {
      const text = await llmQueue.generate(
        prompt.value,
        undefined,
        10,
        textSoFar => {
          if (firstByteAt === null && textSoFar) firstByteAt = Date.now()
          reply.value = textSoFar
        },
        { onRetry: attempt => { attempts = attempt + 1 } }
      )
      reply.value = text
      result.value = {
        reply: text,
        firstByteMs: firstByteAt === null ? null : firstByteAt - started,
        totalMs: Date.now() - started,
        attempts,
      }
    } catch (e) {
      error.value = describeRequestFailure(e, attempts, Date.now() - started).message
    } finally {
      running.value = false
    }
  }

  return { prompt, running, reply, result, error, send }
}
