<script setup lang="ts">
/**
 * Theme Settings Panel
 * Manages theme selection and custom theme deletion
 */
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useThemesStore } from '../../stores/themes'

const { t } = useI18n()
const themesStore = useThemesStore()

// Theme is handled by themes store
const selectedTheme = computed({
  get: () => themesStore.currentThemeName,
  set: (name: string) => themesStore.setTheme(name),
})

// Delete custom theme
async function deleteCustomTheme(id: string) {
  if (confirm(t('settings.deleteTheme'))) {
    await themesStore.deleteTheme(id)
  }
}
</script>

<template>
  <div class="settings-section">
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
</template>

<style scoped>
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

.hint {
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
</style>
