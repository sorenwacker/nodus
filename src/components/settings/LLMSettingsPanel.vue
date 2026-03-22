<script setup lang="ts">
/**
 * LLM Settings Panel
 * Configures LLM provider, model, API keys, and prompts
 */
import { ref, watch, onMounted, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { llmStorage } from '../../lib/storage'
import { providerRegistry } from '../../llm/providers'
import type { ProviderModel } from '../../llm/providers'
import { DEFAULT_SYSTEM_PROMPT, DEFAULT_AGENT_PROMPT } from '../../llm/prompts'

const { t } = useI18n()

// Streaming toggle
const llmStreaming = ref(llmStorage.getLLMStreaming())

// Provider settings
const providers = providerRegistry.getProviders()
const selectedProvider = ref(llmStorage.getProvider())
const providerStatus = ref<'checking' | 'online' | 'offline'>('checking')

// Provider-specific settings
const providerConfigs = ref<Record<string, Record<string, unknown>>>({})
const availableModels = ref<ProviderModel[]>([])
const loadingModels = ref(false)

// Load all stored configs on mount
function loadStoredConfigs() {
  const stored = llmStorage.getProviderConfigs()
  providerConfigs.value = stored as Record<string, Record<string, unknown>>
}

// Current provider config (reactive)
const currentConfig = computed(() => providerConfigs.value[selectedProvider.value] || {})

// Current provider object
const currentProvider = computed(() => providerRegistry.getProvider(selectedProvider.value))

// Check if current provider needs API key
const requiresApiKey = computed(() => currentProvider.value?.requiresApiKey ?? false)

// API key validation status
const apiKeyStatus = ref<'idle' | 'validating' | 'valid' | 'invalid'>('idle')

// Get config values with defaults per provider
const apiKey = computed({
  get: () => (currentConfig.value.apiKey as string) || '',
  set: (value: string) => setConfigValue('apiKey', value)
})

const baseUrl = computed({
  get: () => {
    const config = currentConfig.value
    if (config.baseUrl) return config.baseUrl as string
    // Default URLs per provider
    if (selectedProvider.value === 'ollama') return 'http://localhost:11434'
    if (selectedProvider.value === 'openai-compatible') return 'http://localhost:1234/v1'
    if (selectedProvider.value === 'openai') return 'https://api.openai.com/v1'
    if (selectedProvider.value === 'anthropic') return 'https://api.anthropic.com'
    return ''
  },
  set: (value: string) => setConfigValue('baseUrl', value)
})

const selectedModel = computed({
  get: () => {
    const config = currentConfig.value
    if (config.model) return config.model as string
    // Default models per provider
    if (selectedProvider.value === 'ollama') return 'llama3.2'
    if (selectedProvider.value === 'openai-compatible') return ''
    if (selectedProvider.value === 'openai') return 'gpt-4o'
    if (selectedProvider.value === 'anthropic') return 'claude-3-5-sonnet-20241022'
    return ''
  },
  set: (value: string) => setConfigValue('model', value)
})

const timeout = computed({
  get: () => (currentConfig.value.timeout as number) || 300000,
  set: (value: number) => setConfigValue('timeout', value)
})

const maxTokens = computed({
  get: () => (currentConfig.value.maxTokens as number) || 4096,
  set: (value: number) => setConfigValue('maxTokens', value)
})

const contextWindow = computed({
  get: () => (currentConfig.value.contextLength as number) || 4096,
  set: (value: number) => setConfigValue('contextLength', value)
})

// Chain context limit
const chainContextLimit = ref(llmStorage.getChainContextLimit())
watch(chainContextLimit, (value) => {
  llmStorage.setChainContextLimit(value)
})

// Search API key (Tavily)
const searchApiKey = ref(llmStorage.getSearchApiKey())
const searchKeyStatus = ref<'idle' | 'testing' | 'valid' | 'invalid'>('idle')
watch(searchApiKey, (value) => {
  llmStorage.setSearchApiKey(value)
  searchKeyStatus.value = 'idle'
})

async function testSearchKey() {
  if (!searchApiKey.value) return
  searchKeyStatus.value = 'testing'
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    await invoke('web_search', { query: 'test', apiKey: searchApiKey.value })
    searchKeyStatus.value = 'valid'
  } catch {
    searchKeyStatus.value = 'invalid'
  }
}

