<script setup lang="ts">
/**
 * Settings Modal
 * Unified settings interface for LLM, Canvas, and general preferences
 */
import { ref, watch, onMounted, computed } from 'vue'
import { llmStorage, canvasStorage, themeStorage } from '../lib/storage'
import { providerRegistry } from '../canvas/llm/providers'
import type { ProviderModel } from '../canvas/llm/providers'
import { DEFAULT_SYSTEM_PROMPT, DEFAULT_AGENT_PROMPT } from '../canvas/llm/prompts'

const emit = defineEmits<{
  close: []
}>()

// Active tab
const activeTab = ref<'llm' | 'canvas' | 'general'>('llm')

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
    if (selectedProvider.value === 'openai') return 'https://api.openai.com'
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
    if (selectedProvider.value === 'openai') return 'gpt-4o'
    if (selectedProvider.value === 'anthropic') return 'claude-3-5-sonnet-20241022'
    return ''
  },
  set: (value: string) => setConfigValue('model', value)
})

const timeout = computed({
  get: () => (currentConfig.value.timeout as number) || 300000,  // 5 min default for large context
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

// Chain context limit (how much content from connected nodes to include)
const chainContextLimit = ref(llmStorage.getChainContextLimit())
watch(chainContextLimit, (value) => {
  llmStorage.setChainContextLimit(value)
})

// System prompt (shared across providers)
const llmSystemPrompt = ref(llmStorage.getSystemPrompt(''))

// Agent prompt (for graph builder agent)
const llmAgentPrompt = ref(llmStorage.getAgentPrompt(''))

// Canvas Settings
const gridSnap = ref(canvasStorage.getGridSnap())
const gridSize = ref(canvasStorage.getGridSize())
const edgeStyle = ref(canvasStorage.getEdgeStyle())

// General Settings
const theme = ref(themeStorage.get())

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
  if (!requiresApiKey.value) {
    apiKeyStatus.value = 'idle'
    return
  }

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

  // Apply config with new API key
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
      // Also fetch models on successful validation
      providerStatus.value = 'online'
      const models = await provider.listModels()
      availableModels.value = models
    }
  } catch {
    apiKeyStatus.value = 'invalid'
  }
}

// Save system prompt
function saveSystemPrompt() {
  llmStorage.setSystemPrompt(llmSystemPrompt.value)
}

// Save agent prompt
function saveAgentPrompt() {
  llmStorage.setAgentPrompt(llmAgentPrompt.value)
}

// Save Canvas settings
function saveCanvasSettings() {
  canvasStorage.setGridSnap(gridSnap.value)
  canvasStorage.setGridSize(gridSize.value)
  canvasStorage.setEdgeStyle(edgeStyle.value)
}

// Save General settings
function saveGeneralSettings() {
  themeStorage.set(theme.value)
  document.documentElement.setAttribute('data-theme', theme.value)
}

// Auto-save on changes
watch(selectedProvider, saveActiveProvider)
watch(llmSystemPrompt, saveSystemPrompt)
watch(llmAgentPrompt, saveAgentPrompt)
watch([gridSnap, gridSize, edgeStyle], saveCanvasSettings)
watch(theme, saveGeneralSettings)
watch([maxTokens, contextWindow, timeout, selectedModel], saveProviderConfig)

// Refresh models when URL changes
let fetchDebounceTimer: ReturnType<typeof setTimeout> | null = null
watch(baseUrl, () => {
  if (fetchDebounceTimer) clearTimeout(fetchDebounceTimer)
  fetchDebounceTimer = setTimeout(() => fetchModels(), 500)
})

// Validate API key when it changes
let validateDebounceTimer: ReturnType<typeof setTimeout> | null = null
watch(apiKey, () => {
  if (validateDebounceTimer) clearTimeout(validateDebounceTimer)
  validateDebounceTimer = setTimeout(() => validateApiKey(), 800)
})

onMounted(() => {
  loadStoredConfigs()
  fetchModels()
})

function handleClose() {
  emit('close')
}

function resetSystemPrompt() {
  llmSystemPrompt.value = ''
  llmStorage.setSystemPrompt('')
}

function resetAgentPrompt() {
  llmAgentPrompt.value = ''
  llmStorage.setAgentPrompt('')
}

// Display timeout in seconds for UI
const timeoutSeconds = computed({
  get: () => Math.round(timeout.value / 1000),
  set: (value: number) => { timeout.value = value * 1000 }
})
</script>

