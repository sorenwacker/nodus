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
  /** Set on role:'tool' messages to link the result to its tool call */
  tool_call_id?: string
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
  /** When given, providers that support streaming report the accumulated text
   *  after each token; the promise still resolves with the complete text.
   *  Reporting the running total rather than deltas keeps consumers correct
   *  when the queue retries a failed request mid-stream. Providers without
   *  streaming support ignore it. */
  onProgress?: (textSoFar: string) => void
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

  /**
   * Why the last availability check failed, so the interface can say whether
   * the endpoint refused the key, could not be reached, or does not have the
   * configured model. Null when the last check succeeded
   * (PRODUCT_DESIGN.md > Provider status).
   */
  lastAvailabilityError: string | null

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
