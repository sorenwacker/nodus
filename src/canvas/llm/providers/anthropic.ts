/**
 * Anthropic Provider
 * Claude API
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

export class AnthropicProvider implements ILLMProvider {
  readonly id = 'anthropic'
  readonly name = 'Anthropic (Claude)'
  readonly requiresApiKey = true

  private apiKey = ''
  private baseUrl = 'https://api.anthropic.com'
  private model = 'claude-3-5-sonnet-20241022'
  private timeout = 60000
  private maxTokens = 4096

  configure(config: Record<string, unknown>): void {
    if (config.apiKey) this.apiKey = config.apiKey as string
    if (config.baseUrl) this.baseUrl = config.baseUrl as string
    if (config.model) this.model = config.model as string
    if (config.timeout) this.timeout = config.timeout as number
    if (config.maxTokens) this.maxTokens = config.maxTokens as number
  }

  getConfig(): Record<string, unknown> {
    return {
      apiKey: this.apiKey ? '***' : '',
      baseUrl: this.baseUrl,
      model: this.model,
      timeout: this.timeout,
      maxTokens: this.maxTokens,
      hasApiKey: !!this.apiKey,
    }
  }

  async isAvailable(): Promise<boolean> {
    if (!this.apiKey) return false
    try {
      const response = await httpFetch(`${this.baseUrl}/v1/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-3-haiku-20240307',
          max_tokens: 1,
          messages: [{ role: 'user', content: 'hi' }],
        }),
        connectTimeout: 10000,
      })
      return response.status !== 401
    } catch {
      return false
    }
  }

  async listModels(): Promise<ProviderModel[]> {
    if (!this.apiKey) {
      return []
    }

    try {
      const response = await httpFetch(`${this.baseUrl}/v1/models`, {
        method: 'GET',
        headers: {
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
        },
        connectTimeout: 10000,
      })

      if (response.ok) {
        const data = await response.json()
        const models = (data.data || [])
          .map((m: { id: string; display_name?: string }) => ({
            id: m.id,
            name: m.display_name || m.id,
          }))
          .sort((a: ProviderModel, b: ProviderModel) => a.name.localeCompare(b.name))

        if (models.length > 0) {
          return models
        }
      }
    } catch {
      // Models endpoint not available, use fallback
    }

    return [
      { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4' },
      { id: 'claude-3-7-sonnet-20250219', name: 'Claude 3.7 Sonnet' },
      { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet' },
      { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku' },
      { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus' },
      { id: 'claude-3-haiku-20240307', name: 'Claude 3 Haiku' },
    ]
  }

  async generate(options: GenerateOptions): Promise<GenerateResult> {
    if (!this.apiKey) {
      throw new Error('Anthropic API key not configured')
    }

    // Use prefill to prevent preambles - assistant message forces model to continue directly
    const messages = [
      { role: 'user' as const, content: options.prompt },
    ]

    const response = await httpFetch(`${this.baseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: this.maxTokens,
        system: options.system,
        messages,
      }),
      connectTimeout: this.timeout,
    })

    if (!response.ok) {
      const errorText = await response.text()
      try {
        const error = JSON.parse(errorText)
        throw new Error(error.error?.message || `Anthropic error: ${response.status}`)
      } catch {
        throw new Error(`Anthropic error: ${response.status}`)
      }
    }

    const data = await response.json()
    return { content: data.content?.[0]?.text || '' }
  }

  async chat(options: ChatOptions): Promise<ChatResult> {
    if (!this.apiKey) {
      throw new Error('Anthropic API key not configured')
    }

    let systemPrompt: string | undefined
    const messages: Array<{ role: 'user' | 'assistant'; content: string }> = []

    for (const msg of options.messages) {
      if (msg.role === 'system') {
        systemPrompt = msg.content
      } else if (msg.role === 'user' || msg.role === 'assistant') {
        messages.push({ role: msg.role, content: msg.content })
      }
    }

    const tools = options.tools?.map(t => ({
      name: t.function.name,
      description: t.function.description,
      input_schema: t.function.parameters,
    }))

    const response = await httpFetch(`${this.baseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: this.maxTokens,
        system: systemPrompt,
        messages,
        tools: tools && tools.length > 0 ? tools : undefined,
      }),
      connectTimeout: this.timeout,
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      throw new Error(error.error?.message || `Anthropic error: ${response.status}`)
    }

    const data = await response.json()
    const message: LLMMessage = { role: 'assistant', content: '' }

    for (const block of data.content || []) {
      if (block.type === 'text') {
        message.content += block.text
      } else if (block.type === 'tool_use') {
        if (!message.tool_calls) message.tool_calls = []
        message.tool_calls.push({
          id: block.id,
          function: {
            name: block.name,
            arguments: JSON.stringify(block.input),
          },
        })
      }
    }

    return { message }
  }
}
