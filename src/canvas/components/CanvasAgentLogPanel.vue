<script setup lang="ts">
/**
 * CanvasAgentLogPanel - Standalone agent log display
 * Shows agent activity log when LLM bar is hidden
 */
import { writeText } from '@tauri-apps/plugin-clipboard-manager'

const props = defineProps<{
  log: string[]
}>()

const emit = defineEmits<{
  (e: 'clear'): void
  (e: 'close'): void
}>()

async function copyLog() {
  const text = props.log.join('\n')
  try {
    await writeText(text)
  } catch {
    // Fallback for non-Tauri environments
    await navigator.clipboard.writeText(text)
  }
}
</script>

<template>
  <div class="standalone-agent-log">
    <div class="log-header">
      <span>Agent Log ({{ log.length }})</span>
      <div class="log-buttons">
        <button class="log-btn" title="Copy log" @click="copyLog">
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
          </svg>
        </button>
        <button class="log-btn" title="Clear log" @click="emit('clear')">
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
        <button class="log-btn" title="Close" @click="emit('close')">
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
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
.standalone-agent-log {
  position: absolute;
  top: 56px;
  left: 16px;
  width: 400px;
  max-height: 300px;
  background: var(--bg-surface);
  border: 1px solid var(--border-default);
  border-radius: 8px;
  box-shadow: 0 4px 12px var(--shadow-md);
  z-index: 100;
  display: flex;
  flex-direction: column;
}

.log-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  border-bottom: 1px solid var(--border-default);
  font-size: 12px;
  font-weight: 500;
  color: var(--text-main);
}

.log-buttons {
  display: flex;
  gap: 4px;
}

.log-btn {
  padding: 4px;
  background: transparent;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  color: var(--text-muted);
  display: flex;
  align-items: center;
  justify-content: center;
}

.log-btn:hover {
  background: var(--bg-elevated);
  color: var(--text-main);
}

.log-content {
  flex: 1;
  overflow-y: auto;
  padding: 8px 12px;
  font-family: monospace;
  font-size: 11px;
  line-height: 1.4;
}

.log-line {
  color: var(--text-secondary);
  white-space: pre-wrap;
  word-break: break-word;
}

.log-line + .log-line {
  margin-top: 4px;
}
</style>
