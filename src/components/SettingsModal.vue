<script setup lang="ts">
/**
 * Settings Modal
 * Unified settings interface for LLM, Canvas, and general preferences
 */
import { ref, watch, onMounted, computed } from 'vue'
import { llmStorage, canvasStorage } from '../lib/storage'
import { providerRegistry } from '../canvas/llm/providers'
import type { ProviderModel } from '../canvas/llm/providers'
import { DEFAULT_SYSTEM_PROMPT, DEFAULT_AGENT_PROMPT } from '../canvas/llm/prompts'
import { useThemesStore } from '../stores/themes'
import { useNodesStore } from '../stores/nodes'

const themesStore = useThemesStore()
const nodesStore = useNodesStore()

const emit = defineEmits<{
  close: []
}>()

// Active tab
const activeTab = ref<'llm' | 'canvas' | 'themes' | 'general'>('general')

// LLM enabled toggle
const llmEnabled = ref(llmStorage.getLLMEnabled())
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
    if (selectedProvider.value === 'openai-compatible') return ''  // User must select/enter
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

// System prompt (shared across providers)
const llmSystemPrompt = ref(llmStorage.getSystemPrompt(''))

// Agent prompt (for graph builder agent)
const llmAgentPrompt = ref(llmStorage.getAgentPrompt(''))

// Canvas Settings
const gridSnap = ref(canvasStorage.getGridSnap())
const gridSize = ref(canvasStorage.getGridSize())
const edgeStyle = ref<'orthogonal' | 'diagonal' | 'curved' | 'straight'>(canvasStorage.getEdgeStyle())

// Theme is handled by themes store
const selectedTheme = computed({
  get: () => themesStore.currentThemeName,
  set: (name: string) => themesStore.setTheme(name),
})

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

