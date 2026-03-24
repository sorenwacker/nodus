<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { writeText } from '@tauri-apps/plugin-clipboard-manager'

const { t } = useI18n()

defineProps<{
  graphPrompt: string
  isLoading: boolean
  isRunning: boolean
  conversationHistory: unknown[]
  agentTasks: Array<{ id: string; status: string; description: string }>
  agentLog: string[]
}>()

defineEmits<{
  (e: 'update:graphPrompt', value: string): void
  (e: 'send'): void
  (e: 'stop'): void
  (e: 'clear-conversation'): void
  (e: 'prompt-keydown', event: KeyboardEvent): void
  (e: 'clear-log'): void
}>()

async function copyLog(log: string[]) {
  await writeText(log.join('\n'))
}
</script>

<template>
  <div class="graph-llm-bar">
    <div class="llm-input-row">
      <input
        :value="graphPrompt"
        type="text"
        :placeholder="t('canvas.agent.placeholder')"
        class="llm-input"
        :disabled="isLoading"
        @input="$emit('update:graphPrompt', ($event.target as HTMLInputElement).value)"
        @keydown.enter="$emit('send')"
        @keydown.up="$emit('prompt-keydown', $event)"
        @keydown.down="$emit('prompt-keydown', $event)"
      />
      <button
        class="llm-clear-btn"
        :data-tooltip="t('canvas.agent.clearMemory')"
        :class="{ active: conversationHistory.length > 0 }"
        @click="$emit('clear-conversation')"
      >
        {{ conversationHistory.length || 'C' }}
      </button>
      <button
        v-if="!isRunning"
        class="llm-send"
        :data-tooltip="t('canvas.agent.sendPrompt')"
        :disabled="isLoading || !graphPrompt.trim()"
        @click="$emit('send')"
      >
        {{ isLoading ? '...' : t('canvas.agent.go') }}
      </button>
      <button v-else class="llm-stop" :data-tooltip="t('canvas.agent.stopAgent')" @click="$emit('stop')">{{ t('canvas.agent.stop') }}</button>
    </div>
    <!-- Agent Task List -->
    <div v-if="agentTasks.length > 0" class="agent-tasks">
      <div v-for="task in agentTasks" :key="task.id" class="agent-task" :class="task.status">
        <span class="task-status">{{ task.status === 'done' ? 'v' : task.status === 'running' ? '~' : 'o' }}</span>
        <span class="task-desc">{{ task.description }}</span>
      </div>
    </div>
    <!-- Agent activity log -->
    <div v-if="agentLog.length > 0" class="agent-log">
      <div class="log-buttons">
        <button class="log-btn" :title="t('canvas.agent.copyLog')" @click="copyLog(agentLog)">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
          </svg>
        </button>
        <button class="log-btn" :title="t('canvas.agent.clearLog')" @click="$emit('clear-log')">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
      <div v-for="(line, i) in agentLog" :key="i" class="log-line">{{ line }}</div>
    </div>
  </div>
</template>

<style scoped>
.graph-llm-bar {
  display: flex;
  flex-direction: column;
  gap: 0;
  padding: 12px 16px;
  background: var(--bg-surface);
  border-bottom: 1px solid var(--border-default);
  flex-shrink: 0;
}

.llm-input-row {
  flex: 1;
  display: flex;
  gap: 8px;
  align-items: center;
}

.llm-input {
  flex: 1;
  padding: 8px 12px;
  border: 1px solid var(--border-default);
  border-radius: 6px;
  font-size: 13px;
  background: var(--bg-surface);
  color: var(--text-main);
}

.llm-input:focus {
  outline: none;
  border-color: var(--primary-color);
}

.llm-input::placeholder {
  color: var(--text-muted);
}

.llm-send {
  padding: 8px 16px;
  border: none;
  border-radius: 6px;
  background: var(--primary-color);
  color: white;
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
}

.llm-send:hover:not(:disabled) {
  opacity: 0.9;
}

.llm-send:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.llm-stop {
  padding: 8px 16px;
  border: none;
  border-radius: 6px;
  background: #dc2626;
  color: white;
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
}

.llm-stop:hover {
  background: #b91c1c;
}

.llm-clear-btn {
  padding: 8px 12px;
  border: 1px solid var(--border-default);
  border-radius: 6px;
  background: var(--bg-surface);
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 12px;
  font-weight: 600;
  min-width: 32px;
}

.llm-clear-btn:hover {
  background: var(--bg-elevated);
  border-color: var(--warning-color, #f59e0b);
}

.llm-clear-btn.active {
  background: var(--warning-color, #f59e0b);
  color: white;
  border-color: var(--warning-color, #f59e0b);
}

.agent-tasks {
  margin-top: 8px;
  padding: 8px;
  background: var(--bg-surface-alt);
  border-radius: 6px;
  font-size: 12px;
  max-height: 150px;
  overflow-y: auto;
}

.agent-task {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 0;
  color: var(--text-secondary);
}

.agent-task.done {
  color: var(--success-color, #22c55e);
}

.agent-task.running {
  color: var(--primary-color);
}

.task-status {
  font-family: monospace;
  width: 16px;
}

.agent-log {
  position: relative;
  margin-top: 8px;
  padding: 10px 12px;
  background: var(--bg-surface-alt);
  border: 1px solid var(--border-default);
  border-radius: 6px;
  font-family: ui-monospace, 'SF Mono', Menlo, monospace;
  font-size: 11px;
  line-height: 1.5;
  max-height: 180px;
  overflow-y: auto;
  color: var(--text-main);
  user-select: text;
  -webkit-user-select: text;
  cursor: text;
}

.log-buttons {
  position: sticky;
  top: 0;
  float: right;
  display: flex;
  gap: 4px;
  margin-left: 8px;
  margin-bottom: 4px;
  background: var(--bg-surface-alt);
  padding: 2px;
  border-radius: 4px;
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

.log-line {
  padding: 4px 8px;
  margin: 2px 0;
  white-space: pre-wrap;
  word-break: break-word;
  border-radius: 4px;
}

.log-line:nth-child(odd) {
  background: var(--bg-surface);
}
</style>
