/**
 * LLM Provider Registry
 * Manages available providers and the active provider
 */

import { ref } from 'vue'
import type { ILLMProvider } from './types'
import { OllamaProvider } from './ollama'
import { OpenAIProvider } from './openai'
import { OpenAICompatibleProvider } from './openai-compatible'
import { AnthropicProvider } from './anthropic'

class ProviderRegistry {
  private providers = new Map<string, ILLMProvider>()
  private activeProviderId: string = 'ollama'
  /**
   * Bumped whenever the active provider or a provider's configuration changes.
   *
   * What the application reports for a run - the model, the context length -
   * is derived from the configuration, and a `computed` over a plain read has
   * no dependency to invalidate: it caches the value held at load for the rest
   * of the session (PRODUCT_DESIGN.md > Reads that stay live).
   */
  readonly configVersion = ref(0)

  constructor() {
    // Register built-in providers
    this.register(new OllamaProvider())
    this.register(new OpenAICompatibleProvider())
    this.register(new OpenAIProvider())
    this.register(new AnthropicProvider())
  }

  /**
   * Register a provider
   */
  register(provider: ILLMProvider): void {
    this.providers.set(provider.id, provider)
  }

  /**
   * Get all registered providers
   */
  getProviders(): ILLMProvider[] {
    return Array.from(this.providers.values())
  }

  /**
   * Get a specific provider by ID
   */
  getProvider(id: string): ILLMProvider | undefined {
    return this.providers.get(id)
  }

  /**
   * Get the active provider
   */
  getActiveProvider(): ILLMProvider {
    const provider = this.providers.get(this.activeProviderId)
    if (!provider) {
      // Fallback to Ollama
      return this.providers.get('ollama')!
    }
    return provider
  }

  /**
   * Set the active provider
   */
  setActiveProvider(id: string): boolean {
    if (!this.providers.has(id)) {
      return false
    }
    this.activeProviderId = id
    this.configVersion.value++
    return true
  }

  /**
   * Get active provider ID
   */
  getActiveProviderId(): string {
    return this.activeProviderId
  }

  /**
   * Configure a provider
   *
   * Takes what the provider itself accepts: the stored configuration is a
   * plain record, and the identifier is this argument, not a field inside it.
   */
  configureProvider(id: string, config: Record<string, unknown>): void {
    const provider = this.providers.get(id)
    if (provider) {
      provider.configure(config)
      this.configVersion.value++
    }
  }
}

// Singleton instance
export const providerRegistry = new ProviderRegistry()
