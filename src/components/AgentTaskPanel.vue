<script setup lang="ts">
import { computed } from 'vue'
import { useAgentTasksStore, type AgentTaskItem } from '../stores/agentTasks'

const props = defineProps<{
  visible?: boolean
}>()

const tasksStore = useAgentTasksStore()

// Status icon mapping
function getStatusIcon(status: AgentTaskItem['status']): string {
  switch (status) {
    case 'done': return '[OK]'
    case 'error': return '[X]'
    case 'in_progress': return '[..]'
    case 'pending': return '[ ]'
    default: return '[ ]'
  }
}

// Status class mapping
function getStatusClass(status: AgentTaskItem['status']): string {
  switch (status) {
    case 'done': return 'status-done'
    case 'error': return 'status-error'
    case 'in_progress': return 'status-progress'
    case 'pending': return 'status-pending'
    default: return ''
  }
}

// Progress bar width
const progressWidth = computed(() => `${tasksStore.progress}%`)

// Show panel only if there are tasks
const shouldShow = computed(() =>
  (props.visible !== false) && tasksStore.totalTasks > 0
)
</script>

<template>
  <div v-if="shouldShow" class="task-panel">
    <header class="task-panel-header">
      <span class="task-panel-title">Tasks</span>
      <span class="task-panel-progress">
        {{ tasksStore.completedTasks }}/{{ tasksStore.totalTasks }}
      </span>
    </header>

    <div class="progress-bar-container">
      <div
        class="progress-bar"
        :style="{ width: progressWidth }"
        :class="{ 'has-errors': tasksStore.hasErrors }"
      />
    </div>

    <ul class="task-list">
      <li
        v-for="(task, index) in tasksStore.tasks"
        :key="task.id"
        class="task-item"
        :class="getStatusClass(task.status)"
      >
        <span class="task-icon">{{ getStatusIcon(task.status) }}</span>
        <span class="task-index">{{ index + 1 }}.</span>
        <span class="task-description">{{ task.description }}</span>
        <span v-if="task.error" class="task-error" :title="task.error">
          Error
        </span>
      </li>
    </ul>

    <footer v-if="tasksStore.isComplete" class="task-panel-footer">
      <span v-if="tasksStore.hasErrors" class="completion-status error">
        Completed with errors
      </span>
      <span v-else class="completion-status success">
        All tasks completed
      </span>
    </footer>
  </div>
</template>

<style scoped>
.task-panel {
  background: var(--bg-surface, #fff);
  border: 1px solid var(--border-default, #e5e5e5);
  border-radius: 8px;
  padding: 12px;
  min-width: 280px;
  max-width: 360px;
  box-shadow: var(--shadow-md, 0 4px 12px rgba(0, 0, 0, 0.1));
  font-size: 13px;
}

.task-panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.task-panel-title {
  font-weight: 600;
  color: var(--text-main, #111);
}

.task-panel-progress {
  font-size: 12px;
  color: var(--text-muted, #666);
  font-variant-numeric: tabular-nums;
}

.progress-bar-container {
  height: 4px;
  background: var(--bg-surface-alt, #f5f5f5);
  border-radius: 2px;
  margin-bottom: 12px;
  overflow: hidden;
}

.progress-bar {
  height: 100%;
  background: var(--primary-color, #3b82f6);
  border-radius: 2px;
  transition: width 0.3s ease;
}

.progress-bar.has-errors {
  background: var(--danger-color, #ef4444);
}

.task-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 300px;
  overflow-y: auto;
}

.task-item {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  padding: 6px 8px;
  border-radius: 4px;
  transition: background 0.15s;
}

.task-item:hover {
  background: var(--bg-surface-alt, #f9f9f9);
}

.task-icon {
  font-family: monospace;
  font-size: 11px;
  flex-shrink: 0;
  width: 28px;
}

.task-index {
  color: var(--text-muted, #888);
  font-size: 12px;
  min-width: 20px;
}

.task-description {
  flex: 1;
  color: var(--text-main, #111);
  line-height: 1.4;
}

.task-error {
  font-size: 11px;
  color: var(--danger-color, #ef4444);
  background: var(--danger-bg, #fef2f2);
  padding: 2px 6px;
  border-radius: 4px;
  cursor: help;
}

/* Status colors */
.status-done .task-icon {
  color: var(--success-color, #22c55e);
}

.status-error .task-icon {
  color: var(--danger-color, #ef4444);
}

.status-progress .task-icon {
  color: var(--primary-color, #3b82f6);
  animation: pulse 1s infinite;
}

.status-pending .task-icon {
  color: var(--text-muted, #888);
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.task-panel-footer {
  margin-top: 12px;
  padding-top: 8px;
  border-top: 1px solid var(--border-subtle, #eee);
  text-align: center;
}

.completion-status {
  font-size: 12px;
  font-weight: 500;
}

.completion-status.success {
  color: var(--success-color, #22c55e);
}

.completion-status.error {
  color: var(--danger-color, #ef4444);
}
</style>
