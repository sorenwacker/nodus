<script setup lang="ts">
/**
 * CanvasControls - zoom controls, layout buttons, and toggles
 */
defineProps<{
  /** Current zoom scale (0-1+) */
  scale: number
  /** Whether snap-to-grid is enabled */
  gridLockEnabled: boolean
  /** Whether graph is large (disables some features) */
  isLargeGraph: boolean
  /** Current global edge style */
  globalEdgeStyle: 'straight' | 'orthogonal' | 'diagonal' | 'curved'
  /** Whether edge bundling is enabled */
  edgeBundling: boolean
  /** Whether magnifier is enabled */
  magnifierEnabled: boolean
  /** Whether neighborhood mode is active */
  neighborhoodMode: boolean
  /** Current neighborhood depth (1-5 hops) */
  neighborhoodDepth: number
  /** Whether frame placement mode is active */
  pendingFramePlacement: boolean
}>()

const emit = defineEmits<{
  (e: 'zoomIn'): void
  (e: 'zoomOut'): void
  (e: 'fitToContent'): void
  (e: 'toggleGridLock'): void
  (e: 'layout', type: 'grid' | 'force' | 'hierarchical'): void
  (e: 'fitNodesToContent'): void
  (e: 'cycleEdgeStyle'): void
  (e: 'toggleEdgeBundling'): void
  (e: 'toggleMagnifier'): void
  (e: 'toggleNeighborhoodMode'): void
  (e: 'setNeighborhoodDepth', depth: number): void
  (e: 'createFrame'): void
}>()
</script>

<template>
  <div class="zoom-controls" @mousedown.stop>
    <button data-tooltip="Zoom In" @click="emit('zoomIn')">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <line x1="12" y1="5" x2="12" y2="19" />
        <line x1="5" y1="12" x2="19" y2="12" />
      </svg>
    </button>
    <span>{{ Math.round(scale * 100) }}%</span>
    <button data-tooltip="Zoom Out" @click="emit('zoomOut')">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <line x1="5" y1="12" x2="19" y2="12" />
      </svg>
    </button>
    <button data-tooltip="Fit to Content - Show all nodes" @click="emit('fitToContent')">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
      </svg>
    </button>
    <button
      :class="{ active: gridLockEnabled }"
      data-tooltip="Snap to Grid - Align nodes to grid when dragging"
      @click="emit('toggleGridLock')"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="3" y="3" width="7" height="7" />
        <rect x="14" y="3" width="7" height="7" />
        <rect x="14" y="14" width="7" height="7" />
        <rect x="3" y="14" width="7" height="7" />
      </svg>
    </button>
    <button data-tooltip="Grid Layout - Arrange nodes in a grid" @click="emit('layout', 'grid')">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="3" y="3" width="5" height="5" />
        <rect x="10" y="3" width="5" height="5" />
        <rect x="17" y="3" width="5" height="5" />
        <rect x="3" y="10" width="5" height="5" />
        <rect x="10" y="10" width="5" height="5" />
        <rect x="17" y="10" width="5" height="5" />
      </svg>
    </button>
    <button data-tooltip="Force Layout - Arrange by connections" @click="emit('layout', 'force')">
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
      data-tooltip="Hierarchical Layout - Arrange as tree (for DAGs/ontologies)"
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
    <button data-tooltip="Fit Nodes to Content - Resize all nodes to show full content" @click="emit('fitNodesToContent')">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <path d="M9 3v18" />
        <path d="M3 9h18" />
      </svg>
    </button>
    <button :disabled="isLargeGraph" :data-tooltip="`Edge Style: ${globalEdgeStyle}`" @click="emit('cycleEdgeStyle')">
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
      <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M4 20 L20 4" />
      </svg>
    </button>
    <button
      :class="{ active: edgeBundling }"
      data-tooltip="Edge Bundling - Merge edges with shared endpoints"
      @click="emit('toggleEdgeBundling')"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M4 4 L12 12 L4 20" />
        <path d="M8 4 L12 12 L8 20" />
        <line x1="12" y1="12" x2="20" y2="12" stroke-width="3" />
      </svg>
    </button>
    <button
      :class="{ active: magnifierEnabled }"
      data-tooltip="Magnifier - Show magnified view when zoomed out"
      @click="emit('toggleMagnifier')"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="10" cy="10" r="7" />
        <line x1="15" y1="15" x2="21" y2="21" />
      </svg>
    </button>
    <button
      :class="{ active: neighborhoodMode }"
      data-tooltip="Neighborhood View - Show only selected node and neighbors (N)"
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
    <select
      v-if="neighborhoodMode"
      class="depth-select"
      :value="neighborhoodDepth"
      @change="emit('setNeighborhoodDepth', Number(($event.target as HTMLSelectElement).value))"
      data-tooltip="Neighborhood depth (hops)"
    >
      <option value="1">1 hop</option>
      <option value="2">2 hops</option>
      <option value="3">3 hops</option>
      <option value="4">4 hops</option>
      <option value="5">5 hops</option>
    </select>
    <button
      :data-tooltip="pendingFramePlacement ? 'Click on canvas to place frame (Esc to cancel)' : 'Add Frame - Group selected nodes'"
      :class="{ active: pendingFramePlacement }"
      @click="emit('createFrame')"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <line x1="9" y1="3" x2="9" y2="21" />
      </svg>
    </button>
  </div>
</template>
