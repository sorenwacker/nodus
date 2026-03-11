/**
 * Ollama API client
 * Handles communication with local Ollama instance
 */
import type { AgentTool, ChatMessage } from './types'
import { llmStorage } from '../../lib/storage'

// Get URL and timeout from storage (with defaults)
function getOllamaUrl(): string {
  return llmStorage.getUrl()
}

function getTimeout(): number {
  return llmStorage.getTimeout()
}

export interface GenerateOptions {
  model: string
  prompt: string
  system?: string
  contextLength?: number
}

export interface ChatOptions {
  model: string
  messages: ChatMessage[]
  tools?: AgentTool[]
  contextLength?: number
}

/**
 * Simple generate endpoint (no tool calling)
 */
export async function generate(options: GenerateOptions): Promise<string> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), getTimeout())

  try {
    const response = await fetch(`${getOllamaUrl()}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: options.model,
        prompt: options.prompt,
        system: options.system,
        stream: false,
        options: {
          num_ctx: options.contextLength || 4096,
        },
      }),
      signal: controller.signal,
    })

    clearTimeout(timeout)

    if (!response.ok) {
      throw new Error(`Ollama error: ${response.status}`)
    }

    const data = await response.json()
    return data.response || ''
  } catch (e: unknown) {
    if (e instanceof Error && e.name === 'AbortError') {
      throw new Error('Request timed out')
    }
    throw new Error('Cannot connect to Ollama. Start it with: ollama serve')
  }
}

/**
 * Chat endpoint with tool calling support
 */
export async function chat(options: ChatOptions): Promise<ChatMessage> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), getTimeout())

  try {
    const response = await fetch(`${getOllamaUrl()}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: options.model,
        messages: options.messages,
        tools: options.tools,
        stream: false,
        options: {
          num_ctx: options.contextLength || 4096,
        },
      }),
      signal: controller.signal,
    })

    clearTimeout(timeout)

    if (!response.ok) {
      throw new Error(`Ollama error: ${response.status}`)
    }

    const data = await response.json()
    return data.message || { role: 'assistant', content: '' }
  } catch (e: unknown) {
    if (e instanceof Error && e.name === 'AbortError') {
      throw new Error('Request timed out')
    }
    throw new Error('Cannot connect to Ollama. Start it with: ollama serve')
  }
}

/**
 * Check if Ollama is running
 */
export async function isAvailable(): Promise<boolean> {
  try {
    const response = await fetch(`${getOllamaUrl()}/api/tags`, {
      method: 'GET',
      signal: AbortSignal.timeout(2000),
    })
    return response.ok
  } catch {
    return false
  }
}