// System prompt
const llmSystemPrompt = ref(llmStorage.getSystemPrompt(''))

// Agent prompt
const llmAgentPrompt = ref(llmStorage.getAgentPrompt(''))

// Set config value for current provider
function setConfigValue(key: string, value: unknown) {
  if (!providerConfigs.value[selectedProvider.value]) {
    providerConfigs.value[selectedProvider.value] = {}
  }
  providerConfigs.value[selectedProvider.value][key] = value
  saveProviderConfig()
}

// Fetch available models for current provider
async function fetchModels() {
  loadingModels.value = true
  providerStatus.value = 'checking'

  const provider = currentProvider.value
  if (!provider) {
    loadingModels.value = false
    providerStatus.value = 'offline'
    return
  }

  // Apply current config to provider
  const config = {
    ...currentConfig.value,
    apiKey: apiKey.value,
    baseUrl: baseUrl.value,
    model: selectedModel.value,
    timeout: timeout.value,
    maxTokens: maxTokens.value,
    contextLength: contextWindow.value,
  }
  provider.configure(config)

  try {
    const isAvailable = await provider.isAvailable()
    providerStatus.value = isAvailable ? 'online' : 'offline'

    if (isAvailable) {
      const models = await provider.listModels()
      availableModels.value = models
    } else {
      availableModels.value = []
    }
  } catch {
    providerStatus.value = 'offline'
    availableModels.value = []
  }

  loadingModels.value = false
}

// Save provider config
function saveProviderConfig() {
  const config = {
    apiKey: apiKey.value,
    baseUrl: baseUrl.value,
    model: selectedModel.value,
    timeout: timeout.value,
    maxTokens: maxTokens.value,
    contextLength: contextWindow.value,
  }

  llmStorage.setProviderConfig(selectedProvider.value, config)

  // Apply to provider
  const provider = currentProvider.value
  if (provider) {
    provider.configure(config)
  }
}

// Save active provider
function saveActiveProvider() {
  llmStorage.setProvider(selectedProvider.value)
  providerRegistry.setActiveProvider(selectedProvider.value)
  apiKeyStatus.value = 'idle'
  fetchModels()
}

// Validate API key
async function validateApiKey() {
  if (!requiresApiKey.value && !apiKey.value) {
    apiKeyStatus.value = 'idle'
    return
  }

  if (requiresApiKey.value && !apiKey.value) {
    apiKeyStatus.value = 'idle'
    return
  }

  apiKeyStatus.value = 'validating'

  const provider = currentProvider.value
  if (!provider) {
    apiKeyStatus.value = 'invalid'
    return
  }

  provider.configure({
    apiKey: apiKey.value,
    baseUrl: baseUrl.value,
    model: selectedModel.value,
    timeout: timeout.value,
    maxTokens: maxTokens.value,
    contextLength: contextWindow.value,
  })

  try {
    const isAvailable = await provider.isAvailable()
    apiKeyStatus.value = isAvailable ? 'valid' : 'invalid'

    if (isAvailable) {
      providerStatus.value = 'online'
      const models = await provider.listModels()
      availableModels.value = models
    }
  } catch {
    apiKeyStatus.value = 'invalid'
  }
}

// Save prompts
function saveSystemPrompt() {
  llmStorage.setSystemPrompt(llmSystemPrompt.value)
}

function saveAgentPrompt() {
  llmStorage.setAgentPrompt(llmAgentPrompt.value)
}

