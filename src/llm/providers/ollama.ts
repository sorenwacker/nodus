/**
 * Ollama Provider
 * Local LLM inference via Ollama
 */

import type {
  ILLMProvider,
  GenerateOptions,
  ChatOptions,
  GenerateResult,
  ChatResult,
  ProviderModel,
  LLMMessage,
} from './types'

export class OllamaProvider implements ILLMProvider {
  readonly id = 'ollama'
  readonly name = 'Ollama (Local)'
  readonly requiresApiKey = false

  private baseUrl = 'http://localhost:11434'
  private model = 'llama3.2'
  private contextLength = 4096
  private timeout = 300000  // 5 minutes for large context

  configure(config: Record<string, unknown>): void {
    if (config.baseUrl) this.baseUrl = config.baseUrl as string
    if (config.model) this.model = config.model as string
    if (config.contextLength) this.contextLength = config.contextLength as number
    if (config.timeout) this.timeout = config.timeout as number
  }

  getConfig(): Record<string, unknown> {
    return {
      baseUrl: this.baseUrl,
      model: this.model,
      contextLength: this.contextLength,
      timeout: this.timeout,
    }
  }

  async isAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`, {
        method: 'GET',
        signal: AbortSignal.timeout(3000),
      })
      return response.ok
    } catch {
      return false
    }
  }

  async listModels(): Promise<ProviderModel[]> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      })
      if (!response.ok) return []

      const data = await response.json()
      return (data.models || []).map((m: { name: string }) => ({
        id: m.name,
        name: m.name,
      }))
    } catch {
      return []
    }
  }

  async generate(options: GenerateOptions): Promise<GenerateResult> {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), this.timeout)

    try {
      const response = await fetch(`${this.baseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          prompt: options.prompt,
          system: options.system,
          stream: false,
          options: {
            num_ctx: this.contextLength,
          },
        }),
        signal: controller.signal,
      })

      clearTimeout(timeout)

      if (!response.ok) {
        throw new Error(`Ollama error: ${response.status}`)
      }

      const data = await response.json()
      return { content: data.response || '' }
    } catch (e: unknown) {
      clearTimeout(timeout)
      if (e instanceof Error && e.name === 'AbortError') {
        throw new Error('Request timed out')
      }
      throw new Error('Cannot connect to Ollama. Start it with: ollama serve')
    }
  }

  async chat(options: ChatOptions): Promise<ChatResult> {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), this.timeout)

    try {
      const response = await fetch(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          messages: options.messages,
          tools: options.tools,
          stream: false,
          options: {
            num_ctx: this.contextLength,
          },
        }),
        signal: controller.signal,
      })

      clearTimeout(timeout)

      if (!response.ok) {
        throw new Error(`Ollama error: ${response.status}`)
      }

      const data = await response.json()
      const message: LLMMessage = data.message || { role: 'assistant', content: '' }
      return { message }
    } catch (e: unknown) {
      clearTimeout(timeout)
      if (e instanceof Error && e.name === 'AbortError') {
        throw new Error('Request timed out')
      }
      throw new Error('Cannot connect to Ollama. Start it with: ollama serve')
    }
  }
}
