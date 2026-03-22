<script setup lang="ts">
/**
 * Settings Modal
 * Unified settings interface for LLM, Canvas, and general preferences
 */
import { ref, watch, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { llmStorage } from '../lib/storage'
import { useThemesStore } from '../stores/themes'
import { setLocale, getLocale, loadLocale } from '../i18n'
import LLMSettingsPanel from './settings/LLMSettingsPanel.vue'
import CanvasSettingsPanel from './settings/CanvasSettingsPanel.vue'
import ThemeSettingsPanel from './settings/ThemeSettingsPanel.vue'
import WorkspaceDiagnosticsSection from './settings/WorkspaceDiagnosticsSection.vue'
import { useZotero } from '../composables/useZotero'

const { t } = useI18n()
const themesStore = useThemesStore()

const emit = defineEmits<{
  close: []
}>()

// Active tab
const activeTab = ref<'llm' | 'canvas' | 'themes' | 'general' | 'zotero'>('general')

// Zotero integration
const zotero = useZotero()

// LLM enabled toggle
const llmEnabled = ref(llmStorage.getLLMEnabled())

// Language Settings
const selectedLanguage = ref(getLocale())

watch(selectedLanguage, async (locale) => {
  await loadLocale(locale)
  setLocale(locale)
})

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
        <CanvasSettingsPanel v-if="activeTab === 'canvas'" />

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
          <WorkspaceDiagnosticsSection @close="handleClose" />

          <div class="setting-group">
            <label>{{ t('settings.about') }}</label>
            <div class="about-info">
              <p><strong>{{ t('app.name') }}</strong> - {{ t('settings.aboutDescription') }}</p>
              <p class="version">{{ t('settings.version') }} 0.2.2</p>
            </div>
          </div>
        </div>

        <!-- Themes Settings -->
        <ThemeSettingsPanel v-if="activeTab === 'themes'" />

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

.setting-group select {
  padding: 8px 12px;
  border: 1px solid var(--border-node, #e4e4e7);
  border-radius: 6px;
  background: var(--bg-canvas, #f4f4f5);
  color: var(--text-main, #18181b);
  font-size: 14px;
}

:is([data-theme='dark'], [data-theme='pitch-black'], [data-theme='cyber']) .setting-group select {
  background: #18181b;
  border-color: #3f3f46;
  color: #f4f4f5;
}

.setting-group select:focus {
  outline: none;
  border-color: var(--primary-color, #3b82f6);
}

.hint {
  font-size: 11px;
  color: var(--text-muted, #71717a);
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
