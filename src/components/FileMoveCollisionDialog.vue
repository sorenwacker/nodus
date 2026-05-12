<script setup lang="ts">
/**
 * FileMoveCollisionDialog
 * Shows when a file move would cause a name collision in the target folder.
 * Offers options: Cancel, Rename (append suffix), or Replace existing.
 */
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'

export type CollisionResolution = 'cancel' | 'rename' | 'replace'

const { t } = useI18n()

const props = defineProps<{
  sourceFileName: string
  targetFolder: string
  existingFileName: string
}>()

const emit = defineEmits<{
  resolve: [resolution: CollisionResolution, newName?: string]
}>()

const customName = ref(generateRenamedName(props.sourceFileName))

function generateRenamedName(fileName: string): string {
  const lastDot = fileName.lastIndexOf('.')
  if (lastDot > 0) {
    const stem = fileName.slice(0, lastDot)
    const ext = fileName.slice(lastDot)
    return `${stem}-1${ext}`
  }
  return `${fileName}-1`
}

function handleCancel() {
  emit('resolve', 'cancel')
}

function handleRename() {
  emit('resolve', 'rename', customName.value)
}

function handleReplace() {
  emit('resolve', 'replace')
}
</script>

<template>
  <div class="modal-overlay" @click.self="handleCancel">
    <div class="modal-content">
      <div class="modal-header">
        <h2>{{ t('fileMove.collision.title', 'File Already Exists') }}</h2>
        <button class="close-btn" :data-tooltip="t('common.close', 'Close')" @click="handleCancel">
          &times;
        </button>
      </div>

      <div class="modal-body">
        <div class="collision-info">
          <p class="collision-message">
            {{ t('fileMove.collision.message', 'A file with the same name already exists in the target folder.') }}
          </p>
          <div class="file-details">
            <div class="file-row">
              <span class="file-label">{{ t('fileMove.collision.moving', 'Moving:') }}</span>
              <span class="file-name">{{ sourceFileName }}</span>
            </div>
            <div class="file-row">
              <span class="file-label">{{ t('fileMove.collision.to', 'To:') }}</span>
              <span class="file-path">{{ targetFolder }}</span>
            </div>
            <div class="file-row conflict">
              <span class="file-label">{{ t('fileMove.collision.existing', 'Existing:') }}</span>
              <span class="file-name">{{ existingFileName }}</span>
            </div>
          </div>
        </div>

        <div class="options-section">
          <h3>{{ t('fileMove.collision.options', 'Choose an option:') }}</h3>

          <div class="option-card" @click="handleRename">
            <div class="option-icon">&#9998;</div>
            <div class="option-content">
              <span class="option-title">{{ t('fileMove.collision.rename', 'Rename') }}</span>
              <span class="option-desc">
                {{ t('fileMove.collision.renameDesc', 'Save with a new name') }}
              </span>
              <input
                v-model="customName"
                type="text"
                class="rename-input"
                @click.stop
                @keydown.enter="handleRename"
              />
            </div>
          </div>

          <div class="option-card danger" @click="handleReplace">
            <div class="option-icon">&#9888;</div>
            <div class="option-content">
              <span class="option-title">{{ t('fileMove.collision.replace', 'Replace') }}</span>
              <span class="option-desc">
                {{ t('fileMove.collision.replaceDesc', 'Overwrite the existing file (cannot be undone)') }}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div class="modal-footer">
        <button class="btn-cancel" @click="handleCancel">
          {{ t('common.cancel', 'Cancel') }}
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
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-node, #e4e4e7);
}

.modal-header h2 {
  margin: 0;
  font-size: 18px;
  color: var(--text-main, #18181b);
}

.close-btn {
  background: none;
  border: none;
  font-size: 24px;
  cursor: pointer;
  color: var(--text-muted, #71717a);
  padding: 4px 8px;
  line-height: 1;
}

.close-btn:hover {
  color: var(--text-main, #18181b);
}

.modal-body {
  padding: 20px;
}

.collision-info {
  margin-bottom: 20px;
}

.collision-message {
  margin: 0 0 12px 0;
  font-size: 14px;
  color: var(--text-main, #18181b);
}

.file-details {
  background: var(--bg-canvas, #f4f4f5);
  border-radius: 8px;
  padding: 12px;
}

.file-row {
  display: flex;
  gap: 8px;
  padding: 4px 0;
  font-size: 13px;
}

.file-row.conflict {
  color: var(--danger-color, #dc2626);
}

.file-label {
  color: var(--text-muted, #71717a);
  min-width: 60px;
}

.file-name {
  font-family: monospace;
  font-weight: 500;
}

.file-path {
  color: var(--text-muted, #71717a);
  font-family: monospace;
  font-size: 12px;
  word-break: break-all;
}

.options-section h3 {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-muted, #71717a);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin: 0 0 12px 0;
}

.option-card {
  display: flex;
  gap: 12px;
  padding: 12px;
  background: var(--bg-canvas, #f4f4f5);
  border: 2px solid transparent;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.15s;
  margin-bottom: 8px;
}

.option-card:hover {
  border-color: var(--primary-color, #3b82f6);
  background: color-mix(in srgb, var(--primary-color, #3b82f6) 5%, var(--bg-canvas, #f4f4f5));
}

.option-card.danger:hover {
  border-color: var(--danger-color, #dc2626);
  background: color-mix(in srgb, var(--danger-color, #dc2626) 5%, var(--bg-canvas, #f4f4f5));
}

.option-icon {
  font-size: 20px;
  flex-shrink: 0;
  width: 28px;
  text-align: center;
}

.option-content {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
}

.option-title {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-main, #18181b);
}

.option-desc {
  font-size: 12px;
  color: var(--text-muted, #71717a);
}

.rename-input {
  margin-top: 8px;
  padding: 6px 8px;
  font-size: 13px;
  font-family: monospace;
  border: 1px solid var(--border-node, #e4e4e7);
  border-radius: 4px;
  background: var(--bg-node, #fff);
  color: var(--text-main, #18181b);
}

.rename-input:focus {
  outline: none;
  border-color: var(--primary-color, #3b82f6);
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding: 16px 20px;
  border-top: 1px solid var(--border-node, #e4e4e7);
}

.btn-cancel {
  padding: 8px 16px;
  border-radius: 6px;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.15s;
  background: transparent;
  border: 1px solid var(--border-node, #e4e4e7);
  color: var(--text-main, #18181b);
}

.btn-cancel:hover {
  background: var(--bg-canvas, #f4f4f5);
}
</style>