function resetSystemPrompt() {
  llmSystemPrompt.value = ''
  llmStorage.setSystemPrompt('')
}

function resetAgentPrompt() {
  llmAgentPrompt.value = ''
  llmStorage.setAgentPrompt('')
}

// Display timeout in seconds
const timeoutSeconds = computed({
  get: () => Math.round(timeout.value / 1000),
  set: (value: number) => { timeout.value = value * 1000 }
})

// Auto-save watchers
watch(selectedProvider, saveActiveProvider)
watch(llmSystemPrompt, saveSystemPrompt)
watch(llmAgentPrompt, saveAgentPrompt)
watch([maxTokens, contextWindow, timeout, selectedModel], saveProviderConfig)
watch(llmStreaming, (value) => {
  llmStorage.setLLMStreaming(value)
})

// Debounced fetches
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
  loadStoredConfigs()
  fetchModels()
})
</script>

<template>
  <div class="settings-section">
    <!-- Provider Selection -->
    <div class="setting-group">
      <label>{{ t('llm.provider') }}</label>
      <div class="input-with-status">
        <select v-model="selectedProvider">
          <option v-for="p in providers" :key="p.id" :value="p.id">
            {{ p.name }}
          </option>
        </select>
        <span
          class="status-indicator"
          :class="providerStatus"
          :title="providerStatus === 'online' ? t('llm.status.connected') : providerStatus === 'offline' ? t('llm.status.notConnected') : t('llm.status.checking')"
        />
      </div>
    </div>

    <!-- Streaming toggle -->
    <div class="setting-group">
      <label class="checkbox-label">
        <input v-model="llmStreaming" type="checkbox" />
        {{ t('llm.streaming.label') }}
      </label>
      <span class="hint">{{ t('llm.streaming.hint') }}</span>
    </div>

    <!-- API Key -->
    <div v-if="requiresApiKey || selectedProvider === 'openai-compatible'" class="setting-group">
      <label>{{ t('llm.apiKey.label') }} {{ !requiresApiKey ? t('llm.apiKey.optional') : '' }}</label>
      <div class="input-with-status">
        <input
          v-model="apiKey"
          type="password"
          :placeholder="requiresApiKey ? t('llm.apiKey.placeholder') : t('llm.apiKey.optionalPlaceholder')"
        />
        <button
          v-if="apiKey && apiKeyStatus !== 'validating'"
          class="validate-btn"
          :title="t('llm.apiKey.validate')"
          @click="validateApiKey"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M20 6L9 17l-5-5" />
          </svg>
        </button>
        <span
          v-if="apiKeyStatus !== 'idle'"
          class="status-indicator"
          :class="apiKeyStatus"
          :title="apiKeyStatus === 'valid' ? t('llm.apiKey.valid') : apiKeyStatus === 'invalid' ? t('llm.apiKey.invalid') : t('llm.apiKey.validating')"
        />
      </div>
      <span class="hint">
        {{ selectedProvider === 'openai' ? t('llm.hints.openai') : selectedProvider === 'openai-compatible' ? t('llm.hints.compatible') : t('llm.hints.anthropic') }}
      </span>
    </div>

    <!-- Base URL -->
    <div class="setting-group">
      <label>{{ selectedProvider === 'ollama' ? t('llm.baseUrl.ollamaLabel') : t('llm.baseUrl.label') }}</label>
      <input
        v-model="baseUrl"
        type="text"
        :placeholder="selectedProvider === 'ollama' ? t('llm.baseUrl.ollamaPlaceholder') : t('llm.baseUrl.placeholder')"
      />
    </div>

    <!-- Model Selection -->
    <div class="setting-group">
      <label>{{ t('llm.model.label') }}</label>
      <div class="model-select">
        <div class="model-input-wrapper">
          <input
            v-model="selectedModel"
            type="text"
            list="model-list"
            :placeholder="t('llm.model.placeholder')"
            :disabled="loadingModels"
          />
          <datalist id="model-list">
            <option v-for="model in availableModels" :key="model.id" :value="model.id">
              {{ model.name || model.id }}
            </option>
          </datalist>
        </div>
        <button
          class="refresh-btn"
          :disabled="loadingModels"
          :title="t('llm.model.fetch')"
          @click="fetchModels"
        >
          <svg
            :class="{ spinning: loadingModels }"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path d="M21 12a9 9 0 11-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
            <path d="M21 3v5h-5" />
          </svg>
        </button>
      </div>
      <span v-if="availableModels.length > 0" class="hint">
        {{ t('llm.model.available', { count: availableModels.length }) }}
      </span>
      <span v-else class="hint">
        {{ t('llm.model.fetchHint') }}
      </span>
    </div>

    <!-- Max Tokens -->
    <div class="setting-group">
      <label>{{ t('llm.maxTokens.label') }}</label>
      <div class="slider-with-value">
        <input
          v-model.number="maxTokens"
          type="range"
          min="256"
          max="32768"
          step="256"
          class="slider"
        />
        <span class="slider-value">{{ maxTokens >= 1024 ? (maxTokens / 1024).toFixed(1) + 'k' : maxTokens }}</span>
      </div>
      <div class="preset-buttons">
        <button
          v-for="preset in [512, 1024, 2048, 4096, 8192, 16384, 32768]"
          :key="preset"
          :class="{ active: maxTokens === preset }"
          @click="maxTokens = preset"
        >
          {{ preset >= 1024 ? (preset / 1024) + 'k' : preset }}
        </button>
      </div>
      <span class="hint">{{ t('llm.maxTokens.hint') }}</span>
    </div>

    <!-- Context Window -->
    <div class="setting-group">
      <label>{{ t('llm.contextWindow.label') }}</label>
      <div class="input-with-presets">
        <input
          v-model.number="contextWindow"
          type="number"
          min="2048"
          max="131072"
          step="1024"
        />
        <div class="preset-buttons">
          <button
            v-for="preset in [4096, 8192, 32768, 65536, 131072]"
            :key="preset"
            :class="{ active: contextWindow === preset }"
            @click="contextWindow = preset"
          >
            {{ preset >= 1024 ? (preset / 1024) + 'k' : preset }}
          </button>
        </div>
      </div>
      <span class="hint">{{ t('llm.contextWindow.hint') }}</span>
    </div>

    <!-- Timeout -->
    <div class="setting-group">
      <label>{{ t('llm.timeout.label') }}</label>
      <input
        v-model.number="timeoutSeconds"
        type="number"
        min="10"
        max="300"
        step="10"
      />
    </div>

    <!-- Chain Context Limit -->
    <div class="setting-group">
      <label>{{ t('llm.neighborContext.label') }}</label>
      <div class="slider-group">
        <input
          v-model.number="chainContextLimit"
          type="range"
          min="0"
          max="200000"
          step="10000"
          class="slider"
        />
        <span class="slider-value">{{ chainContextLimit === 0 ? t('llm.neighborContext.off') : (chainContextLimit / 1000) + 'k' }}</span>
      </div>
      <span class="hint">{{ t('llm.neighborContext.hint') }}</span>
    </div>

    <!-- Search API Key -->
    <div class="setting-group">
      <label>{{ t('llm.searchApi.label') }}</label>
      <div class="input-with-status">
        <input
          v-model="searchApiKey"
          type="password"
          :placeholder="t('llm.searchApi.placeholder')"
        />
        <button
          v-if="searchApiKey && searchKeyStatus !== 'testing'"
          class="validate-btn"
          :title="t('llm.searchApi.test')"
          @click="testSearchKey"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M20 6L9 17l-5-5" />
          </svg>
        </button>
        <span
          v-if="searchKeyStatus !== 'idle'"
          class="status-indicator"
          :class="searchKeyStatus === 'testing' ? 'validating' : searchKeyStatus"
          :title="searchKeyStatus === 'valid' ? t('llm.apiKey.valid') : searchKeyStatus === 'invalid' ? t('llm.apiKey.invalid') : t('llm.searchApi.testing')"
        />
      </div>
      <span class="hint">
        {{ t('llm.searchApi.hint') }}
        <a href="https://tavily.com/" target="_blank" rel="noopener">tavily.com</a>
      </span>
    </div>

    <!-- System Prompt -->
    <div class="setting-group">
      <label>
        {{ t('llm.systemPrompt.label') }}
        <button class="text-btn" @click="resetSystemPrompt">{{ t('llm.systemPrompt.reset') }}</button>
      </label>
      <textarea
        v-model="llmSystemPrompt"
        rows="4"
        :placeholder="DEFAULT_SYSTEM_PROMPT"
      />
    </div>

    <!-- Agent Prompt -->
    <div class="setting-group">
      <label>
        {{ t('llm.agentPrompt.label') }}
        <button class="text-btn" @click="resetAgentPrompt">{{ t('llm.agentPrompt.reset') }}</button>
      </label>
      <textarea
        v-model="llmAgentPrompt"
        rows="6"
        :placeholder="DEFAULT_AGENT_PROMPT"
      />
    </div>
  </div>
