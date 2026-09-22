<script setup lang="ts">
/**
 * Settings Modal
 * Unified settings interface with consolidated tabs
 */
import { ref, watch, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { getVersion } from '@tauri-apps/api/app'
import { useThemesStore } from '../stores/themes'
import { setLocale, getLocale } from '../i18n'
import AppearanceSettingsPanel from './settings/AppearanceSettingsPanel.vue'
import CanvasSettingsPanel from './settings/CanvasSettingsPanel.vue'
import LLMSettingsPanel from './settings/LLMSettingsPanel.vue'
import ZoteroSettingsPanel from './settings/ZoteroSettingsPanel.vue'
import McpSettingsPanel from './settings/McpSettingsPanel.vue'
import WorkspaceDiagnosticsSection from './settings/WorkspaceDiagnosticsSection.vue'
import SettingsSection from './settings/SettingsSection.vue'
import { SETTINGS_TABS, type SettingsTabId } from './settings/tabs'
import './settings/settings-controls.css'
import { useUpdateCheck } from '../composables/useUpdateCheck'

const { t } = useI18n()
const themesStore = useThemesStore()

const emit = defineEmits<{
  close: []
  replayTour: []
}>()

// Reads and writes the same stored preference the launch check consults
const updateCheck = useUpdateCheck()

const activeTab = ref<SettingsTabId>('general')

// App version
const appVersion = ref('')

// Language Settings
const selectedLanguage = ref(getLocale())

watch(selectedLanguage, async (locale) => {
  setLocale(locale)
})

onMounted(async () => {
  await themesStore.initialize()
  appVersion.value = await getVersion()
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
          v-for="tab in SETTINGS_TABS"
          :key="tab.id"
          :class="{ active: activeTab === tab.id }"
          @click="activeTab = tab.id"
        >
          {{ t(tab.labelKey) }}
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

          <div class="setting-group">
            <label class="checkbox-label">
              <input
                type="checkbox"
                :checked="updateCheck.enabled.value"
                @change="updateCheck.setEnabled(($event.target as HTMLInputElement).checked)"
              />
              {{ t('updates.checkAutomatically') }}
            </label>
            <p class="setting-hint">{{ t('updates.checkHint') }}</p>
          </div>

          <div class="setting-group">
            <button class="secondary-button" @click="emit('replayTour')">
              {{ t('settings.replayTour') }}
            </button>
            <p class="setting-hint">{{ t('settings.replayTourHint') }}</p>
          </div>

          <SettingsSection :title="t('settings.advanced')" collapsed>
            <WorkspaceDiagnosticsSection @close="handleClose" />
          </SettingsSection>

          <SettingsSection :title="t('settings.aboutAndLicense')" collapsed>
            <div class="setting-group">
              <div class="about-info">
                <p><strong>{{ t('app.name') }}</strong> - {{ t('settings.aboutDescription') }}</p>
                <p class="version">{{ t('settings.version') }} {{ appVersion }}</p>
              </div>
            </div>
            <div class="setting-group">
              <div class="legal-disclaimer">
                <p>{{ t('settings.licenseText') }}</p>
                <p class="copyright">&copy; 2026 Soren Wacker</p>
              </div>
            </div>
          </SettingsSection>
        </div>

        <!-- Appearance Settings (Themes + Display) -->
        <AppearanceSettingsPanel v-if="activeTab === 'appearance'" />

        <!-- Canvas Settings -->
        <CanvasSettingsPanel v-if="activeTab === 'canvas'" />

        <!-- AI Settings -->
        <LLMSettingsPanel v-if="activeTab === 'ai'" />

        <!-- Citations (Zotero + citation import) -->
        <div v-if="activeTab === 'citations'" class="settings-section">
          <p class="section-description">{{ t('settings.zotero.description') }}</p>
          <ZoteroSettingsPanel />
          <hr class="divider" />
          <p class="section-description">{{ t('settings.citations.description') }}</p>
          <p class="hint">{{ t('settings.citations.hint') }}</p>
        </div>

        <!-- Integrations (MCP) -->
        <div v-if="activeTab === 'integrations'" class="settings-section">
          <div class="integration-section">
            <div class="integration-header">
              <span class="integration-title">{{ t('mcp.server') }}</span>
            </div>
            <McpSettingsPanel />
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
  width: 680px;
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

.setting-hint {
  margin: 6px 0 0;
  font-size: 11px;
  line-height: 1.5;
  color: var(--text-muted);
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



.section-description {
  font-size: 13px;
  color: var(--text-main, #18181b);
  margin: 0 0 8px;
}

:is([data-theme='dark'], [data-theme='pitch-black'], [data-theme='cyber']) .section-description {
  color: #f4f4f5;
}
</style>
