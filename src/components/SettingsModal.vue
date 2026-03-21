<script setup lang="ts">
/**
 * Settings Modal
 * Unified settings interface for LLM, Canvas, and general preferences
 */
import { ref, watch, onMounted, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { llmStorage, canvasStorage, tagStorage } from '../lib/storage'
import { useThemesStore } from '../stores/themes'
import { useNodesStore } from '../stores/nodes'
import { setLocale, getLocale, loadLocale } from '../i18n'
import LLMSettingsPanel from './settings/LLMSettingsPanel.vue'
import { useZotero } from '../canvas/composables/useZotero'

const { t } = useI18n()
const themesStore = useThemesStore()
const nodesStore = useNodesStore()

const emit = defineEmits<{
  close: []
}>()

// Active tab
const activeTab = ref<'llm' | 'canvas' | 'themes' | 'general' | 'zotero'>('general')

// Zotero integration
const zotero = useZotero()

// LLM enabled toggle
const llmEnabled = ref(llmStorage.getLLMEnabled())

// Canvas Settings
const gridSnap = ref(canvasStorage.getGridSnap())
const gridSize = ref(canvasStorage.getGridSize())
const edgeStyle = ref<'orthogonal' | 'diagonal' | 'curved' | 'hyperbolic' | 'straight'>(canvasStorage.getEdgeStyle())

// Tag Settings
const showTagNodes = ref(tagStorage.getShowTagNodes())

// Language Settings
const selectedLanguage = ref(getLocale())

watch(selectedLanguage, async (locale) => {
  await loadLocale(locale)
  setLocale(locale)
})

// Theme is handled by themes store
const selectedTheme = computed({
  get: () => themesStore.currentThemeName,
  set: (name: string) => themesStore.setTheme(name),
})

// Save Canvas settings
function saveCanvasSettings() {
  canvasStorage.setGridSnap(gridSnap.value)
  canvasStorage.setGridSize(gridSize.value)
  canvasStorage.setEdgeStyle(edgeStyle.value)
}

// Save Tag settings
function saveTagSettings() {
  tagStorage.setShowTagNodes(showTagNodes.value)
  window.dispatchEvent(new CustomEvent('nodus-tag-nodes-change', { detail: showTagNodes.value }))
}

// Auto-save on changes
watch([gridSnap, gridSize, edgeStyle], saveCanvasSettings)
watch(showTagNodes, saveTagSettings)

onMounted(async () => {
  await themesStore.initialize()
})

// Watch LLM enabled toggle
watch(llmEnabled, (value) => {
  llmStorage.setLLMEnabled(value)
  window.dispatchEvent(new CustomEvent('nodus-llm-enabled-change', { detail: value }))
  if (!value && activeTab.value === 'llm') {
    activeTab.value = 'general'
  }
})

function handleClose() {
  emit('close')
}

// Delete custom theme
async function deleteCustomTheme(id: string) {
  if (confirm(t('settings.deleteTheme'))) {
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

</script>

<template>
  <div class="settings-overlay" @click.self="handleClose">
    <div class="settings-modal">
      <header class="settings-header">
        <h2>{{ t('settings.title') }}</h2>
        <button class="close-btn" :data-tooltip="t('common.close')" @click="handleClose">
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
          {{ t('settings.tabs.general') }}
        </button>
        <button
          :class="{ active: activeTab === 'themes' }"
          @click="activeTab = 'themes'"
        >
          {{ t('settings.tabs.themes') }}
        </button>
        <button
          :class="{ active: activeTab === 'canvas' }"
          @click="activeTab = 'canvas'"
        >
          {{ t('settings.tabs.canvas') }}
        </button>
        <button
          v-if="llmEnabled"
          :class="{ active: activeTab === 'llm' }"
          @click="activeTab = 'llm'"
        >
          {{ t('settings.tabs.llm') }}
        </button>
        <button
          :class="{ active: activeTab === 'zotero' }"
          @click="activeTab = 'zotero'"
        >
          {{ t('settings.tabs.zotero') }}
        </button>
      </nav>

      <div class="settings-content">
        <!-- LLM Settings -->
        <LLMSettingsPanel v-if="activeTab === 'llm'" />

        <!-- Canvas Settings -->
        <div v-if="activeTab === 'canvas'" class="settings-section">
          <div class="setting-group">
            <label class="checkbox-label">
              <input v-model="gridSnap" type="checkbox" />
              {{ t('settings.gridSnap') }}
            </label>
          </div>

          <div class="setting-group">
            <label>{{ t('settings.gridSize') }} ({{ t('settings.gridSizeUnit') }})</label>
            <input
              v-model.number="gridSize"
              type="number"
              min="5"
              max="100"
              step="5"
            />
          </div>

          <div class="setting-group">
            <label>{{ t('settings.edgeStyle') }}</label>
            <div class="edge-style-grid">
              <label class="edge-style-option">
                <input v-model="edgeStyle" type="radio" value="orthogonal" />
                <svg width="32" height="24" viewBox="0 0 32 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M4 20 L4 12 L28 12 L28 4" />
                </svg>
                <span>{{ t('settings.edgeStyles.orthogonal') }}</span>
              </label>
              <label class="edge-style-option">
                <input v-model="edgeStyle" type="radio" value="diagonal" />
                <svg width="32" height="24" viewBox="0 0 32 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M4 20 L16 12 L28 4" />
                </svg>
                <span>{{ t('settings.edgeStyles.diagonal') }}</span>
              </label>
              <label class="edge-style-option">
                <input v-model="edgeStyle" type="radio" value="curved" />
                <svg width="32" height="24" viewBox="0 0 32 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M4 20 C4 12, 28 12, 28 4" />
                </svg>
                <span>{{ t('settings.edgeStyles.curved') }}</span>
              </label>
              <label class="edge-style-option">
                <input v-model="edgeStyle" type="radio" value="hyperbolic" />
                <svg width="32" height="24" viewBox="0 0 32 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M4 20 L4 16 C10 16, 22 8, 28 8 L28 4" />
                </svg>
                <span>{{ t('settings.edgeStyles.hyperbolic') }}</span>
              </label>
              <label class="edge-style-option">
                <input v-model="edgeStyle" type="radio" value="straight" />
                <svg width="32" height="24" viewBox="0 0 32 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M4 20 L28 4" />
                </svg>
                <span>{{ t('settings.edgeStyles.straight') }}</span>
              </label>
            </div>
          </div>

          <div class="setting-group">
            <label class="checkbox-label">
              <input v-model="showTagNodes" type="checkbox" />
              {{ t('settings.showTagNodes') }}
            </label>
            <span class="hint">{{ t('settings.showTagNodesHint') }}</span>
          </div>
        </div>

        <!-- General Settings -->
        <div v-if="activeTab === 'general'" class="settings-section">
          <div class="setting-group">
            <label>{{ t('settings.language') }}</label>
            <select v-model="selectedLanguage" class="language-select">
              <option value="en">English</option>
              <option value="de">Deutsch</option>
              <option value="fr">Francais</option>
              <option value="es">Espanol</option>
              <option value="it">Italiano</option>
            </select>
          </div>

          <div class="setting-group">
            <label class="checkbox-label">
              <input v-model="llmEnabled" type="checkbox" />
              {{ t('settings.llmEnabled') }}
            </label>
            <span class="hint">{{ t('settings.llmEnabledHint') }}</span>
          </div>

          <!-- Workspace Diagnostics -->
          <div class="setting-group">
            <label>{{ t('settings.workspaceDiagnostics') }}</label>
            <button
              class="scan-btn"
              :disabled="scanningWorkspaces"
              @click="scanWorkspaces"
            >
              {{ scanningWorkspaces ? t('settings.scanning') : t('settings.scanWorkspaces') }}
            </button>
            <div v-if="workspaceStats.length > 0" class="workspace-stats">
              <table>
                <thead>
                  <tr>
                    <th>{{ t('settings.workspace') }}</th>
                    <th>{{ t('settings.nodes') }}</th>
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
                        {{ ws.name === '(deleted)' ? t('settings.recover') : t('settings.switch') }}
                      </button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <span class="hint">
              {{ t('settings.workspaceStatsHint') }}
            </span>
          </div>

          <div class="setting-group">
            <label>{{ t('settings.about') }}</label>
            <div class="about-info">
              <p><strong>{{ t('app.name') }}</strong> - {{ t('settings.aboutDescription') }}</p>
              <p class="version">{{ t('settings.version') }} 0.2.2</p>
            </div>
          </div>
        </div>

        <!-- Themes Settings -->
        <div v-if="activeTab === 'themes'" class="settings-section">
          <div class="setting-group">
            <label>{{ t('settings.tabs.themes') }} ({{ themesStore.themes.length }} {{ t('settings.themeCount') }})</label>
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
                  :data-tooltip="t('common.delete')"
                  @click.prevent.stop="deleteCustomTheme(theme.id)"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              </label>
            </div>
            <span class="hint">
              {{ t('settings.themeHint') }}
            </span>
          </div>
        </div>

        <!-- Zotero Settings -->
        <div v-if="activeTab === 'zotero'" class="settings-section">
          <div class="setting-group">
            <label>{{ t('settings.zotero.library') }}</label>

            <div v-if="!zotero.isConnected.value" class="zotero-connect">
              <button
                class="detect-btn"
                :disabled="zotero.isLoading.value"
                @click="zotero.detectZotero()"
              >
                {{ zotero.isLoading.value ? t('settings.zotero.detecting') : t('settings.zotero.detect') }}
              </button>
              <span class="hint">{{ t('settings.zotero.detectHint') }}</span>
            </div>

            <div v-else class="zotero-connected">
              <div class="connected-status">
                <span class="status-icon">&#10003;</span>
                <span>{{ t('settings.zotero.connected') }}</span>
                <button class="disconnect-btn" @click="zotero.disconnect()">
                  {{ t('settings.zotero.disconnect') }}
                </button>
              </div>
              <div class="zotero-path">{{ zotero.zoteroPath.value }}</div>
            </div>

            <div v-if="zotero.error.value" class="error-message">
              {{ zotero.error.value }}
            </div>
          </div>

          <div v-if="zotero.isConnected.value" class="setting-group">
            <label>{{ t('settings.zotero.collections') }} ({{ zotero.collections.value.length }})</label>

            <div v-if="zotero.isLoading.value" class="loading">
              {{ t('settings.zotero.loading') }}
            </div>

            <div v-else-if="zotero.collections.value.length === 0" class="no-collections">
              {{ t('settings.zotero.noCollections') }}
            </div>

            <div v-else class="collections-list">
              <div
                v-for="collection in zotero.topLevelCollections.value"
                :key="collection.key"
                class="collection-item"
              >
                <span class="collection-name">{{ collection.name }}</span>
                <span class="collection-count">{{ collection.item_count }}</span>
              </div>
            </div>

            <span class="hint">{{ t('settings.zotero.collectionsHint') }}</span>
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

/* Zotero Settings */
.zotero-connect {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.detect-btn {
  padding: 10px 20px;
  font-size: 14px;
  background: var(--primary-color, #3b82f6);
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  transition: opacity 0.15s;
}

.detect-btn:hover:not(:disabled) {
  opacity: 0.9;
}

.detect-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.zotero-connected {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.connected-status {
  display: flex;
  align-items: center;
  gap: 8px;
}

.status-icon {
  color: #22c55e;
  font-weight: bold;
}

.disconnect-btn {
  margin-left: auto;
  padding: 4px 12px;
  font-size: 12px;
  background: transparent;
  border: 1px solid var(--border-node, #e4e4e7);
  border-radius: 4px;
  cursor: pointer;
  color: var(--text-muted, #71717a);
}

.disconnect-btn:hover {
  background: var(--bg-canvas, #f4f4f5);
  color: var(--text-main, #18181b);
}

:is([data-theme='dark'], [data-theme='pitch-black'], [data-theme='cyber']) .disconnect-btn {
  border-color: #3f3f46;
}

:is([data-theme='dark'], [data-theme='pitch-black'], [data-theme='cyber']) .disconnect-btn:hover {
  background: #3f3f46;
  color: #f4f4f5;
}

.zotero-path {
  font-size: 12px;
  color: var(--text-muted, #71717a);
  font-family: monospace;
  word-break: break-all;
}

.error-message {
  color: #ef4444;
  font-size: 13px;
  padding: 8px;
  background: rgba(239, 68, 68, 0.1);
  border-radius: 4px;
}

.loading {
  color: var(--text-muted, #71717a);
  font-size: 13px;
  font-style: italic;
}

.no-collections {
  color: var(--text-muted, #71717a);
  font-size: 13px;
}

.collections-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 200px;
  overflow-y: auto;
}

.collection-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  background: var(--bg-canvas, #f4f4f5);
  border-radius: 6px;
  font-size: 13px;
}

:is([data-theme='dark'], [data-theme='pitch-black'], [data-theme='cyber']) .collection-item {
  background: #18181b;
}

.collection-name {
  color: var(--text-main, #18181b);
}

:is([data-theme='dark'], [data-theme='pitch-black'], [data-theme='cyber']) .collection-name {
  color: #f4f4f5;
}

.collection-count {
  color: var(--text-muted, #71717a);
  font-size: 12px;
}
</style>
