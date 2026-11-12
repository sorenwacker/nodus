<script setup lang="ts">
/**
 * The edges, in two SVG layers (PRODUCT_DESIGN.md > Hovering a card).
 *
 * The base layer holds every visible edge in its plain form - hit area, line,
 * label - and nothing in it depends on what is hovered or selected, so a hover
 * writes nothing into it. The focus layer above it holds the lit edges only:
 * the hovered card's, the selected card's, the selected edge. Any change
 * inside an SVG repaints every path whose box the change touches, and routed
 * paths overlap across the viewport, so when lit edges lived in the same SVG
 * as the rest, one hover repainted all of them: a quarter second on 350
 * paths, on the way in and again on the way out. The rest dim while a focus
 * is lit by the base layer's own opacity, which is a compositor change.
 */
import { computed } from 'vue'
// The definition and the reference must agree on the id, so both use the one
// function (PRODUCT_DESIGN.md > One rule, one place)
import { arrowMarkerIdFor as getArrowMarkerId } from '../composables/edges/useEdgeVisibility'
import { ARROW_HEAD_OVERLAP, HIGHLIGHT_WIDTH_FACTOR, arrowHeadLength } from '../routing/arrowHead'
import type { VisibleEdgeLine } from '../composables/edges'

const props = defineProps<{
  edges: VisibleEdgeLine[]
  /**
   * Draw each edge as a single path, dropping the per-edge hit area and
   * label. Set for a graph large enough to need it and for any zoom at which
   * those extras cannot be seen or clicked (useGraphMetrics > useSimpleEdges).
   */
  simplified: boolean
  /** Every edge is lit by the user's toggle: the base layer draws them full, and nothing dims */
  highlightAll?: boolean
  edgeStrokeWidth: number
  edgeLabelSize: number
  /** Current viewport zoom, used to keep labels a constant on-screen size */
  zoom: number
  /** Hide edge labels below this zoom level (0 = always show) */
  edgeLabelZoomThreshold: number
  lassoPoints: Array<{ x: number; y: number }>
  isLassoSelecting: boolean
  currentTheme: string
  highlightColor: string
  isCreatingEdge: boolean
  edgePreviewStart: { x: number; y: number } | null
  edgePreviewEnd: { x: number; y: number }
}>()

// Labels live in canvas coordinates inside the zoom-scaled layer, so a fixed
// canvas font shrinks as you zoom out. Counter-scale by 1/zoom so the label
// holds a roughly constant on-screen size. Clamp the divisor so labels do not
// grow unboundedly when zoomed far out or collapse when zoomed far in.
const renderedLabelSize = computed(() => {
  const z = Math.min(Math.max(props.zoom, 0.2), 3)
  return props.edgeLabelSize / z
})

// Counter-scaled labels stay full-size while nodes collapse on zoom-out, so
// hide them below the user's edge label zoom threshold (0 = always show).
const showEdgeLabels = computed(() => props.zoom >= props.edgeLabelZoomThreshold)

defineEmits<{
  (e: 'edge-click', event: MouseEvent, edgeId: string): void
}>()

/** The lit edges, drawn again on top of their plain selves */
const focusEdges = computed(() => props.edges.filter(e => e.inFocus))

/** While something is lit, the plain edges step back; with every edge lit by the toggle, nothing does */
const dimmed = computed(() => focusEdges.value.length > 0 && !props.highlightAll)

/** Width of a plain line: the toggle that lights every edge widens them all */
const baseStrokeWidth = computed(() =>
  props.highlightAll ? props.edgeStrokeWidth * HIGHLIGHT_WIDTH_FACTOR : props.edgeStrokeWidth
)
const focusStrokeWidth = computed(() => props.edgeStrokeWidth * HIGHLIGHT_WIDTH_FACTOR)

// Each layer defines the markers it references, so lighting an edge adds
// nothing to the base layer's definitions. The same colour may be defined in
// both; the two are identical, so whichever a reference resolves to is right.
const baseMarkerColors = computed(() => {
  const colors = new Set<string>()
  for (const edge of props.edges) if (edge.color) colors.add(edge.color)
  return Array.from(colors)
})
const focusMarkerColors = computed(() => {
  const colors = new Set<string>()
  // Also add highlight color for edge preview
  colors.add(props.highlightColor)
  for (const edge of focusEdges.value) if (edge.edgeHighlightColor) colors.add(edge.edgeHighlightColor)
  return Array.from(colors)
})

// The head grows with the line, which widens in canvas units as the view zooms
// out (PRODUCT_DESIGN.md > The line under an arrowhead)
const arrowHeadSize = computed(() => arrowHeadLength(props.edgeStrokeWidth))

/** An edge carries a head unless it is undirected or too short for one */
const hasHead = (edge: VisibleEdgeLine) => !edge.isBidirectional && !edge.isShortEdge
</script>

