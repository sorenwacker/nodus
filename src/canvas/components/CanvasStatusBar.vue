<script setup lang="ts">
/**
 * CanvasStatusBar - displays canvas statistics and status indicators
 * Shows node/edge counts, layout status, performance mode, and shortcuts hint
 */
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

defineProps<{
  /** Number of currently visible nodes */
  visibleNodeCount: number
  /** Total number of nodes in current workspace */
  totalNodeCount: number
  /** Number of currently visible edges */
  visibleEdgeCount: number
  /** Total number of edges in current workspace */
  totalEdgeCount: number
  /** Whether layout operation is in progress */
  isLayouting: boolean
  /** Whether graph is large enough to trigger performance mode */
  isLargeGraph: boolean
  /** Whether PDF processing is in progress */
  isPdfProcessing: boolean
  /** Current PDF processing status message */
  pdfStatus: string
  /** Agent log entries for display */
  agentLog: string[]
  /** Whether agent log panel is visible */
  showAgentLog: boolean
}>()

const emit = defineEmits<{
  (e: 'stopPdf'): void
  (e: 'toggleAgentLog'): void
}>()
</script>

<template>
  <div class="status-bar">
    <span v-if="isLayouting" class="layout-running">{{ t('canvas.status.layoutRunning') }}</span>
    <span v-if="isLayouting" class="sep">|</span>
    <span v-if="isPdfProcessing" class="pdf-processing">
      PDF: {{ pdfStatus }}
      <button class="stop-btn" :data-tooltip="t('canvas.status.cancelPdf')" data-tooltip-pos="top" @click="emit('stopPdf')">{{ t('canvas.status.stop') }}</button>
    </span>
    <span v-if="isPdfProcessing" class="sep">|</span>
    <span v-if="isLargeGraph" class="perf-mode">{{ t('canvas.status.perfMode') }}</span>
    <span>{{ visibleNodeCount }}/{{ totalNodeCount }} {{ t('canvas.status.nodes') }}</span>
    <span class="sep">|</span>
    <span>{{ visibleEdgeCount }}/{{ totalEdgeCount }} {{ t('canvas.status.edges') }}</span>
    <button
      v-if="agentLog.length > 0"
      class="agent-log-toggle"
      :data-tooltip="showAgentLog ? t('canvas.status.hideAgentLog') : t('canvas.status.showAgentLog')"
      data-tooltip-pos="top"
      @click="emit('toggleAgentLog')"
    >
      {{ t('canvas.status.log') }} ({{ agentLog.length }})
    </button>
    <span class="sep">|</span>
    <span class="hint">{{ t('canvas.status.hint') }}</span>
  </div>
</template>

<style scoped>
.status-bar {
  position: absolute;
  bottom: 16px;
  left: 16px;
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--bg-surface);
  border: 1px solid var(--border-default);
  border-radius: 6px;
  padding: 6px 12px;
  font-size: 11px;
  color: var(--text-muted);
  box-shadow: 0 2px 8px var(--shadow-sm);
  z-index: 50;
}

.status-bar .sep {
  color: var(--border-default);
}

.status-bar .hint {
  color: var(--text-muted);
}

.status-bar .layout-running {
  color: var(--primary-color);
  font-weight: 600;
  animation: pulse 1s infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.6; }
}

.status-bar .perf-mode {
  background: #f97316;
  color: white;
  padding: 2px 6px;
  border-radius: 3px;
  font-weight: 700;
  font-size: 10px;
}

.status-bar .pdf-processing {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--primary-color);
  font-weight: 500;
}

.status-bar .stop-btn {
  padding: 2px 8px;
  font-size: 11px;
  background: var(--danger-color);
  color: white;
  border: none;
  border-radius: 3px;
  cursor: pointer;
}

.status-bar .stop-btn:hover {
  filter: brightness(1.1);
}

.agent-log-toggle {
  padding: 2px 8px;
  font-size: 11px;
  border: 1px solid var(--border-default);
  border-radius: 4px;
  background: var(--bg-surface);
  color: var(--text-secondary);
  cursor: pointer;
}

.agent-log-toggle:hover {
  background: var(--bg-elevated);
  border-color: var(--primary-color);
}
</style>
