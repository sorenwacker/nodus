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
        data-tooltip="Send prompt"
        :disabled="isLoading || !graphPrompt.trim()"
        @click="$emit('send')"
      >
        {{ isLoading ? '...' : 'Go' }}
      </button>
      <button v-else class="llm-stop" data-tooltip="Stop agent" @click="$emit('stop')">Stop</button>
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
        <button class="log-btn" title="Copy log" @click="copyLog(agentLog)">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
          </svg>
        </button>
        <button class="log-btn" title="Clear log" @click="$emit('clear-log')">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
      <div v-for="(line, i) in agentLog" :key="i" class="log-line">{{ line }}</div>
    </div>
  </div>
</template>
