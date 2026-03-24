<script setup lang="ts">
import { writeText } from '@tauri-apps/plugin-clipboard-manager'

defineProps<{
  visible: boolean
  log: string[]
}>()

defineEmits<{
  (e: 'close'): void
}>()

async function copyLog(log: string[]) {
  await writeText(log.join('\n'))
}
</script>

<template>
  <div
    v-if="visible && log.length > 0"
    class="node-agent-log-panel"
  >
    <div class="log-header">
      <span>Agent Log</span>
      <div class="log-buttons">
        <button class="log-btn" title="Copy log" @click="copyLog(log)">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
          </svg>
        </button>
        <button class="log-btn" title="Close" @click="$emit('close')">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
    <div class="log-content">
      <div v-for="(line, i) in log" :key="i" class="log-line">{{ line }}</div>
    </div>
  </div>
</template>

<style scoped>
.node-agent-log-panel {
  position: fixed;
  bottom: 60px;
  right: 20px;
  width: 420px;
  max-height: 320px;
  background: var(--bg-surface);
  border: 1px solid var(--border-default);
  border-radius: 8px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
  z-index: 1000;
  display: flex;
  flex-direction: column;
}

.log-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 14px;
  border-bottom: 1px solid var(--border-default);
  font-weight: 600;
  font-size: 12px;
  color: var(--text-main);
  background: var(--bg-surface-alt);
  border-radius: 8px 8px 0 0;
}

.log-buttons {
  display: flex;
  gap: 4px;
}

.log-btn {
  background: var(--bg-surface);
  border: 1px solid var(--border-default);
  border-radius: 4px;
  padding: 4px;
  cursor: pointer;
  color: var(--text-muted);
  display: flex;
  align-items: center;
  justify-content: center;
}

.log-btn:hover {
  background: var(--bg-elevated);
  border-color: var(--primary-color);
  color: var(--text-main);
}

.log-content {
  flex: 1;
  overflow-y: auto;
  padding: 10px 14px;
  font-family: ui-monospace, 'SF Mono', Menlo, monospace;
  font-size: 11px;
  line-height: 1.5;
  max-height: 260px;
  user-select: text;
  -webkit-user-select: text;
  cursor: text;
}

.log-line {
  padding: 4px 8px;
  margin: 2px 0;
  white-space: pre-wrap;
  word-break: break-word;
  color: var(--text-main);
  border-radius: 4px;
}

.log-line:nth-child(odd) {
  background: var(--bg-surface-alt);
}
</style>