// Validate API key (or just test connection for optional key providers)
async function validateApiKey() {
  // For providers that don't require API key, skip if no key provided
  if (!requiresApiKey.value && !apiKey.value) {
    apiKeyStatus.value = 'idle'
    return
  }

  // For providers that require API key, must have one
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

// Theme changes are handled automatically by the themes store

// Auto-save on changes
watch(selectedProvider, saveActiveProvider)
watch(llmSystemPrompt, saveSystemPrompt)
watch(llmAgentPrompt, saveAgentPrompt)
watch([gridSnap, gridSize, edgeStyle], saveCanvasSettings)
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

onMounted(async () => {
  loadStoredConfigs()
  fetchModels()
  // Refresh themes from database
  await themesStore.initialize()
})

// Watch LLM enabled toggle
watch(llmEnabled, (value) => {
  llmStorage.setLLMEnabled(value)
  // Emit custom event so other components can react
  window.dispatchEvent(new CustomEvent('nodus-llm-enabled-change', { detail: value }))
  // Switch away from LLM tab if disabled
  if (!value && activeTab.value === 'llm') {
    activeTab.value = 'general'
  }
})

// Watch LLM streaming toggle
watch(llmStreaming, (value) => {
  llmStorage.setLLMStreaming(value)
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

// Delete custom theme
async function deleteCustomTheme(id: string) {
  if (confirm('Delete this custom theme?')) {
    await themesStore.deleteTheme(id)
  }
}

// Workspace diagnostics
interface WorkspaceStats {
  id: string
  name: string
  nodeCount: number
}
const workspaceStats = ref<WorkspaceStats[]>([])
const scanningWorkspaces = ref(false)

async function scanWorkspaces() {
  scanningWorkspaces.value = true
  try {
    const { invoke } = await import('@tauri-apps/api/core')

    // Get all nodes from database
    interface NodeWithWorkspace { workspace_id: string | null }
    const allNodes = await invoke<NodeWithWorkspace[]>('get_nodes')

    // Count nodes per workspace
    const counts = new Map<string, number>()
    for (const node of allNodes) {
      const wsId = node.workspace_id || '(none)'
      counts.set(wsId, (counts.get(wsId) || 0) + 1)
    }

    // Build stats with workspace names
    const stats: WorkspaceStats[] = []

    // Add known workspaces
    for (const ws of nodesStore.workspaces) {
      stats.push({
        id: ws.id,
        name: ws.name,
        nodeCount: counts.get(ws.id) || 0
      })
      counts.delete(ws.id)
    }

    // Add orphaned workspace IDs (nodes exist but workspace not in list)
    for (const [wsId, count] of counts) {
      if (wsId !== '(none)') {
        stats.push({
          id: wsId,
          name: '(deleted)',
          nodeCount: count
        })
      }
    }

    // Add nodes with no workspace
    const noWorkspaceCount = counts.get('(none)') || 0
    if (noWorkspaceCount > 0) {
      stats.push({
        id: '',
        name: '(no workspace)',
        nodeCount: noWorkspaceCount
      })
    }

    // Sort by node count descending
    stats.sort((a, b) => b.nodeCount - a.nodeCount)
    workspaceStats.value = stats

    console.log('[Settings] Workspace stats:', stats)
  } catch (e) {
    console.error('[Settings] Failed to scan workspaces:', e)
  } finally {
    scanningWorkspaces.value = false
  }
}

async function switchToWorkspace(id: string) {
  if (id === '') {
    nodesStore.switchWorkspace(null)
  } else {
    // Check if workspace exists in list, if not try to recover it
    const exists = nodesStore.workspaces.some(w => w.id === id)
    if (!exists) {
      await nodesStore.recoverWorkspace(id)
    }
    nodesStore.switchWorkspace(id)
  }
  emit('close')
}

async function recoverOrphanedWorkspace(id: string) {
  recoveringWorkspace.value = id
  try {
    const recovered = await nodesStore.recoverWorkspace(id)
    if (recovered) {
      // Remove from orphaned list
      orphanedWorkspaceIds.value = orphanedWorkspaceIds.value.filter(wsId => wsId !== id)
      // Switch to the recovered workspace
      nodesStore.switchWorkspace(recovered.id)
    }
  } finally {
    recoveringWorkspace.value = null
  }
}
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
          :class="{ active: activeTab === 'general' }"
          @click="activeTab = 'general'"
        >
          General
        </button>
        <button
          :class="{ active: activeTab === 'themes' }"
          @click="activeTab = 'themes'"
        >
          Themes
        </button>
        <button
          :class="{ active: activeTab === 'canvas' }"
          @click="activeTab = 'canvas'"
        >
          Canvas
        </button>
        <button
          v-if="llmEnabled"
          :class="{ active: activeTab === 'llm' }"
          @click="activeTab = 'llm'"
        >
          LLM
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

          <!-- Streaming toggle -->
          <div class="setting-group">
            <label class="checkbox-label">
              <input v-model="llmStreaming" type="checkbox" />
              Enable Streaming
            </label>
            <span class="hint">Stream responses token-by-token (requires provider support)</span>
          </div>

          <!-- API Key (for providers that need or support it) -->
          <div v-if="requiresApiKey || selectedProvider === 'openai-compatible'" class="setting-group">
            <label>API Key {{ !requiresApiKey ? '(optional)' : '' }}</label>
            <div class="input-with-status">
              <input
                v-model="apiKey"
                type="password"
                :placeholder="requiresApiKey ? 'Enter your API key' : 'Optional - leave empty if not required'"
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
              {{ selectedProvider === 'openai' ? 'Get your key at platform.openai.com' : selectedProvider === 'openai-compatible' ? 'Required by some endpoints (e.g., hosted APIs)' : 'Get your key at console.anthropic.com' }}
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
              <div class="model-input-wrapper">
                <input
                  v-model="selectedModel"
                  type="text"
                  list="model-list"
                  placeholder="Enter model name or select from list"
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
                title="Fetch available models"
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
              {{ availableModels.length }} models available
            </span>
            <span v-else class="hint">
              Type model name or click refresh to fetch available models
            </span>
          </div>

          <!-- Max Tokens -->
          <div class="setting-group">
            <label>Max Tokens</label>
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

          <!-- Search API Key -->
          <div class="setting-group">
            <label>Web Search API Key (Tavily)</label>
            <div class="input-with-status">
              <input
                v-model="searchApiKey"
                type="password"
                placeholder="Enter your Tavily API key"
              />
              <button
                v-if="searchApiKey && searchKeyStatus !== 'testing'"
                class="validate-btn"
                title="Test API key"
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
                :title="searchKeyStatus === 'valid' ? 'Valid' : searchKeyStatus === 'invalid' ? 'Invalid' : 'Testing...'"
              />
            </div>
            <span class="hint">
              Free: 1000 searches/month, no credit card. Get key at
              <a href="https://tavily.com/" target="_blank" rel="noopener">tavily.com</a>
            </span>
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
            <div class="edge-style-grid">
              <label class="edge-style-option">
                <input v-model="edgeStyle" type="radio" value="orthogonal" />
                <svg width="32" height="24" viewBox="0 0 32 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M4 20 L4 12 L28 12 L28 4" />
                </svg>
                <span>Orthogonal</span>
              </label>
              <label class="edge-style-option">
                <input v-model="edgeStyle" type="radio" value="diagonal" />
                <svg width="32" height="24" viewBox="0 0 32 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M4 20 L16 12 L28 4" />
                </svg>
                <span>Diagonal</span>
              </label>
              <label class="edge-style-option">
                <input v-model="edgeStyle" type="radio" value="curved" />
                <svg width="32" height="24" viewBox="0 0 32 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M4 20 C4 12, 28 12, 28 4" />
                </svg>
                <span>Curved</span>
              </label>
              <label class="edge-style-option">
                <input v-model="edgeStyle" type="radio" value="straight" />
                <svg width="32" height="24" viewBox="0 0 32 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M4 20 L28 4" />
                </svg>
                <span>Straight</span>
              </label>
            </div>
          </div>
        </div>

        <!-- General Settings -->
        <div v-if="activeTab === 'general'" class="settings-section">
          <div class="setting-group">
            <label class="checkbox-label">
              <input v-model="llmEnabled" type="checkbox" />
              LLM Features
            </label>
            <span class="hint">Show AI prompt bars for graph and nodes</span>
          </div>

          <!-- Workspace Diagnostics -->
          <div class="setting-group">
            <label>Workspace Diagnostics</label>
            <button
              class="scan-btn"
              :disabled="scanningWorkspaces"
              @click="scanWorkspaces"
            >
              {{ scanningWorkspaces ? 'Scanning...' : 'Scan workspaces' }}
            </button>
            <div v-if="workspaceStats.length > 0" class="workspace-stats">
              <table>
                <thead>
                  <tr>
                    <th>Workspace</th>
                    <th>Nodes</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="ws in workspaceStats"
                    :key="ws.id"
                    :class="{ deleted: ws.name === '(deleted)' }"
                  >
                    <td :title="ws.id">{{ ws.name }}</td>
                    <td>{{ ws.nodeCount }}</td>
                    <td>
                      <button
                        v-if="ws.nodeCount > 0"
                        class="switch-btn"
                        @click="switchToWorkspace(ws.id)"
                      >
                        {{ ws.name === '(deleted)' ? 'Recover' : 'Switch' }}
                      </button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <span class="hint">
              Scan to see node counts per workspace and find missing nodes.
            </span>
          </div>

          <div class="setting-group">
            <label>About</label>
            <div class="about-info">
              <p><strong>Nodus</strong> - Local-first knowledge graph</p>
              <p class="version">Version 0.2.2</p>
            </div>
          </div>
        </div>

        <!-- Themes Settings -->
        <div v-if="activeTab === 'themes'" class="settings-section">
          <div class="setting-group">
            <label>Theme ({{ themesStore.themes.length }} available)</label>
            <div class="theme-grid">
              <label
                v-for="theme in themesStore.themes"
                :key="theme.id"
                class="theme-option"
                :class="{ selected: selectedTheme === theme.name }"
              >
                <input
                  v-model="selectedTheme"
                  type="radio"
                  :value="theme.name"
                />
                <span class="theme-preview" :data-theme-preview="theme.name">
                  <span class="preview-dot"></span>
                </span>
                <span class="theme-name">{{ theme.display_name }}</span>
                <button
                  v-if="theme.is_builtin === 0"
                  class="delete-theme-btn"
                  title="Delete theme"
                  @click.prevent.stop="deleteCustomTheme(theme.id)"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              </label>
            </div>
            <span class="hint">
              Use the AI agent to create custom themes: "create a crazy bananas theme"
            </span>
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

.model-input-wrapper {
  flex: 1;
  position: relative;
}

.model-input-wrapper input {
  width: 100%;
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

.edge-style-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
}

.edge-style-option {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 8px;
  border: 1px solid var(--border-node, #e4e4e7);
  border-radius: 6px;
  cursor: pointer;
  transition: border-color 0.15s;
  background: var(--bg-canvas, #f4f4f5);
}

:is([data-theme='dark'], [data-theme='pitch-black'], [data-theme='cyber']) .edge-style-option {
  background: #18181b;
  border-color: #3f3f46;
}

.edge-style-option:hover {
  border-color: var(--primary-color, #3b82f6);
}

.edge-style-option:has(input:checked) {
  border-color: var(--primary-color, #3b82f6);
}

.edge-style-option input {
  display: none;
}

.edge-style-option svg {
  color: var(--text-muted, #71717a);
}

.edge-style-option:has(input:checked) svg {
  color: var(--primary-color, #3b82f6);
}

.edge-style-option span {
  font-size: 11px;
  color: var(--text-muted, #71717a);
}

/* Theme Grid Styles */
.theme-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
  gap: 8px;
}

.theme-option {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 12px 8px;
  border: 1px solid var(--border-node, #e4e4e7);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.15s;
  background: var(--bg-canvas, #f4f4f5);
  position: relative;
}

:is([data-theme='dark'], [data-theme='pitch-black'], [data-theme='cyber']) .theme-option {
  background: #18181b;
  border-color: #3f3f46;
}

.theme-option:hover {
  border-color: var(--primary-color, #3b82f6);
}

.theme-option.selected {
  border-color: var(--primary-color, #3b82f6);
  background: color-mix(in srgb, var(--primary-color, #3b82f6) 10%, transparent);
}

.theme-option input {
  display: none;
}

.theme-preview {
  width: 40px;
  height: 40px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(0, 0, 0, 0.1);
}

/* Theme preview backgrounds */
.theme-preview[data-theme-preview="light"] {
  background: linear-gradient(135deg, #f0f4f8 50%, #ffffff 50%);
}

.theme-preview[data-theme-preview="dark"] {
  background: linear-gradient(135deg, #0f0f12 50%, #1e1e22 50%);
}

.theme-preview[data-theme-preview="pitch-black"] {
  background: linear-gradient(135deg, #000000 50%, #0a0a0a 50%);
}

.theme-preview[data-theme-preview="cyber"] {
  background: linear-gradient(135deg, #0a0a12 50%, #0d1117 50%);
  border-color: rgba(0, 255, 204, 0.3);
}

/* Custom theme previews show a generic gradient */
.theme-preview:not([data-theme-preview="light"]):not([data-theme-preview="dark"]):not([data-theme-preview="pitch-black"]):not([data-theme-preview="cyber"]) {
  background: linear-gradient(135deg, var(--bg-canvas) 50%, var(--bg-surface) 50%);
}

.preview-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.theme-preview[data-theme-preview="light"] .preview-dot {
  background: #3b82f6;
}

.theme-preview[data-theme-preview="dark"] .preview-dot {
  background: #3b82f6;
}

.theme-preview[data-theme-preview="pitch-black"] .preview-dot {
  background: #60a5fa;
}

.theme-preview[data-theme-preview="cyber"] .preview-dot {
  background: #00ffcc;
  box-shadow: 0 0 8px rgba(0, 255, 204, 0.5);
}

.theme-name {
  font-size: 11px;
  font-weight: 500;
  color: var(--text-main, #18181b);
  text-align: center;
}

:is([data-theme='dark'], [data-theme='pitch-black'], [data-theme='cyber']) .theme-name {
  color: #f4f4f5;
}

.delete-theme-btn {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 18px;
  height: 18px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: var(--danger-bg, #fef2f2);
  color: var(--danger-color, #dc2626);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity 0.15s;
}

.theme-option:hover .delete-theme-btn {
  opacity: 1;
}

.delete-theme-btn:hover {
  background: var(--danger-color, #dc2626);
  color: white;
}

/* Orphaned Workspaces Recovery */
.scan-btn {
  padding: 8px 16px;
  font-size: 13px;
  background: var(--bg-canvas, #f4f4f5);
  color: var(--text-main, #18181b);
  border: 1px solid var(--border-node, #e4e4e7);
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s;
}

:is([data-theme='dark'], [data-theme='pitch-black'], [data-theme='cyber']) .scan-btn {
  background: #18181b;
  border-color: #3f3f46;
  color: #f4f4f5;
}

.scan-btn:hover {
  border-color: var(--primary-color, #3b82f6);
}

.scan-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.workspace-stats {
  margin-top: 8px;
  max-height: 300px;
  overflow-y: auto;
}

.workspace-stats table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.workspace-stats th,
.workspace-stats td {
  padding: 8px;
  text-align: left;
  border-bottom: 1px solid var(--border-node, #e4e4e7);
}

:is([data-theme='dark'], [data-theme='pitch-black'], [data-theme='cyber']) .workspace-stats th,
:is([data-theme='dark'], [data-theme='pitch-black'], [data-theme='cyber']) .workspace-stats td {
  border-color: #3f3f46;
}

.workspace-stats th {
  font-weight: 500;
  color: var(--text-muted, #71717a);
  font-size: 11px;
  text-transform: uppercase;
}

.workspace-stats td:first-child {
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.workspace-stats tr.deleted td:first-child {
  color: #ef4444;
}

.switch-btn {
  padding: 4px 10px;
  font-size: 11px;
  background: var(--primary-color, #3b82f6);
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  transition: opacity 0.15s;
}

.switch-btn:hover {
  opacity: 0.9;
}
</style>
