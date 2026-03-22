<script setup lang="ts">
/**
 * Canvas Settings Panel
 * Configures grid, edges, and tag display options
 */
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { canvasStorage, tagStorage } from '../../lib/storage'

const { t } = useI18n()

// Canvas Settings
const gridSnap = ref(canvasStorage.getGridSnap())
const gridSize = ref(canvasStorage.getGridSize())
const edgeStyle = ref<'orthogonal' | 'diagonal' | 'curved' | 'hyperbolic' | 'straight'>(canvasStorage.getEdgeStyle())

// Tag Settings
const showTagNodes = ref(tagStorage.getShowTagNodes())

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
</script>

<template>
  <div class="settings-section">
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

.setting-group input[type="number"] {
  padding: 8px 12px;
  border: 1px solid var(--border-node, #e4e4e7);
  border-radius: 6px;
  background: var(--bg-canvas, #f4f4f5);
  color: var(--text-main, #18181b);
  font-size: 14px;
}

:is([data-theme='dark'], [data-theme='pitch-black'], [data-theme='cyber']) .setting-group input[type="number"] {
  background: #18181b;
  border-color: #3f3f46;
  color: #f4f4f5;
}

.setting-group input:focus {
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
</style>