</template>

<style scoped>
/* Styles are inherited from parent SettingsModal.vue */
.settings-section {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.setting-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.setting-group > label {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-main, #18181b);
  display: flex;
  align-items: center;
  justify-content: space-between;
}

:is([data-theme='dark'], [data-theme='pitch-black'], [data-theme='cyber']) .setting-group > label {
  color: #f4f4f5;
}

.setting-group input[type="text"],
.setting-group input[type="password"],
.setting-group input[type="number"],
.setting-group select,
.setting-group textarea {
  padding: 8px 12px;
  border: 1px solid var(--border-node, #e4e4e7);
  border-radius: 6px;
  background: var(--bg-canvas, #f4f4f5);
  color: var(--text-main, #18181b);
  font-size: 14px;
}

:is([data-theme='dark'], [data-theme='pitch-black'], [data-theme='cyber']) .setting-group input[type="text"],
:is([data-theme='dark'], [data-theme='pitch-black'], [data-theme='cyber']) .setting-group input[type="password"],
:is([data-theme='dark'], [data-theme='pitch-black'], [data-theme='cyber']) .setting-group input[type="number"],
:is([data-theme='dark'], [data-theme='pitch-black'], [data-theme='cyber']) .setting-group select,
:is([data-theme='dark'], [data-theme='pitch-black'], [data-theme='cyber']) .setting-group textarea {
  background: #18181b;
  border-color: #3f3f46;
  color: #f4f4f5;
}

.setting-group textarea {
  resize: vertical;
  font-family: monospace;
  font-size: 12px;
}

.setting-group input:focus,
.setting-group select:focus,
.setting-group textarea:focus {
  outline: none;
  border-color: var(--primary-color, #3b82f6);
}

.hint {
  font-size: 11px;
  color: var(--text-muted, #71717a);
}

.hint a {
  color: var(--primary-color, #3b82f6);
  text-decoration: none;
}

.hint a:hover {
  text-decoration: underline;
}

.input-with-status {
  display: flex;
  align-items: center;
  gap: 8px;
}

.input-with-status select,
.input-with-status input {
  flex: 1;
}

.status-indicator {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
}

.status-indicator.checking,
.status-indicator.validating {
  background: #f59e0b;
  animation: pulse 1s infinite;
}

.status-indicator.online,
.status-indicator.valid {
  background: #10b981;
}

.status-indicator.offline,
.status-indicator.invalid {
  background: #ef4444;
}

.validate-btn,
.refresh-btn {
  padding: 6px;
  background: var(--border-node, #e4e4e7);
  border: none;
  border-radius: 4px;
  cursor: pointer;
  color: var(--text-main, #18181b);
  display: flex;
  align-items: center;
  justify-content: center;
}

:is([data-theme='dark'], [data-theme='pitch-black'], [data-theme='cyber']) .validate-btn,
:is([data-theme='dark'], [data-theme='pitch-black'], [data-theme='cyber']) .refresh-btn {
  background: #3f3f46;
  color: #f4f4f5;
}

.validate-btn:hover,
.refresh-btn:hover {
  background: var(--primary-color, #3b82f6);
  color: white;
}

.refresh-btn {
  padding: 8px;
  border-radius: 6px;
}

.refresh-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.spinning {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.model-select {
  display: flex;
  gap: 8px;
}

.model-input-wrapper {
  flex: 1;
  position: relative;
}

.model-input-wrapper input {
  width: 100%;
}

.text-btn {
  background: none;
  border: none;
  color: var(--primary-color, #3b82f6);
  font-size: 12px;
  cursor: pointer;
  padding: 0;
}

.text-btn:hover {
  text-decoration: underline;
}

.checkbox-label {
  display: flex !important;
  align-items: center;
  justify-content: flex-start !important;
  gap: 8px;
  cursor: pointer;
  font-weight: normal !important;
}

.checkbox-label input {
  width: 16px;
  height: 16px;
  cursor: pointer;
}

.input-with-presets {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.input-with-presets input {
  width: 100%;
}

.preset-buttons {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}

.preset-buttons button {
  padding: 4px 10px;
  font-size: 12px;
  background: var(--bg-canvas, #f4f4f5);
  border: 1px solid var(--border-node, #e4e4e7);
  border-radius: 4px;
  cursor: pointer;
  color: var(--text-main, #18181b);
  transition: all 0.15s;
}

:is([data-theme='dark'], [data-theme='pitch-black'], [data-theme='cyber']) .preset-buttons button {
  background: #18181b;
  border-color: #3f3f46;
  color: #f4f4f5;
}

.preset-buttons button:hover {
  border-color: var(--primary-color, #3b82f6);
}

.preset-buttons button.active {
  background: var(--primary-color, #3b82f6);
  border-color: var(--primary-color, #3b82f6);
  color: white;
}

.slider-with-value,
.slider-group {
  display: flex;
  align-items: center;
  gap: 12px;
}

.slider-with-value .slider,
.slider-group .slider {
  flex: 1;
  height: 4px;
  -webkit-appearance: none;
  appearance: none;
  background: var(--border-node, #e4e4e7);
  border-radius: 2px;
  cursor: pointer;
}

:is([data-theme='dark'], [data-theme='pitch-black'], [data-theme='cyber']) .slider-with-value .slider,
:is([data-theme='dark'], [data-theme='pitch-black'], [data-theme='cyber']) .slider-group .slider {
  background: #3f3f46;
}

.slider-with-value .slider::-webkit-slider-thumb,
.slider-group .slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 16px;
  height: 16px;
  background: var(--primary-color, #3b82f6);
  border-radius: 50%;
  cursor: pointer;
}

.slider-with-value .slider::-moz-range-thumb,
.slider-group .slider::-moz-range-thumb {
  width: 16px;
  height: 16px;
  background: var(--primary-color, #3b82f6);
  border: none;
  border-radius: 50%;
  cursor: pointer;
}

.slider-with-value .slider-value,
.slider-group .slider-value {
  min-width: 48px;
  text-align: right;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-main, #18181b);
}

:is([data-theme='dark'], [data-theme='pitch-black'], [data-theme='cyber']) .slider-with-value .slider-value,
:is([data-theme='dark'], [data-theme='pitch-black'], [data-theme='cyber']) .slider-group .slider-value {
  color: #f4f4f5;
}
</style>
