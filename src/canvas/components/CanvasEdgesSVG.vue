<script setup lang="ts">
import { computed } from 'vue'
import type { VisibleEdgeLine } from '../composables/edges'

export interface MarkerColor {
  value: string
}

const props = defineProps<{
  edges: VisibleEdgeLine[]
  markerColors: MarkerColor[]
  isLargeGraph: boolean
  edgeStrokeWidth: number
  lassoPoints: Array<{ x: number; y: number }>
  isLassoSelecting: boolean
  currentTheme: string
  highlightColor: string
  isCreatingEdge: boolean
  edgePreviewStart: { x: number; y: number } | null
  edgePreviewEnd: { x: number; y: number }
  getArrowMarkerId: (color: string) => string
}>()

// Compute marker size - scale down when zoomed out for visual consistency
// edgeStrokeWidth increases when zoomed out, so we use inverse relationship
// Base marker size is 6 at normal zoom (strokeWidth ~1)
const markerSize = computed(() => {
  // Clamp stroke width effect - at very zoomed out, markers stay small
  const baseSize = 6
  const scaleFactor = Math.min(1, 1 / props.edgeStrokeWidth)
  return Math.max(2, baseSize * scaleFactor)
})

defineEmits<{
  (e: 'edge-click', event: MouseEvent, edgeId: string): void
}>()
</script>

<template>
  <svg class="edges-layer" style="position:absolute;top:0;left:0;width:100%;height:100%;overflow:visible;">
    <defs>
      <marker
        v-for="color in markerColors"
        :id="getArrowMarkerId(color.value)"
        :key="color.value"
        viewBox="0 0 10 10"
        :markerWidth="markerSize"
        :markerHeight="markerSize"
        refX="10"
        refY="5"
        orient="auto"
      >
        <path d="M0,0 L10,5 L0,10 z" :fill="color.value" />
      </marker>
    </defs>

    <!-- Existing edges (simplified for large graphs) -->
    <template v-if="isLargeGraph">
      <!-- Fast rendering: paths without hit areas, markers only for highlighted -->
      <path
        v-for="edge in edges"
        :key="edge.id"
        :d="edge.path"
        :stroke="edge.isHighlighted ? edge.edgeHighlightColor : (edge.color ?? undefined)"
        :stroke-width="edge.isHighlighted ? edgeStrokeWidth * 1.3 : edgeStrokeWidth"
        :stroke-opacity="edge.opacity"
        :marker-end="edge.isHighlighted && !edge.isBidirectional && !edge.isShortEdge ? `url(#${edge.arrowMarkerId})` : undefined"
        fill="none"
        class="edge-line-fast"
        :class="{ 'edge-highlighted': edge.isHighlighted, 'edge-tagged': edge.link_type === 'tagged', 'edge-neighbor': edge.isNeighborEdge }"
      />
    </template>
    <template v-else>
      <g v-for="edge in edges" :key="edge.id">
        <!-- Invisible wider hit area -->
        <path
          :d="edge.path"
          stroke="transparent"
          stroke-width="12"
          fill="none"
          class="edge-hit-area"
          @click="$emit('edge-click', $event, edge.id)"
        />
        <!-- Glow effect for selected edge -->
        <path
          v-if="edge.isSelected"
          :d="edge.path"
          :stroke="edge.color ?? undefined"
          :stroke-width="edge.glowStrokeWidth"
          stroke-linecap="round"
          fill="none"
          class="edge-glow"
          opacity="0.3"
          pointer-events="none"
        />
        <!-- Visible edge path (branch for bundled, full path for unbundled) -->
        <path
          :d="edge.path"
          :stroke="edge.isHighlighted ? edge.edgeHighlightColor : (edge.color ?? undefined)"
          :stroke-width="edge.renderStrokeWidth"
          :stroke-opacity="edge.opacity"
          :marker-end="edge.isBidirectional || edge.isShortEdge ? undefined : `url(#${edge.arrowMarkerId})`"
          stroke-linecap="round"
          fill="none"
          class="edge-line-visible"
          :class="{ 'edge-selected': edge.isSelected, 'edge-highlighted': edge.isHighlighted, 'edge-tagged': edge.link_type === 'tagged', 'edge-neighbor': edge.isNeighborEdge }"
          pointer-events="none"
        />
        <text
          v-if="edge.label"
          :x="edge.labelX || (edge.x1 + edge.x2) / 2"
          :y="(edge.labelY || (edge.y1 + edge.y2) / 2) - 2"
          class="edge-label"
        >{{ edge.label }}</text>
      </g>
    </template>

    <!-- Lasso selection -->
    <polygon
      v-if="isLassoSelecting && lassoPoints.length > 2"
      :points="lassoPoints.map(p => `${p.x},${p.y}`).join(' ')"
      :fill="currentTheme === 'cyber' ? 'rgba(0, 255, 204, 0.1)' : 'rgba(59, 130, 246, 0.1)'"
      :stroke="highlightColor"
      stroke-width="2"
      stroke-dasharray="4,4"
    />

    <!-- Edge preview while creating -->
    <line
      v-if="isCreatingEdge && edgePreviewStart"
      :x1="edgePreviewStart.x"
      :y1="edgePreviewStart.y"
      :x2="edgePreviewEnd.x"
      :y2="edgePreviewEnd.y"
      :stroke="highlightColor"
      stroke-width="2"
      stroke-dasharray="8,4"
      style="pointer-events: none"
    />
  </svg>
</template>

<style scoped>
.edges-layer {
  pointer-events: none;
  overflow: visible;
  background: none;
}

.edge-hit-area {
  cursor: pointer;
  pointer-events: stroke;
}

.edge-line-visible {
  stroke-linecap: round;
  stroke-linejoin: round;
  shape-rendering: geometricPrecision;
}

.edge-line-fast {
  stroke-linecap: round;
  shape-rendering: optimizeSpeed;
  pointer-events: none;
}

.edge-hit-area:hover + .edge-glow + .edge-line-visible,
.edge-hit-area:hover + .edge-line-visible {
  stroke-width: 4px !important;
}

.edge-label {
  font-size: 11px;
  font-weight: 500;
  fill: var(--text-main);
  text-anchor: middle;
  pointer-events: none;
  user-select: none;
}

.edge-glow {
  pointer-events: none;
}

.edge-highlighted {
  filter: drop-shadow(0 0 4px rgba(59, 130, 246, 0.6));
}

/* Smooth opacity transitions (stroke-opacity is set inline from JS) */
.edge-line-visible,
.edge-line-fast {
  transition: stroke-opacity 0.15s ease;
}

.edge-tagged {
  stroke-dasharray: 6, 4;
}

.edge-tagged:not(.edge-highlighted) {
  stroke: var(--text-muted) !important;
}
</style>
