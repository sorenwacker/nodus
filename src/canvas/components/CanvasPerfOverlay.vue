<script setup lang="ts">
/**
 * On-screen frame timing for the canvas.
 *
 * Console logging needs the webview's devtools open, which is friction at the
 * moment someone is trying to feel a stutter. This reads out where the frame
 * went while the gesture is happening, in front of the graph that is stuttering
 * (PRODUCT_DESIGN.md > Measuring canvas performance).
 */
import { computed } from 'vue'
import { FRAME_BUDGET_MS, type FrameSummary } from '../composables/util/useFrameProfiler'

const props = defineProps<{
  summary: FrameSummary | null
  visibleNodes: number
  edges: number
  mode: string
}>()

const spans = computed(() =>
  Object.entries(props.summary?.spans ?? {}).sort((a, b) => b[1] - a[1])
)
</script>

<template>
  <div class="perf-overlay">
    <div class="perf-row perf-head">
      <span>{{ mode }}</span>
      <span>{{ visibleNodes }} nodes · {{ edges }} edges</span>
    </div>
    <template v-if="summary">
      <div class="perf-row">
        <span>frame p50</span>
        <span :class="{ over: summary.p50 > FRAME_BUDGET_MS }">{{ summary.p50.toFixed(1) }} ms</span>
      </div>
      <div class="perf-row">
        <span>frame p95</span>
        <span :class="{ over: summary.p95 > FRAME_BUDGET_MS }">{{ summary.p95.toFixed(1) }} ms</span>
      </div>
      <div class="perf-row">
        <span>worst</span>
        <span :class="{ over: summary.worst > FRAME_BUDGET_MS }">{{ summary.worst.toFixed(1) }} ms</span>
      </div>
      <div class="perf-row">
        <span>dropped</span>
        <span :class="{ over: summary.dropped > 0 }">{{ summary.dropped }} / {{ summary.frames }}</span>
      </div>
      <div v-for="[name, ms] in spans" :key="name" class="perf-row perf-span">
        <span>{{ name }}</span>
        <span>{{ ms.toFixed(2) }} ms</span>
      </div>
    </template>
    <div v-else class="perf-row perf-span"><span>pan or zoom to measure</span></div>
  </div>
</template>

<style scoped>
.perf-overlay {
  position: absolute;
  top: 12px;
  right: 12px;
  z-index: 2000;
  min-width: 190px;
  padding: 8px 10px;
  border-radius: 6px;
  background: rgba(0, 0, 0, 0.78);
  color: #e5e7eb;
  font-family: ui-monospace, 'SF Mono', Menlo, monospace;
  font-size: 11px;
  line-height: 1.5;
  pointer-events: none;
}

.perf-row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
}

.perf-head {
  margin-bottom: 4px;
  padding-bottom: 4px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.15);
  color: #9ca3af;
}

.perf-span {
  color: #9ca3af;
}

.over {
  color: #f87171;
}
</style>
