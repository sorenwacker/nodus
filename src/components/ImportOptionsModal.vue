<script setup lang="ts">
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

export interface ImportOptions {
  createFrame: boolean
  importAttachments: boolean
  layout: 'grid' | 'force'
}

const props = defineProps<{
  filename: string
  entryCount: number
  collectionName: string | null
  hasAttachments: boolean
}>()

const emit = defineEmits<{
  (e: 'import', options: ImportOptions): void
  (e: 'cancel'): void
}>()

const createFrame = ref(true)
const importAttachments = ref(false)
const layout = ref<'grid' | 'force'>('grid')

const canCreateFrame = computed(() => !!props.collectionName)

function handleImport() {
  emit('import', {
    createFrame: canCreateFrame.value && createFrame.value,
    importAttachments: importAttachments.value,
    layout: layout.value,
  })
}
</script>

<template>
  <div class="modal-overlay" @click.self="emit('cancel')">
    <div class="modal-content">
      <div class="modal-header">
        <h2>{{ t('import.options.title') }}</h2>
        <span class="filename">{{ filename }}</span>
        <button class="close-btn" :data-tooltip="t('common.close')" @click="emit('cancel')">x</button>
      </div>

      <div class="modal-body">
        <p class="entry-count">
          {{ t('import.options.entriesFound', { count: entryCount }) }}
        </p>

        <div class="options-section">
          <label class="option-row" :class="{ disabled: !canCreateFrame }">
            <input
              v-model="createFrame"
              type="checkbox"
              :disabled="!canCreateFrame"
            />
            <div class="option-text">
              <span class="option-label">{{ t('import.options.createFrame') }}</span>
              <span v-if="collectionName" class="option-hint">
                {{ t('import.options.collectionDetected', { name: collectionName }) }}
              </span>
              <span v-else class="option-hint option-hint-warn">
                {{ t('import.options.noCollection') }}
              </span>
            </div>
          </label>

          <label class="option-row" :class="{ disabled: !hasAttachments }">
            <input
              v-model="importAttachments"
              type="checkbox"
              :disabled="!hasAttachments"
            />
            <div class="option-text">
              <span class="option-label">{{ t('import.options.importAttachments') }}</span>
              <span v-if="!hasAttachments" class="option-hint option-hint-warn">
                {{ t('import.options.noAttachments') }}
              </span>
            </div>
          </label>
        </div>

        <div class="layout-section">
          <span class="section-label">{{ t('import.options.layout') }}</span>
          <div class="layout-options">
            <label class="layout-option" :class="{ selected: layout === 'grid' }">
              <input v-model="layout" type="radio" value="grid" />
              <span>{{ t('import.options.layoutGrid') }}</span>
            </label>
            <label class="layout-option" :class="{ selected: layout === 'force' }">
              <input v-model="layout" type="radio" value="force" />
              <span>{{ t('import.options.layoutForce') }}</span>
            </label>
          </div>
        </div>
      </div>

      <div class="modal-footer">
        <button class="btn-cancel" @click="emit('cancel')">
          {{ t('common.cancel') }}
        </button>
        <button class="btn-import" @click="handleImport">
          {{ t('import.options.importButton', { count: entryCount }) }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
}

.modal-content {
  background: var(--bg-node, #fff);
  border-radius: 12px;
  width: 90%;
  max-width: 480px;
  display: flex;
  flex-direction: column;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
}

.modal-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-node, #e4e4e7);
}

.modal-header h2 {
  margin: 0;
  font-size: 18px;
  color: var(--text-main, #18181b);
}

.filename {
  color: var(--text-muted, #71717a);
  font-size: 13px;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.close-btn {
  background: none;
  border: none;
  font-size: 20px;
  cursor: pointer;
  color: var(--text-muted, #71717a);
  padding: 4px 8px;
}

.close-btn:hover {
  color: var(--text-main, #18181b);
}

.modal-body {
  padding: 20px;
}

.entry-count {
  margin: 0 0 16px 0;
  font-size: 14px;
  color: var(--text-main, #18181b);
}

.options-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 20px;
}

.option-row {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px;
  background: var(--bg-canvas, #f4f4f5);
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.15s;
}

.option-row:hover:not(.disabled) {
  background: color-mix(in srgb, var(--bg-canvas, #f4f4f5) 80%, var(--primary-color, #3b82f6));
}

.option-row.disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.option-row input[type="checkbox"] {
  margin-top: 2px;
  flex-shrink: 0;
}

.option-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.option-label {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-main, #18181b);
}

.option-hint {
  font-size: 12px;
  color: var(--text-muted, #71717a);
}

.option-hint-warn {
  color: var(--text-muted, #71717a);
  font-style: italic;
}

.layout-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.section-label {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-muted, #71717a);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.layout-options {
  display: flex;
  gap: 8px;
}

.layout-option {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 10px;
  background: var(--bg-canvas, #f4f4f5);
  border: 2px solid transparent;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.15s;
}

.layout-option:hover {
  background: color-mix(in srgb, var(--bg-canvas, #f4f4f5) 80%, var(--primary-color, #3b82f6));
}

.layout-option.selected {
  border-color: var(--primary-color, #3b82f6);
  background: color-mix(in srgb, var(--primary-color, #3b82f6) 10%, transparent);
}

.layout-option input[type="radio"] {
  display: none;
}

.layout-option span {
  font-size: 14px;
  color: var(--text-main, #18181b);
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding: 16px 20px;
  border-top: 1px solid var(--border-node, #e4e4e7);
}

.btn-cancel, .btn-import {
  padding: 8px 16px;
  border-radius: 6px;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.15s;
}

.btn-cancel {
  background: transparent;
  border: 1px solid var(--border-node, #e4e4e7);
  color: var(--text-main, #18181b);
}

.btn-cancel:hover {
  background: var(--bg-canvas, #f4f4f5);
}

.btn-import {
  background: var(--primary-color, #3b82f6);
  border: none;
  color: white;
}

.btn-import:hover {
  filter: brightness(1.1);
}
</style>
