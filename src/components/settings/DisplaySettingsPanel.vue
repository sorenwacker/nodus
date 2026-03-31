<script setup lang="ts">
/**
 * Display Settings Panel
 * Configures font scale and performance thresholds
 */
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { uiStorage, displayStorage } from '../../lib/storage'

const { t } = useI18n()

// Font scale (Cmd+/Cmd-)
const fontScale = ref(uiStorage.getFontScale())

// Display thresholds
const lodThreshold = ref(displayStorage.getLodThreshold())
const semanticZoomThreshold = ref(displayStorage.getSemanticZoomThreshold())
const edgeHoverThreshold = ref(displayStorage.getEdgeHoverThreshold())
const magnifierZoomThreshold = ref(displayStorage.getMagnifierZoomThreshold())

// Magnifier enabled
const magnifierEnabled = ref(uiStorage.getMagnifierEnabled())

// Save functions
function saveFontScale() {
  uiStorage.setFontScale(fontScale.value)
  document.documentElement.style.setProperty('--font-scale', String(fontScale.value))
}

function saveLodThreshold() {
  displayStorage.setLodThreshold(lodThreshold.value)
  window.dispatchEvent(new CustomEvent('nodus-display-settings-change'))
}

function saveSemanticZoomThreshold() {
  displayStorage.setSemanticZoomThreshold(semanticZoomThreshold.value)
  window.dispatchEvent(new CustomEvent('nodus-display-settings-change'))
}

function saveEdgeHoverThreshold() {
  displayStorage.setEdgeHoverThreshold(edgeHoverThreshold.value)
  window.dispatchEvent(new CustomEvent('nodus-display-settings-change'))
}

function saveMagnifierSettings() {
  uiStorage.setMagnifierEnabled(magnifierEnabled.value)
  displayStorage.setMagnifierZoomThreshold(magnifierZoomThreshold.value)
  window.dispatchEvent(new CustomEvent('nodus-display-settings-change'))
}

function resetToDefaults() {
  fontScale.value = 1.0
  lodThreshold.value = 500
  semanticZoomThreshold.value = 0.5
  edgeHoverThreshold.value = 1500
  magnifierZoomThreshold.value = 0.4
  magnifierEnabled.value = true

  saveFontScale()
  saveLodThreshold()
  saveSemanticZoomThreshold()
  saveEdgeHoverThreshold()
  saveMagnifierSettings()
}

// Auto-save on changes
watch(fontScale, saveFontScale)
watch(lodThreshold, saveLodThreshold)
watch(semanticZoomThreshold, saveSemanticZoomThreshold)
watch(edgeHoverThreshold, saveEdgeHoverThreshold)
watch([magnifierEnabled, magnifierZoomThreshold], saveMagnifierSettings)
</script>

<template>
  <div class="settings-section">
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

    <hr class="divider" />

    <!-- Performance Thresholds -->
    <h3 class="section-title">{{ t('settings.display.thresholds') }}</h3>

    <div class="setting-group">
      <label>
        {{ t('settings.display.lodThreshold') }}
        <span class="value-display">{{ lodThreshold }}</span>
      </label>
      <input
        v-model.number="lodThreshold"
        type="range"
        min="100"
        max="2000"
        step="50"
      />
      <span class="hint">{{ t('settings.display.lodThresholdHint') }}</span>
    </div>

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

    <div class="setting-group">
      <label>
        {{ t('settings.display.edgeHoverThreshold') }}
        <span class="value-display">{{ edgeHoverThreshold }}</span>
      </label>
      <input
        v-model.number="edgeHoverThreshold"
        type="range"
        min="500"
        max="5000"
        step="100"
      />
      <span class="hint">{{ t('settings.display.edgeHoverThresholdHint') }}</span>
    </div>

    <hr class="divider" />

    <!-- Magnifier Settings -->
    <h3 class="section-title">{{ t('settings.display.magnifier') }}</h3>

    <div class="setting-group">
      <label class="checkbox-label">
        <input v-model="magnifierEnabled" type="checkbox" />
        {{ t('settings.display.magnifierEnabled') }}
      </label>
    </div>

    <div class="setting-group">
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
        :disabled="!magnifierEnabled"
      />
      <span class="hint">{{ t('settings.display.magnifierZoomThresholdHint') }}</span>
    </div>

    <hr class="divider" />

    <!-- Reset Button -->
    <button class="reset-btn" @click="resetToDefaults">
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

.section-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-main, #18181b);
  margin: 0;
}

:is([data-theme='dark'], [data-theme='pitch-black'], [data-theme='cyber']) .section-title {
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

.setting-group input[type="range"]:disabled {
  opacity: 0.5;
}

:is([data-theme='dark'], [data-theme='pitch-black'], [data-theme='cyber']) .setting-group input[type="range"] {
  background: #3f3f46;
}

.setting-group input[type="number"] {
  padding: 8px 12px;
  border: 1px solid var(--border-node, #e4e4e7);
  border-radius: 6px;
  background: var(--bg-canvas, #f4f4f5);
  color: var(--text-main, #18181b);
  font-size: 14px;
  width: 100px;
}

:is([data-theme='dark'], [data-theme='pitch-black'], [data-theme='cyber']) .setting-group input[type="number"] {
  background: #18181b;
  border-color: #3f3f46;
  color: #f4f4f5;
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
</style>
