<script setup lang="ts">
/**
 * CanvasControls - zoom controls, layout buttons, and toggles
 */
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

defineProps<{
  /** Current zoom scale (0-1+) */
  scale: number
  /** Whether snap-to-grid is enabled */
  gridLockEnabled: boolean
  /** Whether graph is large (disables some features) */
  isLargeGraph: boolean
  /** Current global edge style */
  globalEdgeStyle: 'straight' | 'orthogonal' | 'diagonal' | 'curved' | 'hyperbolic'
  /** Whether magnifier is enabled */
  magnifierEnabled: boolean
  /** Whether neighborhood mode is active */
  neighborhoodMode: boolean
  /** Current neighborhood depth (1-5 hops) */
  neighborhoodDepth: number
  /** Whether frame placement mode is active */
  pendingFramePlacement: boolean
  /** Whether all edges are highlighted */
  highlightAllEdges: boolean
  /** Whether bubble mode is active (LOD circles) */
  bubbleModeActive: boolean
}>()

const emit = defineEmits<{
  (e: 'zoomIn'): void
  (e: 'zoomOut'): void
  (e: 'fitToContent'): void
  (e: 'toggleGridLock'): void
  (e: 'layout', type: 'grid' | 'force' | 'hierarchical' | 'radial'): void
  (e: 'fitNodesToContent'): void
  (e: 'cycleEdgeStyle'): void
  (e: 'toggleMagnifier'): void
  (e: 'toggleNeighborhoodMode'): void
  (e: 'setNeighborhoodDepth', depth: number): void
  (e: 'createFrame'): void
  (e: 'showHelp'): void
  (e: 'toggleHighlightEdges'): void
  (e: 'toggleBubbleMode'): void
}>()
</script>