<template>
  <!-- Base layer: every visible edge, plain. Nothing here reads the hover -->
  <svg
    class="edges-layer"
    :class="{ dimmed }"
    style="position:absolute;top:0;left:0;width:100%;height:100%;overflow:visible;"
  >
    <defs>
      <!-- Dynamically create markers for all edge colors in use -->
      <marker
        v-for="color in baseMarkerColors"
        :id="getArrowMarkerId(color)"
        :key="color"
        viewBox="0 0 10 10"
        :markerWidth="arrowHeadSize"
        :markerHeight="arrowHeadSize"
        markerUnits="userSpaceOnUse"
        :refX="10 * ARROW_HEAD_OVERLAP"
        refY="5"
        orient="auto"
      >
        <path d="M0,0 L10,5 L0,10 z" :fill="color" />
      </marker>
    </defs>
    <!-- Existing edges (simplified for large graphs) -->
    <template v-if="simplified">
      <!-- Fast rendering: paths without hit areas; heads only on lit edges, in the focus layer -->
      <path
        v-for="edge in edges"
        :key="edge.id"
        :d="edge.path"
        :stroke="edge.color ?? undefined"
        :stroke-width="baseStrokeWidth"
        :stroke-opacity="edge.baseOpacity"
        fill="none"
        class="edge-line-fast"
        :class="{ 'edge-tagged': edge.link_type === 'tagged' }"
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
        <!-- Visible edge path (branch for bundled, full path for unbundled) -->
        <path
          :d="edge.linePath"
          :stroke="edge.color ?? undefined"
          :stroke-width="baseStrokeWidth"
          :stroke-opacity="edge.baseOpacity"
          :marker-end="hasHead(edge) && edge.color ? `url(#${getArrowMarkerId(edge.color)})` : undefined"
          stroke-linecap="round"
          fill="none"
          class="edge-line-visible"
          :class="{ 'edge-tagged': edge.link_type === 'tagged' }"
          pointer-events="none"
        />
        <text
          v-if="edge.label && showEdgeLabels"
          :x="edge.labelX || (edge.x1 + edge.x2) / 2"
          :y="(edge.labelY || (edge.y1 + edge.y2) / 2) - 2"
          class="edge-label"
          :style="{ fontSize: renderedLabelSize + 'px' }"
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
  </svg>

  <!-- Focus layer: the lit edges, over their plain selves -->
  <svg class="edges-focus-layer" style="position:absolute;top:0;left:0;width:100%;height:100%;overflow:visible;">
    <defs>
      <marker
        v-for="color in focusMarkerColors"
        :id="getArrowMarkerId(color)"
        :key="color"
        viewBox="0 0 10 10"
        :markerWidth="arrowHeadSize"
        :markerHeight="arrowHeadSize"
        markerUnits="userSpaceOnUse"
        :refX="10 * ARROW_HEAD_OVERLAP"
        refY="5"
        orient="auto"
      >
        <path d="M0,0 L10,5 L0,10 z" :fill="color" />
      </marker>
    </defs>
    <g v-for="edge in focusEdges" :key="edge.id">
      <!-- Glow: a wide translucent stroke under the line. A drop-shadow filter
           did this and cost half a second a hover -->
      <path
        :d="edge.path"
        :stroke="edge.edgeHighlightColor"
        :stroke-width="edge.glowStrokeWidth"
        stroke-linecap="round"
        fill="none"
        class="edge-glow"
        opacity="0.3"
        pointer-events="none"
      />
      <path
        :d="edge.linePath"
        :stroke="edge.edgeHighlightColor"
        :stroke-width="focusStrokeWidth"
        :marker-end="hasHead(edge) ? `url(#${getArrowMarkerId(edge.edgeHighlightColor)})` : undefined"
        stroke-linecap="round"
        fill="none"
        class="edge-line-visible edge-highlighted"
        :class="{ 'edge-selected': edge.isSelected, 'edge-tagged': edge.link_type === 'tagged' }"
        pointer-events="none"
      />
    </g>
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
.edges-layer,
.edges-focus-layer {
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

.edge-hit-area:hover + .edge-line-visible {
  stroke-width: 4px !important;
}

.edge-label {
  font-weight: 500;
  fill: var(--text-main);
  text-anchor: middle;
  pointer-events: none;
  user-select: none;
  /* Disable subpixel anti-aliasing to prevent RGB fringing on Linux */
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-rendering: geometricPrecision;
}

.edge-glow {
  pointer-events: none;
}

/* No `filter: drop-shadow()` on a lit edge and no transition on stroke
   opacity: the one rasterised a region the size of each lit path's box, the
   other repainted every plain edge on every frame for 150 ms, and together
   they were most of the half second a hover took
   (PRODUCT_DESIGN.md > Hovering a card). The glow is the .edge-glow stroke. */

.edge-tagged {
  stroke-dasharray: 6, 4;
}

.edge-tagged:not(.edge-highlighted) {
  stroke: var(--text-muted) !important;
}
</style>
