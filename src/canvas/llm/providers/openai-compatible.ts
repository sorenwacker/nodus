/**
 * OpenAI-Compatible Provider
 * Works with any OpenAI-compatible API (LM Studio, LocalAI, vLLM, text-generation-webui, etc.)
 */

import { httpFetch } from './http'
import type {
  ILLMProvider,
  GenerateOptions,
  ChatOptions,
  GenerateResult,
  ChatResult,
  ProviderModel,
  LLMMessage,
} from './types'

export class OpenAICompatibleProvider implements ILLMProvider {
  readonly id = 'openai-compatible'
  readonly name = 'OpenAI Compatible'
  readonly requiresApiKey = false  // API key is optional

  private apiKey = ''
  private baseUrl = 'http://localhost:1234/v1'  // LM Studio default
  private model = ''
  private timeout = 300000  // 5 min for local models
  private contextLength = 4096

  configure(config: Record<string, unknown>): void {
    if (config.apiKey !== undefined) this.apiKey = config.apiKey as string
    if (config.baseUrl) this.baseUrl = config.baseUrl as string
    if (config.model) this.model = config.model as string
    if (config.timeout) this.timeout = config.timeout as number
    if (config.contextLength) this.contextLength = config.contextLength as number
  }

  getConfig(): Record<string, unknown> {
    return {
      apiKey: this.apiKey ? '***' : '',
      baseUrl: this.baseUrl,
      model: this.model,
      timeout: this.timeout,
      contextLength: this.contextLength,
      hasApiKey: !!this.apiKey,
    }
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }
    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`
    }
    return headers
  }

  async isAvailable(): Promise<boolean> {
    try {
      const response = await httpFetch(`${this.baseUrl}/models`, {
        method: 'GET',
        headers: this.getHeaders(),
        connectTimeout: 5000,
      })
      return response.ok
    } catch {
      return false
    }
  }

  async listModels(): Promise<ProviderModel[]> {
    try {
      const response = await httpFetch(`${this.baseUrl}/models`, {
        method: 'GET',
        headers: this.getHeaders(),
        connectTimeout: 10000,
      })

      if (!response.ok) return []

      const data = await response.json()
      // Don't filter - show all models from the endpoint
      return (data.data || [])
        .map((m: { id: string; name?: string }) => ({
          id: m.id,
          name: m.name || m.id,
        }))
        .sort((a: ProviderModel, b: ProviderModel) => a.name.localeCompare(b.name))
    } catch {
      return []
    }
  }

  async generate(options: GenerateOptions): Promise<GenerateResult> {
    if (!this.model) {
      throw new Error('No model selected')
    }

    const messages: Array<{ role: string; content: string }> = []
    if (options.system) {
      messages.push({ role: 'system', content: options.system })
    }
    messages.push({ role: 'user', content: options.prompt })

    const response = await httpFetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({
        model: this.model,
        messages,
        max_tokens: options.maxTokens,
      }),
      connectTimeout: this.timeout,
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      const errorMsg = error.error?.message || error.message || error.detail || JSON.stringify(error)
      throw new Error(`API error ${response.status}: ${errorMsg}`)
    }

    const data = await response.json()
    return { content: data.choices?.[0]?.message?.content || '' }
  }

  async chat(options: ChatOptions): Promise<ChatResult> {
    if (!this.model) {
      throw new Error('No model selected')
    }

    const tools = options.tools?.map(t => ({
      type: 'function' as const,
      function: {
        name: t.function.name,
        description: t.function.description,
        parameters: t.function.parameters,
      },
    }))

    const response = await httpFetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({
        model: this.model,
        messages: options.messages,
        ...(tools && tools.length > 0 ? { tools, tool_choice: 'auto' } : {}),
      }),
      connectTimeout: this.timeout,
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      const errorMsg = error.error?.message || error.message || error.detail || JSON.stringify(error)
      throw new Error(`API error ${response.status}: ${errorMsg}`)
    }

    const data = await response.json()
    const choice = data.choices?.[0]
    const message: LLMMessage = {
      role: 'assistant',
      content: choice?.message?.content || '',
    }

    if (choice?.message?.tool_calls) {
      message.tool_calls = choice.message.tool_calls.map((tc: {
        id: string
        function: { name: string; arguments: string }
      }) => ({
        id: tc.id,
        function: {
          name: tc.function.name,
          arguments: tc.function.arguments,
        },
      }))
    }

    return { message }
  }
}