<template>
  <div class="zoom-controls" @mousedown.stop @pointerdown.stop>
    <button data-tooltip-pos="top" :data-tooltip="t('canvas.controls.zoomIn')" @click="emit('zoomIn')">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <line x1="12" y1="5" x2="12" y2="19" />
        <line x1="5" y1="12" x2="19" y2="12" />
      </svg>
    </button>
    <span>{{ Math.round(scale * 100) }}%</span>
    <button data-tooltip-pos="top" :data-tooltip="t('canvas.controls.zoomOut')" @click="emit('zoomOut')">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <line x1="5" y1="12" x2="19" y2="12" />
      </svg>
    </button>
    <button data-tooltip-pos="top" :data-tooltip="t('canvas.controls.fitToContent')" @click="emit('fitToContent')">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
      </svg>
    </button>
    <button
      data-tooltip-pos="top"
      :class="{ active: gridLockEnabled }"
      :data-tooltip="t('canvas.controls.snapToGrid')"
      @click="emit('toggleGridLock')"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="3" y="3" width="7" height="7" />
        <rect x="14" y="3" width="7" height="7" />
        <rect x="14" y="14" width="7" height="7" />
        <rect x="3" y="14" width="7" height="7" />
      </svg>
    </button>
    <button data-tooltip-pos="top" :data-tooltip="t('canvas.controls.gridLayout')" @click="emit('layout', 'grid')">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="3" y="3" width="5" height="5" />
        <rect x="10" y="3" width="5" height="5" />
        <rect x="17" y="3" width="5" height="5" />
        <rect x="3" y="10" width="5" height="5" />
        <rect x="10" y="10" width="5" height="5" />
        <rect x="17" y="10" width="5" height="5" />
      </svg>
    </button>
    <button data-tooltip-pos="top" :data-tooltip="t('canvas.controls.forceLayout')" @click="emit('layout', 'force')">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="6" cy="6" r="3" />
        <circle cx="18" cy="6" r="3" />
        <circle cx="12" cy="18" r="3" />
        <line x1="8" y1="8" x2="10" y2="16" />
        <line x1="16" y1="8" x2="14" y2="16" />
        <line x1="9" y1="6" x2="15" y2="6" />
      </svg>
    </button>
    <button
      data-tooltip-pos="top"
      :data-tooltip="t('canvas.controls.hierarchicalLayout')"
      @click="emit('layout', 'hierarchical')"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="4" r="2" />
        <circle cx="6" cy="12" r="2" />
        <circle cx="18" cy="12" r="2" />
        <circle cx="4" cy="20" r="2" />
        <circle cx="8" cy="20" r="2" />
        <circle cx="16" cy="20" r="2" />
        <circle cx="20" cy="20" r="2" />
        <line x1="12" y1="6" x2="6" y2="10" />
        <line x1="12" y1="6" x2="18" y2="10" />
        <line x1="6" y1="14" x2="4" y2="18" />
        <line x1="6" y1="14" x2="8" y2="18" />
        <line x1="18" y1="14" x2="16" y2="18" />
        <line x1="18" y1="14" x2="20" y2="18" />
      </svg>
    </button>
    <button
      data-tooltip-pos="top"
      :data-tooltip="t('canvas.controls.radialLayout')"
      @click="emit('layout', 'radial')"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="3" />
        <circle cx="12" cy="12" r="7" fill="none" />
        <circle cx="12" cy="5" r="2" />
        <circle cx="19" cy="12" r="2" />
        <circle cx="12" cy="19" r="2" />
        <circle cx="5" cy="12" r="2" />
      </svg>
    </button>
    <button data-tooltip-pos="top" :data-tooltip="t('canvas.controls.fitNodesToContent')" @click="emit('fitNodesToContent')">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <path d="M9 3v18" />
        <path d="M3 9h18" />
      </svg>
    </button>
    <button data-tooltip-pos="top" :disabled="isLargeGraph" :data-tooltip="`${t('canvas.controls.edgeStyle')}: ${t('settings.edgeStyles.' + globalEdgeStyle)}`" @click="emit('cycleEdgeStyle')">
      <svg
        v-if="globalEdgeStyle === 'orthogonal'"
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      >
        <path d="M4 20 L4 12 L20 12 L20 4" />
      </svg>
      <svg
        v-else-if="globalEdgeStyle === 'diagonal'"
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      >
        <path d="M4 20 L12 12 L20 12 L20 4" />
      </svg>
      <svg
        v-else-if="globalEdgeStyle === 'curved'"
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      >
        <path d="M4 20 C4 12 20 12 20 4" />
      </svg>
      <svg
        v-else-if="globalEdgeStyle === 'hyperbolic'"
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      >
        <path d="M4 20 C8 20 8 4 12 12 C16 20 16 4 20 4" />
      </svg>
      <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M4 20 L20 4" />
      </svg>
    </button>
    <button
      data-tooltip-pos="top-left"
      :class="{ active: highlightAllEdges }"
      :data-tooltip="t('canvas.controls.highlightEdges')"
      @click="emit('toggleHighlightEdges')"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <line x1="4" y1="20" x2="20" y2="4" stroke-width="3" />
        <line x1="4" y1="12" x2="12" y2="4" />
        <line x1="12" y1="20" x2="20" y2="12" />
      </svg>
    </button>
    <button
      data-tooltip-pos="top-left"
      :class="{ active: magnifierEnabled }"
      :data-tooltip="t('canvas.controls.magnifier')"
      @click="emit('toggleMagnifier')"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="10" cy="10" r="7" />
        <line x1="15" y1="15" x2="21" y2="21" />
      </svg>
    </button>
    <button
      data-tooltip-pos="top-left"
      :class="{ active: neighborhoodMode }"
      :data-tooltip="t('canvas.controls.neighborhoodView')"
      @mousedown.stop.prevent="emit('toggleNeighborhoodMode')"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="4" />
        <circle cx="4" cy="8" r="2" />
        <circle cx="20" cy="8" r="2" />
        <circle cx="4" cy="16" r="2" />
        <circle cx="20" cy="16" r="2" />
        <line x1="8" y1="10" x2="6" y2="9" />
        <line x1="16" y1="10" x2="18" y2="9" />
        <line x1="8" y1="14" x2="6" y2="15" />
        <line x1="16" y1="14" x2="18" y2="15" />
      </svg>
    </button>
    <button
      data-tooltip-pos="top-left"
      :class="{ active: bubbleModeActive }"
      :data-tooltip="t('canvas.controls.bubbleMode')"
      @click="emit('toggleBubbleMode')"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="8" cy="8" r="5" />
        <circle cx="16" cy="16" r="4" />
        <circle cx="18" cy="6" r="3" />
      </svg>
    </button>
    <select
      v-if="neighborhoodMode"
      data-tooltip-pos="top-left"
      class="depth-select"
      :value="neighborhoodDepth"
      :data-tooltip="t('canvas.controls.neighborhoodDepth')"
      @change="emit('setNeighborhoodDepth', Number(($event.target as HTMLSelectElement).value))"
    >
      <option value="1">1 {{ t('canvas.controls.hop') }}</option>
      <option value="2">2 {{ t('canvas.controls.hops') }}</option>
      <option value="3">3 {{ t('canvas.controls.hops') }}</option>
      <option value="4">4 {{ t('canvas.controls.hops') }}</option>
      <option value="5">5 {{ t('canvas.controls.hops') }}</option>
    </select>
    <button
      data-tooltip-pos="top-left"
      :data-tooltip="pendingFramePlacement ? t('canvas.frame.clickToPlace') : t('canvas.frame.addFrame')"
      :class="{ active: pendingFramePlacement }"
      @click="emit('createFrame')"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <line x1="9" y1="3" x2="9" y2="21" />
      </svg>
    </button>
    <button
      data-tooltip-pos="top-left"
      :data-tooltip="t('canvas.controls.help')"
      @click="emit('showHelp')"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10" />
        <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
    </button>
  </div>
</template>

<style scoped>
.zoom-controls {
  position: absolute;
  bottom: 16px;
  right: 16px;
  display: flex;
  align-items: center;
  gap: 6px;
  background: var(--bg-surface);
  border: 1px solid var(--border-default);
  border-radius: 6px;
  padding: 4px 8px;
  box-shadow: 0 2px 8px var(--shadow-sm);
  z-index: 50;
}

.zoom-controls button {
  width: 26px;
  height: 26px;
  border: 1px solid var(--border-default);
  background: var(--bg-surface);
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  position: relative;
}

.zoom-controls button svg {
  flex-shrink: 0;
}

.zoom-controls button:hover {
  background: var(--bg-elevated);
}

.zoom-controls button.active {
  background: var(--primary-color);
  color: white;
  border-color: var(--primary-color);
}

.zoom-controls button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.zoom-controls .depth-select {
  font-size: 11px;
  padding: 2px 4px;
  border: 1px solid var(--border-default);
  border-radius: 4px;
  background: var(--bg-surface);
  color: var(--text-main);
  cursor: pointer;
}

.zoom-controls .depth-select:hover {
  border-color: var(--primary-color);
}

.zoom-controls span {
  font-size: 11px;
  color: var(--text-muted);
  min-width: 36px;
  text-align: center;
}
</style>
