/**
 * OpenAI Provider
 * OpenAI API (GPT-4, GPT-3.5, etc.)
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

export class OpenAIProvider implements ILLMProvider {
  readonly id = 'openai'
  readonly name = 'OpenAI'
  readonly requiresApiKey = true

  private apiKey = ''
  private baseUrl = 'https://api.openai.com/v1'
  private model = 'gpt-4o-mini'
  private timeout = 60000

  configure(config: Record<string, unknown>): void {
    if (config.apiKey) this.apiKey = config.apiKey as string
    if (config.baseUrl) this.baseUrl = config.baseUrl as string
    if (config.model) this.model = config.model as string
    if (config.timeout) this.timeout = config.timeout as number
  }

  getConfig(): Record<string, unknown> {
    return {
      apiKey: this.apiKey ? '***' : '',
      baseUrl: this.baseUrl,
      model: this.model,
      timeout: this.timeout,
      hasApiKey: !!this.apiKey,
    }
  }

  async isAvailable(): Promise<boolean> {
    if (!this.apiKey) return false
    try {
      const response = await httpFetch(`${this.baseUrl}/models`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
        },
        connectTimeout: 5000,
      })
      return response.ok
    } catch {
      return false
    }
  }

  async listModels(): Promise<ProviderModel[]> {
    if (!this.apiKey) return []

    try {
      const response = await httpFetch(`${this.baseUrl}/models`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
        },
        connectTimeout: 10000,
      })

      if (!response.ok) return []

      const data = await response.json()
      return (data.data || [])
        .filter((m: { id: string }) => m.id.startsWith('gpt'))
        .map((m: { id: string }) => ({ id: m.id, name: m.id }))
        .sort((a: ProviderModel, b: ProviderModel) => a.name.localeCompare(b.name))
    } catch {
      return []
    }
  }

  async generate(options: GenerateOptions): Promise<GenerateResult> {
    if (!this.apiKey) {
      throw new Error('OpenAI API key not configured')
    }

    const messages: Array<{ role: string; content: string }> = []
    if (options.system) {
      messages.push({ role: 'system', content: options.system })
    }
    messages.push({ role: 'user', content: options.prompt })

    const response = await httpFetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({ model: this.model, messages }),
      connectTimeout: this.timeout,
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      throw new Error(error.error?.message || `OpenAI error: ${response.status}`)
    }

    const data = await response.json()
    return { content: data.choices?.[0]?.message?.content || '' }
  }

  async chat(options: ChatOptions): Promise<ChatResult> {
    if (!this.apiKey) {
      throw new Error('OpenAI API key not configured')
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
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages: options.messages,
        tools: tools && tools.length > 0 ? tools : undefined,
      }),
      connectTimeout: this.timeout,
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      throw new Error(error.error?.message || `OpenAI error: ${response.status}`)
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
        type: 'function' as const,
        function: {
          name: tc.function.name,
          arguments: tc.function.arguments,
        },
      }))
    }

    return { message }
  }
}
