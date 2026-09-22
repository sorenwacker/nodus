/**
 * Provider configuration for the AI settings: which provider is active, its
 * key, URL, model and generation limits, saved as one config per provider.
 *
 * Extracted from the settings panel so the Connection and Generation sections
 * can share one config without either owning it.
 */
import { ref, watch, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { llmStorage } from '../lib/storage'
import { providerRegistry } from '../llm/providers'
import type { ProviderModel } from '../llm/providers'
import { notifications$ } from './useNotifications'

const DEFAULT_BASE_URLS: Record<string, string> = {
  ollama: 'http://localhost:11434',
  'openai-compatible': 'http://localhost:1234/v1',
  openai: 'https://api.openai.com/v1',
  anthropic: 'https://api.anthropic.com',
}

const DEFAULT_MODELS: Record<string, string> = {
  ollama: 'llama3.2',
  'openai-compatible': '',
  openai: 'gpt-4o',
  anthropic: 'claude-3-5-sonnet-20241022',
}

export function useProviderSettings() {
  const { t } = useI18n()

  const providers = providerRegistry.getProviders()
  const selectedProvider = ref(llmStorage.getProvider())
  const providerStatus = ref<'checking' | 'online' | 'offline'>('checking')
  const providerError = ref<string | null>(null)

  const providerConfigs = ref<Record<string, Record<string, unknown>>>({})
  const availableModels = ref<ProviderModel[]>([])
  const loadingModels = ref(false)

  const currentConfig = computed(() => providerConfigs.value[selectedProvider.value] || {})
  const currentProvider = computed(() => providerRegistry.getProvider(selectedProvider.value))
  const requiresApiKey = computed(() => currentProvider.value?.requiresApiKey ?? false)

  const apiKeyStatus = ref<'idle' | 'validating' | 'valid' | 'invalid'>('idle')

  function setConfigValue(key: string, value: unknown) {
    if (!providerConfigs.value[selectedProvider.value]) {
      providerConfigs.value[selectedProvider.value] = {}
    }
    providerConfigs.value[selectedProvider.value][key] = value
    saveProviderConfig()
  }

  const apiKey = computed({
    get: () => (currentConfig.value.apiKey as string) || '',
    set: (value: string) => setConfigValue('apiKey', value),
  })

  const baseUrl = computed({
    get: () =>
      (currentConfig.value.baseUrl as string) || DEFAULT_BASE_URLS[selectedProvider.value] || '',
    set: (value: string) => setConfigValue('baseUrl', value),
  })

  const selectedModel = computed({
    get: () =>
      (currentConfig.value.model as string) || DEFAULT_MODELS[selectedProvider.value] || '',
    set: (value: string) => setConfigValue('model', value),
  })

  const timeout = computed({
    get: () => (currentConfig.value.timeout as number) || 300000,
    set: (value: number) => setConfigValue('timeout', value),
  })

  const timeoutSeconds = computed({
    get: () => Math.round(timeout.value / 1000),
    set: (value: number) => {
      timeout.value = value * 1000
    },
  })

  const maxTokens = computed({
    get: () => (currentConfig.value.maxTokens as number) || 4096,
    set: (value: number) => setConfigValue('maxTokens', value),
  })

  const contextWindow = computed({
    get: () => (currentConfig.value.contextLength as number) || 4096,
    set: (value: number) => setConfigValue('contextLength', value),
  })

  function currentSettings() {
    return {
      apiKey: apiKey.value,
      baseUrl: baseUrl.value,
      model: selectedModel.value,
      timeout: timeout.value,
      maxTokens: maxTokens.value,
      contextLength: contextWindow.value,
    }
  }

  async function fetchModels() {
    loadingModels.value = true
    providerStatus.value = 'checking'

    const provider = currentProvider.value
    if (!provider) {
      loadingModels.value = false
      providerStatus.value = 'offline'
      return
    }

    provider.configure({ ...currentConfig.value, ...currentSettings() })

    try {
      const isAvailable = await provider.isAvailable()
      providerStatus.value = isAvailable ? 'online' : 'offline'
      // "cannot be reached" and "refused the key" call for different fixes.
      // Read through the interface: reaching into one implementation's field left
      // three providers reporting nothing
      providerError.value = isAvailable ? null : provider.lastAvailabilityError
      availableModels.value = isAvailable ? await provider.listModels() : []
    } catch (error) {
      providerStatus.value = 'offline'
      providerError.value = error instanceof Error ? error.message : String(error)
      availableModels.value = []
    }

    loadingModels.value = false
  }

  function saveProviderConfig() {
    const config = currentSettings()
    llmStorage.setProviderConfig(selectedProvider.value, config)
    // One path for configuring a provider, so everything derived from the
    // configuration is told it changed (PRODUCT_DESIGN.md > Reads that stay live)
    providerRegistry.configureProvider(selectedProvider.value, config)
    window.dispatchEvent(new CustomEvent('nodus-llm-config-change'))
  }

  function saveActiveProvider() {
    llmStorage.setProvider(selectedProvider.value)
    providerRegistry.setActiveProvider(selectedProvider.value)
    apiKeyStatus.value = 'idle'
    fetchModels()
    window.dispatchEvent(new CustomEvent('nodus-llm-config-change'))
  }

  async function validateApiKey() {
    if (!apiKey.value) {
      apiKeyStatus.value = 'idle'
      return
    }

    apiKeyStatus.value = 'validating'
    const provider = currentProvider.value
    if (!provider) {
      apiKeyStatus.value = 'invalid'
      return
    }

    provider.configure(currentSettings())

    try {
      const isAvailable = await provider.isAvailable()
      apiKeyStatus.value = isAvailable ? 'valid' : 'invalid'
      if (isAvailable) {
        providerStatus.value = 'online'
        availableModels.value = await provider.listModels()
        notifications$.success(t('llm.connected', { provider: provider.name }))
      } else {
        notifications$.error(t('llm.connectionFailed'))
      }
    } catch {
      apiKeyStatus.value = 'invalid'
      notifications$.error(t('llm.connectionFailed'))
    }
  }

  watch(selectedProvider, saveActiveProvider)
  watch([maxTokens, contextWindow, timeout, selectedModel], saveProviderConfig)

  let fetchDebounceTimer: ReturnType<typeof setTimeout> | null = null
  watch(baseUrl, () => {
    if (fetchDebounceTimer) clearTimeout(fetchDebounceTimer)
    fetchDebounceTimer = setTimeout(() => fetchModels(), 500)
  })

  let validateDebounceTimer: ReturnType<typeof setTimeout> | null = null
  watch(apiKey, () => {
    if (validateDebounceTimer) clearTimeout(validateDebounceTimer)
    validateDebounceTimer = setTimeout(() => validateApiKey(), 800)
  })

  onMounted(() => {
    providerConfigs.value = llmStorage.getProviderConfigs() as Record<string, Record<string, unknown>>
    fetchModels()
  })

  return {
    providers,
    selectedProvider,
    providerStatus,
    providerError,
    availableModels,
    loadingModels,
    requiresApiKey,
    apiKeyStatus,
    apiKey,
    baseUrl,
    selectedModel,
    timeoutSeconds,
    maxTokens,
    contextWindow,
    fetchModels,
    validateApiKey,
  }
}

export type ProviderSettings = ReturnType<typeof useProviderSettings>
