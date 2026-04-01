/**
 * LLM Provider Interface
 * Abstracts different LLM backends (Ollama, OpenAI, Anthropic, etc.)
 */

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  tool_calls?: Array<{
    id?: string
    type?: 'function'
    function: {
      name: string
      arguments: string
    }
  }>
}

export interface LLMTool {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}

export interface GenerateOptions {
  prompt: string
  system?: string
  maxTokens?: number
}

export interface ChatOptions {
  messages: LLMMessage[]
  tools?: LLMTool[]
}

export interface GenerateResult {
  content: string
}

export interface ChatResult {
  message: LLMMessage
}

export interface ProviderModel {
  id: string
  name: string
}

/**
 * LLM Provider Interface
 * All providers must implement this interface
 */
export interface ILLMProvider {
  /** Unique provider identifier */
  readonly id: string

  /** Human-readable name */
  readonly name: string

  /** Whether this provider requires an API key */
  readonly requiresApiKey: boolean

  /** Check if provider is available/configured */
  isAvailable(): Promise<boolean>

  /** Get list of available models */
  listModels(): Promise<ProviderModel[]>

  /** Simple text generation (no tools) */
  generate(options: GenerateOptions): Promise<GenerateResult>

  /** Chat with optional tool calling */
  chat(options: ChatOptions): Promise<ChatResult>

  /** Configure the provider (API key, URL, etc.) */
  configure(config: Record<string, unknown>): void

  /** Get current configuration */
  getConfig(): Record<string, unknown>
}

/**
 * Provider configuration stored in settings
 */
export interface ProviderConfig {
  id: string
  apiKey?: string
  baseUrl?: string
  model?: string
  contextLength?: number
  timeout?: number
  [key: string]: unknown
}
