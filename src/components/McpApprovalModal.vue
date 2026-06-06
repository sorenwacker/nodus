<script setup lang="ts">
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

defineProps<{
  connectionId: string
}>()

const emit = defineEmits<{
  approve: [connectionId: string]
  reject: [connectionId: string]
}>()
</script>

<template>
  <div class="dialog-overlay" @click.self="emit('reject', connectionId)">
    <div class="dialog mcp-dialog">
      <div class="dialog-header">
        <svg class="header-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
        </svg>
        <h2>{{ t('mcp.connectionRequest') }}</h2>
      </div>

      <div class="dialog-content">
        <p class="description">{{ t('mcp.connectionRequestMessage') }}</p>

        <div class="connection-info">
          <span class="label">{{ t('mcp.connectionId') }}:</span>
          <code>{{ connectionId.slice(0, 8) }}...</code>
        </div>

        <div class="warning-box">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="8" x2="12" y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          <span>{{ t('mcp.warningMessage') }}</span>
        </div>
      </div>

      <div class="dialog-actions">
        <button class="cancel-btn" @click="emit('reject', connectionId)">
          {{ t('mcp.reject') }}
        </button>
        <button class="import-btn" @click="emit('approve', connectionId)">
          {{ t('mcp.approve') }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.dialog-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 50000;
  backdrop-filter: blur(2px);
}

.dialog {
  background: var(--bg-surface);
  border-radius: 12px;
  padding: 20px 24px;
  width: 420px;
  max-width: 90%;
  box-shadow: 0 8px 32px var(--shadow-lg), 0 0 0 1px var(--border-subtle);
}

.dialog-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}

.header-icon {
  color: var(--primary-color);
  flex-shrink: 0;
}

.dialog h2 {
  margin: 0;
  font-size: 18px;
  color: var(--text-main);
}

.dialog-content {
  margin-bottom: 20px;
}

.description {
  margin: 0 0 16px;
  color: var(--text-main);
  line-height: 1.5;
  font-size: 14px;
}

.connection-info {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  background: var(--bg-canvas);
  border-radius: 8px;
  margin-bottom: 12px;
  border: 1px solid var(--border-default);
}

.connection-info .label {
  color: var(--text-muted);
  font-size: 13px;
}

.connection-info code {
  font-family: ui-monospace, SFMono-Regular, monospace;
  font-size: 13px;
  color: var(--text-main);
}

.warning-box {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 12px;
  background: var(--warning-bg, rgba(251, 191, 36, 0.15));
  border: 1px solid var(--warning-border, rgba(251, 191, 36, 0.3));
  border-radius: 8px;
  color: var(--warning-text, #b45309);
  font-size: 13px;
  line-height: 1.4;
}

.warning-box svg {
  flex-shrink: 0;
  margin-top: 1px;
}

.dialog-actions {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
}

.cancel-btn,
.import-btn {
  padding: 8px 16px;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
}

.cancel-btn {
  background: var(--bg-surface);
  border: 1px solid var(--border-default);
  color: var(--text-main);
}

.cancel-btn:hover {
  background: var(--bg-elevated);
  border-color: var(--border-hover);
}

.import-btn {
  background: var(--primary-color);
  border: 1px solid var(--primary-color);
  color: white;
}

.import-btn:hover {
  filter: brightness(1.1);
}
</style>
