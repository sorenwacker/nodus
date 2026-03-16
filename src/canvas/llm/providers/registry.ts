/**
 * LLM Provider Registry
 * Manages available providers and the active provider
 */

import type { ILLMProvider, ProviderConfig } from './types'
import { OllamaProvider } from './ollama'
import { OpenAIProvider } from './openai'
import { OpenAICompatibleProvider } from './openai-compatible'
import { AnthropicProvider } from './anthropic'

class ProviderRegistry {
  private providers = new Map<string, ILLMProvider>()
  private activeProviderId: string = 'ollama'
  private configs = new Map<string, ProviderConfig>()

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
   */
  configureProvider(id: string, config: ProviderConfig): void {
    const provider = this.providers.get(id)
    if (provider) {
      provider.configure(config)
      this.configs.set(id, config)
    }
  }

  /**
   * Get provider configuration
   */
  getProviderConfig(id: string): ProviderConfig | undefined {
    return this.configs.get(id)
  }

  /**
   * Load configurations from storage
   */
  loadConfigs(configs: Record<string, ProviderConfig>, activeId?: string): void {
    for (const [id, config] of Object.entries(configs)) {
      this.configureProvider(id, config)
    }
    if (activeId && this.providers.has(activeId)) {
      this.activeProviderId = activeId
    }
  }

  /**
   * Export all configurations
   */
  exportConfigs(): { configs: Record<string, ProviderConfig>; activeId: string } {
    const configs: Record<string, ProviderConfig> = {}
    for (const [id, config] of this.configs) {
      configs[id] = config
    }
    return { configs, activeId: this.activeProviderId }
  }
}

// Singleton instance
export const providerRegistry = new ProviderRegistry()

// Re-export types
export type { ILLMProvider, ProviderConfig, ProviderModel } from './types'
