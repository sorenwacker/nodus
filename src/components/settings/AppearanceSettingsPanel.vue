<script setup lang="ts">
/**
 * Appearance Settings Panel
 * Combines theme selection and display settings (font scale, thresholds)
 */
import { ref, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useThemesStore } from '../../stores/themes'
import { uiStorage, displayStorage } from '../../lib/storage'

const { t } = useI18n()
const themesStore = useThemesStore()

// Theme selection
const selectedTheme = computed({
  get: () => themesStore.currentThemeName,
  set: (name: string) => themesStore.setTheme(name),
})

// Font scale
const fontScale = ref(uiStorage.getFontScale())

// Spellcheck
const spellcheckEnabled = ref(uiStorage.getSpellcheckEnabled())

// Display thresholds
const semanticZoomThreshold = ref(displayStorage.getSemanticZoomThreshold())
const magnifierEnabled = ref(uiStorage.getMagnifierEnabled())
const magnifierZoomThreshold = ref(displayStorage.getMagnifierZoomThreshold())

// Save functions
function saveFontScale() {
  uiStorage.setFontScale(fontScale.value)
  document.documentElement.style.setProperty('--font-scale', String(fontScale.value))
  window.dispatchEvent(new CustomEvent('nodus-display-settings-change'))
}

function saveDisplaySettings() {
  displayStorage.setSemanticZoomThreshold(semanticZoomThreshold.value)
  uiStorage.setMagnifierEnabled(magnifierEnabled.value)
  displayStorage.setMagnifierZoomThreshold(magnifierZoomThreshold.value)
  window.dispatchEvent(new CustomEvent('nodus-display-settings-change'))
}

function saveSpellcheckSetting() {
  uiStorage.setSpellcheckEnabled(spellcheckEnabled.value)
  window.dispatchEvent(new CustomEvent('nodus-display-settings-change'))
}

// Auto-save on changes
watch(fontScale, saveFontScale)
watch([semanticZoomThreshold, magnifierEnabled, magnifierZoomThreshold], saveDisplaySettings)
watch(spellcheckEnabled, saveSpellcheckSetting)

// Delete custom theme
async function deleteCustomTheme(id: string) {
  if (confirm(t('settings.deleteTheme'))) {
    await themesStore.deleteTheme(id)
  }
}

function resetDisplayDefaults() {
  fontScale.value = 1.0
  spellcheckEnabled.value = false
  semanticZoomThreshold.value = 0.5
  magnifierEnabled.value = true
  magnifierZoomThreshold.value = 0.4
  saveFontScale()
  saveSpellcheckSetting()
  saveDisplaySettings()
}
</script>