<template>
  <div class="settings-overlay" @click.self="handleClose">
    <div class="settings-modal">
      <header class="settings-header">
        <h2>Settings</h2>
        <button class="close-btn" title="Close" @click="handleClose">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </header>

      <nav class="settings-tabs">
        <button
          :class="{ active: activeTab === 'llm' }"
          @click="activeTab = 'llm'"
        >
          LLM
        </button>
        <button
          :class="{ active: activeTab === 'canvas' }"
          @click="activeTab = 'canvas'"
        >
          Canvas
        </button>
        <button
          :class="{ active: activeTab === 'general' }"
          @click="activeTab = 'general'"
        >
          General
        </button>
      </nav>

      <div class="settings-content">
        <!-- LLM Settings -->
        <div v-if="activeTab === 'llm'" class="settings-section">
          <!-- Provider Selection -->
          <div class="setting-group">
            <label>Provider</label>
            <div class="input-with-status">
              <select v-model="selectedProvider">
                <option v-for="p in providers" :key="p.id" :value="p.id">
                  {{ p.name }}
                </option>
              </select>
              <span
                class="status-indicator"
                :class="providerStatus"
                :title="providerStatus === 'online' ? 'Connected' : providerStatus === 'offline' ? 'Not connected' : 'Checking...'"
              />
            </div>
          </div>

          <!-- API Key (for providers that need it) -->
          <div v-if="requiresApiKey" class="setting-group">
            <label>API Key</label>
            <div class="input-with-status">
              <input
                v-model="apiKey"
                type="password"
                placeholder="Enter your API key"
              />
              <button
                v-if="apiKey && apiKeyStatus !== 'validating'"
                class="validate-btn"
                title="Validate API key"
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
                :title="apiKeyStatus === 'valid' ? 'Valid' : apiKeyStatus === 'invalid' ? 'Invalid' : 'Validating...'"
              />
            </div>
            <span class="hint">
              {{ selectedProvider === 'openai' ? 'Get your key at platform.openai.com' : 'Get your key at console.anthropic.com' }}
            </span>
          </div>

          <!-- Base URL -->
          <div class="setting-group">
            <label>{{ selectedProvider === 'ollama' ? 'Ollama URL' : 'Base URL' }}</label>
            <input
              v-model="baseUrl"
              type="text"
              :placeholder="selectedProvider === 'ollama' ? 'http://localhost:11434' : 'API base URL'"
            />
          </div>

          <!-- Model Selection -->
          <div class="setting-group">
            <label>Model</label>
            <div class="model-select">
              <select v-model="selectedModel" :disabled="loadingModels">
                <option v-if="availableModels.length === 0" :value="selectedModel">
                  {{ selectedModel }}
                </option>
                <option v-for="model in availableModels" :key="model.id" :value="model.id">
                  {{ model.name || model.id }}
                </option>
              </select>
              <button
                class="refresh-btn"
                :disabled="loadingModels"
                title="Refresh models"
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
          </div>

          <!-- Max Tokens -->
          <div class="setting-group">
            <label>Max Tokens</label>
            <input
              v-model.number="maxTokens"
              type="number"
              min="256"
              max="128000"
              step="256"
            />
            <span class="hint">Maximum tokens in response</span>
          </div>

          <!-- Context Window (num_ctx for Ollama) -->
          <div class="setting-group">
            <label>Context Window</label>
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
            <span class="hint">Model context size in tokens (Llama 3.1: up to 131072)</span>
          </div>

          <!-- Timeout -->
          <div class="setting-group">
            <label>Timeout (seconds)</label>
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
            <label>Neighbor Context</label>
            <div class="slider-group">
              <input
                v-model.number="chainContextLimit"
                type="range"
                min="0"
                max="200000"
                step="10000"
                class="slider"
              />
              <span class="slider-value">{{ chainContextLimit === 0 ? 'Off' : (chainContextLimit / 1000) + 'k' }}</span>
            </div>
            <span class="hint">Include content from linked nodes when asking LLM</span>
          </div>

          <!-- System Prompt -->
          <div class="setting-group">
            <label>
              System Prompt (simple generation)
              <button class="text-btn" @click="resetSystemPrompt">Reset</button>
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
              Agent Prompt (graph builder)
              <button class="text-btn" @click="resetAgentPrompt">Reset</button>
            </label>
            <textarea
              v-model="llmAgentPrompt"
              rows="6"
              :placeholder="DEFAULT_AGENT_PROMPT"
            />
          </div>
        </div>

        <!-- Canvas Settings -->
        <div v-if="activeTab === 'canvas'" class="settings-section">
          <div class="setting-group">
            <label class="checkbox-label">
              <input v-model="gridSnap" type="checkbox" />
              Snap to Grid
            </label>
          </div>

          <div class="setting-group">
            <label>Grid Size (px)</label>
            <input
              v-model.number="gridSize"
              type="number"
              min="5"
              max="100"
              step="5"
            />
          </div>

          <div class="setting-group">
            <label>Edge Style</label>
            <div class="radio-group">
              <label class="radio-label">
                <input v-model="edgeStyle" type="radio" value="orthogonal" />
                <span class="radio-icon">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M4 20 L4 12 L20 12 L20 4" />
                  </svg>
                </span>
                Orthogonal
              </label>
              <label class="radio-label">
                <input v-model="edgeStyle" type="radio" value="diagonal" />
                <span class="radio-icon">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M4 20 L12 12 L20 12 L20 4" />
                  </svg>
                </span>
                Diagonal
              </label>
            </div>
          </div>
        </div>

        <!-- General Settings -->
        <div v-if="activeTab === 'general'" class="settings-section">
          <div class="setting-group">
            <label>Theme</label>
            <div class="radio-group">
              <label class="radio-label">
                <input v-model="theme" type="radio" value="light" />
                <span class="theme-icon light">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="5" />
                    <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
                  </svg>
                </span>
                Light
              </label>
              <label class="radio-label">
                <input v-model="theme" type="radio" value="dark" />
                <span class="theme-icon dark">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
                  </svg>
                </span>
                Dark
              </label>
              <label class="radio-label">
                <input v-model="theme" type="radio" value="pitch-black" />
                <span class="theme-icon pitch-black">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="none">
                    <circle cx="12" cy="12" r="10" />
                  </svg>
                </span>
                Pitch Black
              </label>
              <label class="radio-label">
                <input v-model="theme" type="radio" value="cyber" />
                <span class="theme-icon cyber">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polygon points="12 2 22 8.5 22 15.5 12 22 2 15.5 2 8.5 12 2" />
                    <line x1="12" y1="22" x2="12" y2="15.5" />
                    <polyline points="22 8.5 12 15.5 2 8.5" />
                  </svg>
                </span>
                Cyber
              </label>
            </div>
          </div>

          <div class="setting-group">
            <label>About</label>
            <div class="about-info">
              <p><strong>Nodus</strong> - Local-first knowledge graph</p>
              <p class="version">Version 0.1.0</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.settings-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
}

