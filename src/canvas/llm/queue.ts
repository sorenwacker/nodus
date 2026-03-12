/**
 * LLM Request Queue Manager
 * ALL LLM calls MUST go through this queue - no exceptions
 */

import { ref, computed } from 'vue'
import { providerRegistry } from './providers'
import type { ChatMessage } from './types'

type RequestType = 'generate' | 'chat'

interface BaseRequest {
  id: string
  type: RequestType
  priority: number
  resolve: (value: unknown) => void
  reject: (error: Error) => void
  createdAt: number
}

interface GenerateRequest extends BaseRequest {
  type: 'generate'
  prompt: string
  system?: string
}

interface ChatRequest extends BaseRequest {
  type: 'chat'
  messages: ChatMessage[]
  tools?: unknown[]
}

type QueuedRequest = GenerateRequest | ChatRequest

export interface QueueStats {
  pending: number
  processing: boolean
  totalProcessed: number
  totalFailed: number
}

class LLMQueue {
  private queue: QueuedRequest[] = []
  private processing = ref(false)
  private currentRequest = ref<string | null>(null)
  private stats = ref({ totalProcessed: 0, totalFailed: 0 })
  private cancelled = false

  /**
   * Generate text (queued)
   */
  async generate(prompt: string, system?: string, priority = 0): Promise<string> {
    return new Promise((resolve, reject) => {
      const request: GenerateRequest = {
        id: crypto.randomUUID(),
        type: 'generate',
        prompt,
        system,
        priority,
        resolve: resolve as (value: unknown) => void,
        reject,
        createdAt: Date.now(),
      }

      this.insertByPriority(request)
      this.processNext()
    })
  }

  /**
   * Chat with tools (queued)
   */
  async chat(messages: ChatMessage[], tools?: unknown[]): Promise<{ message: ChatMessage }> {
    return new Promise((resolve, reject) => {
      const request: ChatRequest = {
        id: crypto.randomUUID(),
        type: 'chat',
        messages,
        tools,
        priority: 10, // Chat gets higher priority
        resolve: resolve as (value: unknown) => void,
        reject,
        createdAt: Date.now(),
      }

      this.insertByPriority(request)
      this.processNext()
    })
  }

  /**
   * Insert request by priority
   */
  private insertByPriority(request: QueuedRequest) {
    const insertIndex = this.queue.findIndex(r => r.priority < request.priority)
    if (insertIndex === -1) {
      this.queue.push(request)
    } else {
      this.queue.splice(insertIndex, 0, request)
    }
  }

  /**
   * Process next request in queue
   */
  private async processNext() {
    if (this.processing.value || this.queue.length === 0) return

    this.processing.value = true
    this.cancelled = false
    const request = this.queue.shift()!
    this.currentRequest.value = request.id

    try {
      const provider = providerRegistry.getActiveProvider()

      if (request.type === 'generate') {
        const result = await provider.generate({
          prompt: request.prompt,
          system: request.system,
        })

        if (this.cancelled) {
          request.reject(new Error('Cancelled'))
        } else {
          this.stats.value.totalProcessed++
          request.resolve(result.content)
        }
      } else {
        const result = await provider.chat({
          messages: request.messages.map(m => ({
            role: m.role,
            content: m.content,
            tool_calls: m.tool_calls,
            tool_call_id: m.tool_call_id,
          })),
          tools: request.tools,
        })

        if (this.cancelled) {
          request.reject(new Error('Cancelled'))
        } else {
          this.stats.value.totalProcessed++
          request.resolve(result)
        }
      }
    } catch (e: unknown) {
      this.stats.value.totalFailed++
      request.reject(e instanceof Error ? e : new Error(String(e)))
    } finally {
      this.processing.value = false
      this.currentRequest.value = null

      // Process next
      if (this.queue.length > 0) {
        this.processNext()
      }
    }
  }

  /**
   * Cancel current request and clear queue
   */
  cancel() {
    this.cancelled = true

    // Reject all pending
    for (const request of this.queue) {
      request.reject(new Error('Cancelled'))
    }
    this.queue = []
  }

  /**
   * Cancel current only
   */
  cancelCurrent() {
    this.cancelled = true
  }

  /**
   * Get stats
   */
  getStats(): QueueStats {
    return {
      pending: this.queue.length,
      processing: this.processing.value,
      ...this.stats.value,
    }
  }

  /**
   * Reactive state
   */
  get pendingCount() {
    return computed(() => this.queue.length)
  }

  get isProcessing() {
    return this.processing
  }
}

// Singleton - THE ONLY way to call LLMs
export const llmQueue = new LLMQueue()

/**
 * Composable for LLM queue
 */
export function useLLMQueue() {
  return {
    generate: (prompt: string, system?: string, priority?: number) =>
      llmQueue.generate(prompt, system, priority),
    chat: (messages: ChatMessage[], tools?: unknown[]) =>
      llmQueue.chat(messages, tools),
    cancel: () => llmQueue.cancel(),
    cancelCurrent: () => llmQueue.cancelCurrent(),
    stats: () => llmQueue.getStats(),
    isProcessing: llmQueue.isProcessing,
    pendingCount: llmQueue.pendingCount,
  }
}
