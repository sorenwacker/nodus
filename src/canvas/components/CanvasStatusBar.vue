<script setup lang="ts">
/**
 * CanvasStatusBar - displays canvas statistics and status indicators
 * Shows node/edge counts, layout status, performance mode, and shortcuts hint
 */
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
    <span v-if="isLayouting" class="layout-running">Layout running...</span>
    <span v-if="isLayouting" class="sep">|</span>
    <span v-if="isPdfProcessing" class="pdf-processing">
      PDF: {{ pdfStatus }}
      <button class="stop-btn" @click="emit('stopPdf')">Stop</button>
    </span>
    <span v-if="isPdfProcessing" class="sep">|</span>
    <span v-if="isLargeGraph" class="perf-mode">PERF</span>
    <span>{{ visibleNodeCount }}/{{ totalNodeCount }} nodes</span>
    <span class="sep">|</span>
    <span>{{ visibleEdgeCount }}/{{ totalEdgeCount }} edges</span>
    <button
      v-if="agentLog.length > 0"
      class="agent-log-toggle"
      @click="emit('toggleAgentLog')"
      :title="showAgentLog ? 'Hide agent log' : 'Show agent log'"
    >
      Log ({{ agentLog.length }})
    </button>
    <span class="sep">|</span>
    <span class="hint">Scroll up/down: zoom | Scroll sideways: pan | Alt+drag: link | Dbl-click: new</span>
  </div>
</template>