.settings-modal {
  background: var(--bg-node, #ffffff);
  border-radius: 12px;
  width: 500px;
  max-width: 90vw;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  border: 1px solid var(--border-node, #e4e4e7);
}

:is([data-theme='dark'], [data-theme='pitch-black'], [data-theme='cyber']) .settings-modal {
  background: #27272a;
  border-color: #3f3f46;
}

.settings-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-node, #e4e4e7);
  background: inherit;
}

.settings-header h2 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--text-main, #18181b);
}

:is([data-theme='dark'], [data-theme='pitch-black'], [data-theme='cyber']) .settings-header h2 {
  color: #f4f4f5;
}

.close-btn {
  background: none;
  border: none;
  padding: 4px;
  cursor: pointer;
  color: var(--text-muted, #71717a);
  border-radius: 4px;
}

.close-btn:hover {
  background: var(--border-node, #e4e4e7);
  color: var(--text-main, #18181b);
}

:is([data-theme='dark'], [data-theme='pitch-black'], [data-theme='cyber']) .close-btn:hover {
  background: #3f3f46;
  color: #f4f4f5;
}

.settings-tabs {
  display: flex;
  gap: 4px;
  padding: 12px 20px;
  border-bottom: 1px solid var(--border-node, #e4e4e7);
  background: inherit;
}

.settings-tabs button {
  background: none;
  border: none;
  padding: 8px 16px;
  cursor: pointer;
  color: var(--text-muted, #71717a);
  font-size: 14px;
  border-radius: 6px;
  transition: all 0.15s;
}

.settings-tabs button:hover {
  background: var(--border-node, #e4e4e7);
  color: var(--text-main, #18181b);
}

:is([data-theme='dark'], [data-theme='pitch-black'], [data-theme='cyber']) .settings-tabs button:hover {
  background: #3f3f46;
  color: #f4f4f5;
}

.settings-tabs button.active {
  background: var(--primary-color, #3b82f6);
  color: white;
}

.settings-content {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
  background: inherit;
}

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

.status-indicator.checking {
  background: #f59e0b;
  animation: pulse 1s infinite;
}

.status-indicator.online {
  background: #10b981;
}

.status-indicator.offline {
  background: #ef4444;
}

.status-indicator.validating {
  background: #f59e0b;
  animation: pulse 1s infinite;
}

.status-indicator.valid {
  background: #10b981;
}

.status-indicator.invalid {
  background: #ef4444;
}

.validate-btn {
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

:is([data-theme='dark'], [data-theme='pitch-black'], [data-theme='cyber']) .validate-btn {
  background: #3f3f46;
  color: #f4f4f5;
}

.validate-btn:hover {
  background: var(--primary-color, #3b82f6);
  color: white;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.model-select {
  display: flex;
  gap: 8px;
}

.model-select select {
  flex: 1;
}

.refresh-btn {
  padding: 8px;
  background: var(--border-node, #e4e4e7);
  border: none;
  border-radius: 6px;
  cursor: pointer;
  color: var(--text-main, #18181b);
}

:is([data-theme='dark'], [data-theme='pitch-black'], [data-theme='cyber']) .refresh-btn {
  background: #3f3f46;
  color: #f4f4f5;
}

.refresh-btn:hover {
  background: var(--primary-color, #3b82f6);
  color: white;
}

.refresh-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.spinning {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
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
  gap: 8px;
  cursor: pointer;
  font-weight: normal !important;
}

.checkbox-label input {
  width: 16px;
  height: 16px;
  cursor: pointer;
}

.radio-group {
  display: flex;
  gap: 16px;
}

.radio-label {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  padding: 8px 12px;
  border: 1px solid var(--border-node, #e4e4e7);
  border-radius: 6px;
  transition: all 0.15s;
  background: var(--bg-canvas, #f4f4f5);
  color: var(--text-main, #18181b);
}

:is([data-theme='dark'], [data-theme='pitch-black'], [data-theme='cyber']) .radio-label {
  background: #18181b;
  border-color: #3f3f46;
  color: #f4f4f5;
}

.radio-label:hover {
  border-color: var(--primary-color, #3b82f6);
}

.radio-label:has(input:checked) {
  border-color: var(--primary-color, #3b82f6);
  background: color-mix(in srgb, var(--primary-color, #3b82f6) 10%, transparent);
}

.radio-label input {
  display: none;
}

.radio-icon,
.theme-icon {
  display: flex;
  align-items: center;
  justify-content: center;
}

.theme-icon.light svg {
  color: #f59e0b;
}

.theme-icon.dark svg {
  color: #6366f1;
}

.theme-icon.pitch-black svg {
  color: #000000;
}

.theme-icon.cyber svg {
  color: #00ffcc;
}

.about-info {
  padding: 12px;
  background: var(--bg-canvas, #f4f4f5);
  border-radius: 6px;
}

:is([data-theme='dark'], [data-theme='pitch-black'], [data-theme='cyber']) .about-info {
  background: #18181b;
}

.about-info p {
  margin: 0;
  font-size: 13px;
  color: var(--text-main, #18181b);
}

:is([data-theme='dark'], [data-theme='pitch-black'], [data-theme='cyber']) .about-info p {
  color: #f4f4f5;
}

.about-info .version {
  color: var(--text-muted, #71717a);
  margin-top: 4px;
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

.slider-group {
  display: flex;
  align-items: center;
  gap: 12px;
}

.slider-group .slider {
  flex: 1;
  height: 4px;
  -webkit-appearance: none;
  appearance: none;
  background: var(--border-node, #e4e4e7);
  border-radius: 2px;
  cursor: pointer;
}

:is([data-theme='dark'], [data-theme='pitch-black'], [data-theme='cyber']) .slider-group .slider {
  background: #3f3f46;
}

.slider-group .slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 16px;
  height: 16px;
  background: var(--primary-color, #3b82f6);
  border-radius: 50%;
  cursor: pointer;
}

.slider-group .slider::-moz-range-thumb {
  width: 16px;
  height: 16px;
  background: var(--primary-color, #3b82f6);
  border: none;
  border-radius: 50%;
  cursor: pointer;
}

.slider-group .slider-value {
  min-width: 48px;
  text-align: right;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-main, #18181b);
}

:is([data-theme='dark'], [data-theme='pitch-black'], [data-theme='cyber']) .slider-group .slider-value {
  color: #f4f4f5;
}
</style>