<template>
  <div class="settings-section">
    <!-- Theme Selection -->
    <div class="setting-group">
      <label class="section-label">{{ t('settings.tabs.themes') }}</label>
      <div class="theme-grid">
        <label
          v-for="theme in themesStore.themes"
          :key="theme.id"
          class="theme-option"
          :class="{ selected: selectedTheme === theme.name }"
        >
          <input v-model="selectedTheme" type="radio" :value="theme.name" />
          <span class="theme-preview" :data-theme-preview="theme.name">
            <span class="preview-dot"></span>
          </span>
          <span class="theme-name">{{ theme.display_name }}</span>
          <button
            v-if="theme.is_builtin === 0"
            class="delete-theme-btn"
            :title="t('common.delete')"
            @click.prevent.stop="deleteCustomTheme(theme.id)"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </label>
      </div>
    </div>

    <hr class="divider" />

    <!-- Font Scale -->
    <div class="setting-group">
      <label>
        {{ t('settings.display.fontScale') }}
        <span class="value-display">{{ (fontScale * 100).toFixed(0) }}%</span>
      </label>
      <input
        v-model.number="fontScale"
        type="range"
        min="0.5"
        max="2"
        step="0.1"
      />
      <span class="hint">{{ t('settings.display.fontScaleHint') }}</span>
    </div>

    <!-- Spellcheck -->
    <div class="setting-group">
      <label class="checkbox-label">
        <input v-model="spellcheckEnabled" type="checkbox" />
        {{ t('settings.display.spellcheck') }}
      </label>
      <span class="hint">{{ t('settings.display.spellcheckHint') }}</span>
    </div>

    <hr class="divider" />

    <!-- Zoom Behavior -->
    <div class="setting-group">
      <label>
        {{ t('settings.display.semanticZoomThreshold') }}
        <span class="value-display">{{ (semanticZoomThreshold * 100).toFixed(0) }}%</span>
      </label>
      <input
        v-model.number="semanticZoomThreshold"
        type="range"
        min="0.2"
        max="0.8"
        step="0.05"
      />
      <span class="hint">{{ t('settings.display.semanticZoomThresholdHint') }}</span>
    </div>

    <!-- Magnifier -->
    <div class="setting-group">
      <label class="checkbox-label">
        <input v-model="magnifierEnabled" type="checkbox" />
        {{ t('settings.display.magnifierEnabled') }}
      </label>
    </div>

    <div v-if="magnifierEnabled" class="setting-group">
      <label>
        {{ t('settings.display.magnifierZoomThreshold') }}
        <span class="value-display">{{ (magnifierZoomThreshold * 100).toFixed(0) }}%</span>
      </label>
      <input
        v-model.number="magnifierZoomThreshold"
        type="range"
        min="0.2"
        max="0.6"
        step="0.05"
      />
      <span class="hint">{{ t('settings.display.magnifierZoomThresholdHint') }}</span>
    </div>

    <hr class="divider" />

    <button class="reset-btn" @click="resetDisplayDefaults">
      {{ t('settings.display.resetDefaults') }}
    </button>
  </div>
</template>

<style scoped>
.settings-section {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.section-label {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-main, #18181b);
  margin-bottom: 4px;
}

:is([data-theme='dark'], [data-theme='pitch-black'], [data-theme='cyber']) .section-label {
  color: #f4f4f5;
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

.value-display {
  font-weight: 600;
  color: var(--primary-color, #3b82f6);
  font-size: 12px;
}

.setting-group input[type="range"] {
  width: 100%;
  height: 6px;
  -webkit-appearance: none;
  appearance: none;
  background: var(--border-node, #e4e4e7);
  border-radius: 3px;
  outline: none;
}

.setting-group input[type="range"]::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--primary-color, #3b82f6);
  cursor: pointer;
}

:is([data-theme='dark'], [data-theme='pitch-black'], [data-theme='cyber']) .setting-group input[type="range"] {
  background: #3f3f46;
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

.divider {
  border: none;
  border-top: 1px solid var(--border-node, #e4e4e7);
  margin: 4px 0;
}

:is([data-theme='dark'], [data-theme='pitch-black'], [data-theme='cyber']) .divider {
  border-color: #3f3f46;
}

.reset-btn {
  padding: 8px 16px;
  border: 1px solid var(--border-node, #e4e4e7);
  border-radius: 6px;
  background: transparent;
  color: var(--text-muted, #71717a);
  font-size: 13px;
  cursor: pointer;
  align-self: flex-start;
  transition: all 0.15s;
}

.reset-btn:hover {
  background: var(--bg-canvas, #f4f4f5);
  color: var(--text-main, #18181b);
  border-color: var(--primary-color, #3b82f6);
}

:is([data-theme='dark'], [data-theme='pitch-black'], [data-theme='cyber']) .reset-btn {
  border-color: #3f3f46;
}

:is([data-theme='dark'], [data-theme='pitch-black'], [data-theme='cyber']) .reset-btn:hover {
  background: #3f3f46;
  color: #f4f4f5;
}

/* Theme Grid */
.theme-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(90px, 1fr));
  gap: 8px;
}

.theme-option {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 10px 6px;
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
  width: 36px;
  height: 36px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(0, 0, 0, 0.1);
}

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
  font-size: 10px;
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
  width: 16px;
  height: 16px;
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
</style>
