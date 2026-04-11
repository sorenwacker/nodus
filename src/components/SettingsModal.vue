<script setup lang="ts">
/**
 * Settings Modal
 * Unified settings interface with consolidated tabs
 */
import { ref, watch, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { getVersion } from '@tauri-apps/api/app'
import { llmStorage } from '../lib/storage'
import { useThemesStore } from '../stores/themes'
import { setLocale, getLocale, loadLocale } from '../i18n'
import AppearanceSettingsPanel from './settings/AppearanceSettingsPanel.vue'
import CanvasSettingsPanel from './settings/CanvasSettingsPanel.vue'
import LLMSettingsPanel from './settings/LLMSettingsPanel.vue'
import ZoteroSettingsPanel from './settings/ZoteroSettingsPanel.vue'
import WorkspaceDiagnosticsSection from './settings/WorkspaceDiagnosticsSection.vue'

const { t } = useI18n()
const themesStore = useThemesStore()

const emit = defineEmits<{
  close: []
}>()

// Active tab - reduced from 6 to 4 main tabs
const activeTab = ref<'general' | 'appearance' | 'canvas' | 'ai' | 'integrations'>('general')

// App version
const appVersion = ref('')

// LLM enabled toggle
const llmEnabled = ref(llmStorage.getLLMEnabled())

// Language Settings
const selectedLanguage = ref(getLocale())

// Show advanced settings (diagnostics)
const showAdvanced = ref(false)

watch(selectedLanguage, async (locale) => {
  await loadLocale(locale)
  setLocale(locale)
})

onMounted(async () => {
  await themesStore.initialize()
  appVersion.value = await getVersion()
})

// Watch LLM enabled toggle
watch(llmEnabled, (value) => {
  llmStorage.setLLMEnabled(value)
  window.dispatchEvent(new CustomEvent('nodus-llm-enabled-change', { detail: value }))
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
        <button class="close-btn" :title="t('common.close')" @click="handleClose">
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
          :class="{ active: activeTab === 'appearance' }"
          @click="activeTab = 'appearance'"
        >
          {{ t('settings.tabs.appearance') }}
        </button>
        <button
          :class="{ active: activeTab === 'canvas' }"
          @click="activeTab = 'canvas'"
        >
          {{ t('settings.tabs.canvas') }}
        </button>
        <button
          :class="{ active: activeTab === 'integrations' }"
          @click="activeTab = 'integrations'"
        >
          {{ t('settings.tabs.integrations') }}
        </button>
      </nav>

      <div class="settings-content">
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

          <hr class="divider" />

          <div class="setting-group">
            <label>{{ t('settings.about') }}</label>
            <div class="about-info">
              <p><strong>{{ t('app.name') }}</strong> - {{ t('settings.aboutDescription') }}</p>
              <p class="version">{{ t('settings.version') }} {{ appVersion }}</p>
            </div>
          </div>

          <div class="setting-group">
            <label>{{ t('settings.license') }}</label>
            <div class="legal-disclaimer">
              <p>{{ t('settings.licenseText') }}</p>
              <p class="copyright">&copy; 2024-2026 Soren Wacker</p>
            </div>
          </div>

          <hr class="divider" />

          <!-- Advanced Section (collapsible) -->
          <button class="advanced-toggle" @click="showAdvanced = !showAdvanced">
            <svg
              class="chevron"
              :class="{ rotated: showAdvanced }"
              width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
            >
              <path d="M9 18l6-6-6-6"/>
            </svg>
            {{ t('settings.advanced') }}
          </button>

          <div v-if="showAdvanced" class="advanced-section">
            <WorkspaceDiagnosticsSection @close="handleClose" />
          </div>
        </div>

        <!-- Appearance Settings (Themes + Display) -->
        <AppearanceSettingsPanel v-if="activeTab === 'appearance'" />

        <!-- Canvas Settings -->
        <CanvasSettingsPanel v-if="activeTab === 'canvas'" />

        <!-- Integrations (AI + Zotero) -->
        <div v-if="activeTab === 'integrations'" class="settings-section">
          <!-- AI Section -->
          <div class="integration-section">
            <div class="integration-header">
              <label class="checkbox-label">
                <input v-model="llmEnabled" type="checkbox" />
                <span class="integration-title">{{ t('settings.tabs.llm') }}</span>
              </label>
              <span class="hint">{{ t('settings.llmEnabledHint') }}</span>
            </div>

            <div v-if="llmEnabled" class="integration-content">
              <LLMSettingsPanel />
            </div>
          </div>

          <hr class="section-divider" />

          <!-- Zotero Section -->
          <div class="integration-section">
            <div class="integration-header">
              <span class="integration-title">{{ t('settings.tabs.zotero') }}</span>
              <span class="hint">{{ t('settings.zotero.description') }}</span>
            </div>
            <div class="integration-content">
              <ZoteroSettingsPanel />
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
  width: 520px;
  max-width: 90vw;
  max-height: 85vh;
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
  flex-shrink: 0;
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
  flex-shrink: 0;
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
  gap: 16px;
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

.divider {
  border: none;
  border-top: 1px solid var(--border-node, #e4e4e7);
  margin: 4px 0;
}

:is([data-theme='dark'], [data-theme='pitch-black'], [data-theme='cyber']) .divider {
  border-color: #3f3f46;
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

.legal-disclaimer {
  padding: 12px;
  background: var(--bg-canvas, #f4f4f5);
  border-radius: 6px;
  font-size: 12px;
  color: var(--text-muted, #71717a);
}

:is([data-theme='dark'], [data-theme='pitch-black'], [data-theme='cyber']) .legal-disclaimer {
  background: #18181b;
}

.legal-disclaimer p {
  margin: 0;
}

.legal-disclaimer .copyright {
  margin-top: 8px;
  font-size: 11px;
}

/* Advanced toggle */
.advanced-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: transparent;
  border: 1px solid var(--border-node, #e4e4e7);
  border-radius: 6px;
  color: var(--text-muted, #71717a);
  font-size: 13px;
  cursor: pointer;
  transition: all 0.15s;
}

.advanced-toggle:hover {
  background: var(--bg-canvas, #f4f4f5);
  color: var(--text-main, #18181b);
}

:is([data-theme='dark'], [data-theme='pitch-black'], [data-theme='cyber']) .advanced-toggle {
  border-color: #3f3f46;
}

:is([data-theme='dark'], [data-theme='pitch-black'], [data-theme='cyber']) .advanced-toggle:hover {
  background: #3f3f46;
  color: #f4f4f5;
}

.chevron {
  transition: transform 0.2s;
}

.chevron.rotated {
  transform: rotate(90deg);
}

.advanced-section {
  padding-top: 12px;
}

/* Integrations */
.integration-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.integration-header {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.integration-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-main, #18181b);
}

:is([data-theme='dark'], [data-theme='pitch-black'], [data-theme='cyber']) .integration-title {
  color: #f4f4f5;
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}

.checkbox-label input {
  width: 16px;
  height: 16px;
  cursor: pointer;
}

.integration-content {
  padding-left: 4px;
}

.section-divider {
  border: none;
  border-top: 1px solid var(--border-node, #e4e4e7);
  margin: 16px 0;
}

:is([data-theme='dark'], [data-theme='pitch-black'], [data-theme='cyber']) .section-divider {
  border-color: #3f3f46;
}
</style>
