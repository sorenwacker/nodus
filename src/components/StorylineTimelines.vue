<script setup lang="ts">
/**
 * StorylineTimelines - all storylines as horizontal lanes on a shared,
 * broken time axis.
 *
 * Each storyline is a lane in its color (or a stable categorical fallback);
 * dated nodes are beads, date ranges are bars, and nodes shared between
 * storylines are joined by dashed connectors. Only dated nodes are placed.
 */
import { computed, ref, watch, onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'
import { useNodesStore } from '../stores/nodes'
import {
  extractFrontmatterField,
  parseHistoricalDate,
  formatYear,
  formatAxisValue,
  buildBrokenAxis,
  axisX,
  type AxisSegment,
} from '../lib/timelineDates'
import CanvasHoverTooltip from '../canvas/components/CanvasHoverTooltip.vue'
import { renderMarkdown } from '../services/MarkdownRenderService'

const { t } = useI18n()

const emit = defineEmits<{
  (e: 'open-reader', storylineId: string): void
  (e: 'close'): void
}>()

const store = useNodesStore()
const { storylineNodes, storylineNodesVersion } = storeToRefs(store)

const LANE_HEIGHT = 52
const BEAD_RADIUS = 5
const HIT_RADIUS = 12
const PADDING = 24
const AXIS_HEIGHT = 34
const PLOT_WIDTH = 980

// Validated categorical fallback (dataviz palette, fixed order) for
// storylines without a user color; picked by stable id hash so a lane keeps
// its hue regardless of filtering or ordering
const FALLBACK_HUES = 8

function fallbackHue(id: string): number {
  let hash = 0
  for (const ch of id) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0
  return hash % FALLBACK_HUES
}

function laneColor(storylineId: string, userColor: string | null): string {
  return userColor || `var(--tl-cat-${fallbackHue(storylineId)})`
}

/** Node colors are soft background tints on the canvas; marks need them opaque */
function solidColor(color: string | null | undefined): string | null {
  if (!color) return null
  const rgba = color.match(/^rgba?\(([^)]+)\)/)
  if (rgba) {
    const [r, g, b] = rgba[1].split(',').map(part => part.trim())
    return `rgb(${r}, ${g}, ${b})`
  }
  return color
}

const storylines = computed(() => store.filteredStorylines)

interface Lane {
  id: string
  title: string
  color: string
  nodeCount: number
  y: number
  beads: Array<{ nodeId: string; title: string; color: string; x: number; y: number; dateLabel: string | null }>
  spans: Array<{ nodeId: string; title: string; color: string; x1: number; x2: number; y: number; dateLabel: string }>
}

interface LaneNode {
  nodeId: string
  title: string
  color: string | null
  year: number | null
  yearEnd: number | null
  raw: string | null
  rawEnd: string | null
}

const laneNodes = computed<Array<{ storylineId: string; nodes: LaneNode[] }>>(() => {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _version = storylineNodesVersion.value // Reactivity on Map changes
  return storylines.value.map(storyline => ({
    storylineId: storyline.id,
    nodes: (storylineNodes.value.get(storyline.id) || []).map(nodeId => {
      const node = store.getNode(nodeId)
      const content = node?.markdown_content || ''
      const raw = extractFrontmatterField(content, 'date')
      const rawEnd = extractFrontmatterField(content, 'date_end')
      return {
        nodeId,
        title: node?.title || 'Unknown',
        color: solidColor(node?.color_theme),
        year: parseHistoricalDate(raw),
        yearEnd: parseHistoricalDate(rawEnd),
        raw,
        rawEnd,
      }
    }),
  }))
})

// Manual axis range, persisted; either side may be empty (auto)
const rangeFromInput = ref(localStorage.getItem('nodus-timeline-range-from') || '')
const rangeToInput = ref(localStorage.getItem('nodus-timeline-range-to') || '')
watch(rangeFromInput, v => localStorage.setItem('nodus-timeline-range-from', v))
watch(rangeToInput, v => localStorage.setItem('nodus-timeline-range-to', v))

// Broken time axis shared across all lanes: clusters of dated values keep
// proportional widths, large empty gaps are abbreviated. Manual bounds
// window the values and anchor the axis ends.
const axisSegments = computed<AxisSegment[]>(() => {
  const manualMin = parseHistoricalDate(rangeFromInput.value)
  const manualMax = parseHistoricalDate(rangeToInput.value)
  let values = laneNodes.value
    .flatMap(l => l.nodes.flatMap(n => [n.year, n.yearEnd]))
    .filter((y): y is number => y !== null)
  if (manualMin !== null) values = values.filter(v => v >= manualMin)
  if (manualMax !== null) values = values.filter(v => v <= manualMax)
  if (manualMin !== null) values.push(manualMin)
  if (manualMax !== null) values.push(manualMax)
  if (values.length === 0) return []
  return buildBrokenAxis(values, PADDING, PLOT_WIDTH)
})

const hasAxis = computed(() => axisSegments.value.length > 0)

function yearToX(year: number): number {
  return axisX(axisSegments.value, year)
}

const lanes = computed<Lane[]>(() => {
  return laneNodes.value.map((lane, laneIndex) => {
    const storyline = storylines.value[laneIndex]
    const y = AXIS_HEIGHT + laneIndex * LANE_HEIGHT + LANE_HEIGHT / 2
    const base = {
      id: lane.storylineId,
      title: storyline.title,
      color: laneColor(lane.storylineId, storyline.color),
      nodeCount: lane.nodes.length,
      y,
    }

    // Only dated nodes are placed - positions are facts, not guesses
    if (!hasAxis.value) {
      return { ...base, beads: [], spans: [] }
    }

    const dated = lane.nodes.filter(n => n.year !== null)
    const isSpan = (n: LaneNode) => n.yearEnd !== null && n.yearEnd > n.year!
    return {
      ...base,
      beads: dated
        .filter(n => !isSpan(n))
        .map(n => ({
          nodeId: n.nodeId,
          title: n.title,
          color: n.color || base.color,
          x: yearToX(n.year!),
          y,
          dateLabel: n.raw ?? formatYear(n.year!),
        })),
      spans: dated.filter(isSpan).map(n => ({
        nodeId: n.nodeId,
        title: n.title,
        color: n.color || base.color,
        x1: yearToX(n.year!),
        x2: yearToX(n.yearEnd!),
        y,
        dateLabel: `${n.raw ?? formatYear(n.year!)} - ${n.rawEnd ?? formatYear(n.yearEnd!)}`,
      })),
    }
  })
})

// Hovered node: shown with the same hover preview window as the canvas
const hoveredPreview = ref<{ nodeId: string; title: string; dateLabel: string | null; x: number; y: number } | null>(null)

const hoveredNode = computed(() =>
  hoveredPreview.value ? store.getNode(hoveredPreview.value.nodeId) ?? null : null
)

const hoveredRenderedContent = computed(() =>
  hoveredNode.value ? renderMarkdown(hoveredNode.value.markdown_content) : ''
)

const hoveredEdgeStats = computed(() => {
  if (!hoveredPreview.value) return null
  const id = hoveredPreview.value.nodeId
  let incoming = 0
  let outgoing = 0
  let bidirectional = 0
  for (const edge of store.filteredEdges) {
    if (edge.source_node_id !== id && edge.target_node_id !== id) continue
    if (edge.directed === false) bidirectional++
    else if (edge.source_node_id === id) outgoing++
    else incoming++
  }
  return { incoming, outgoing, bidirectional, total: incoming + outgoing + bidirectional }
})

// Graph edges between nodes that both appear on the timelines, drawn as arcs
const edgeLinks = computed(() => {
  const beadPos = new Map<string, { x: number; y: number }>()
  for (const lane of lanes.value) {
    for (const bead of lane.beads) {
      if (!beadPos.has(bead.nodeId)) beadPos.set(bead.nodeId, { x: bead.x, y: bead.y })
    }
  }
  return store.filteredEdges
    .filter(e => beadPos.has(e.source_node_id) && beadPos.has(e.target_node_id))
    .map(e => {
      const from = beadPos.get(e.source_node_id)!
      const to = beadPos.get(e.target_node_id)!
      const midX = (from.x + to.x) / 2
      const arc = from.y === to.y ? from.y - 22 : (from.y + to.y) / 2
      return {
        id: e.id,
        d: `M ${from.x} ${from.y} Q ${midX} ${arc} ${to.x} ${to.y}`,
        color: e.color || undefined,
      }
    })
})

// Dashed connectors between beads of the same node in different lanes
const connectors = computed(() => {
  const occurrences = new Map<string, Array<{ x: number; y: number }>>()
  for (const lane of lanes.value) {
    for (const bead of lane.beads) {
      const list = occurrences.get(bead.nodeId) || []
      list.push({ x: bead.x, y: bead.y })
      occurrences.set(bead.nodeId, list)
    }
  }
  const lines: Array<{ x1: number; y1: number; x2: number; y2: number }> = []
  for (const points of occurrences.values()) {
    for (let i = 1; i < points.length; i++) {
      lines.push({ x1: points[i - 1].x, y1: points[i - 1].y, x2: points[i].x, y2: points[i].y })
    }
  }
  return lines
})

// Axis ticks per segment; label detail adapts to each segment's span, so a
// tight one-hour cluster gets minute labels beside a centuries-wide segment
const axisTicks = computed(() => {
  const ticks: Array<{ x: number; label: string }> = []
  for (const seg of axisSegments.value) {
    const width = seg.x2 - seg.x1
    const count = Math.max(1, Math.floor(width / 140))
    for (let i = 0; i <= count; i++) {
      const value = seg.min + ((seg.max - seg.min) * i) / count
      ticks.push({
        x: seg.x1 + (width * i) / count,
        label: formatAxisValue(value, seg.max - seg.min),
      })
    }
  }
  return ticks
})

// Break markers centered in each abbreviated gap
const axisBreaks = computed(() =>
  axisSegments.value
    .slice(1)
    .map((seg, i) => ({ x: (axisSegments.value[i].x2 + seg.x1) / 2 }))
)

const svgWidth = computed(() => PADDING * 2 + PLOT_WIDTH)
const svgHeight = computed(() => AXIS_HEIGHT + lanes.value.length * LANE_HEIGHT + 8)

onMounted(() => {
  store.loadStorylines()
})
</script>

<template>
  <div class="timelines-view">
    <header class="timelines-header">
      <span class="timelines-title">{{ t('storyline.timelines') }}</span>
      <div class="range-controls">
        <input
          v-model.trim="rangeFromInput"
          type="text"
          class="range-input"
          :placeholder="t('storyline.timelineFrom')"
        />
        <span class="range-sep">-</span>
        <input
          v-model.trim="rangeToInput"
          type="text"
          class="range-input"
          :placeholder="t('storyline.timelineTo')"
        />
      </div>
      <span class="timelines-hint">{{ t('storyline.timelinesDateHint') }}</span>
      <button class="close-btn" :data-tooltip="t('common.close')" @click="emit('close')">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M18 6L6 18M6 6l12 12" />
        </svg>
      </button>
    </header>

    <div v-if="lanes.length === 0" class="timelines-empty">
      <p>{{ t('storyline.noStorylines') }}</p>
    </div>

    <div v-else-if="!hasAxis" class="timelines-empty">
      <p>{{ t('storyline.timelinesDateHint') }}</p>
    </div>

    <div v-else class="tl-body">
      <!-- Fixed label column: identity lives here, not only in color -->
      <div class="tl-labels">
        <div class="tl-axis-spacer" :style="{ height: `${AXIS_HEIGHT}px` }"></div>
        <button
          v-for="(lane, i) in lanes"
          :key="lane.id"
          class="tl-label-row"
          :class="{ striped: i % 2 === 1 }"
          :style="{ height: `${LANE_HEIGHT}px` }"
          @click="emit('open-reader', lane.id)"
        >
          <span class="tl-chip" :style="{ backgroundColor: lane.color }"></span>
          <span class="tl-label-title">{{ lane.title }}</span>
          <span class="tl-label-count">{{ lane.nodeCount }}</span>
        </button>
      </div>

      <!-- Scrollable plot -->
      <div class="tl-plot">
        <svg :width="svgWidth" :height="svgHeight" class="timelines-svg">
          <!-- Alternating lane stripes (recessive) -->
          <rect
            v-for="(lane, i) in lanes"
            v-show="i % 2 === 1"
            :key="`bg${lane.id}`"
            class="lane-stripe"
            x="0"
            :y="AXIS_HEIGHT + i * LANE_HEIGHT"
            :width="svgWidth"
            :height="LANE_HEIGHT"
          />

          <!-- Broken time axis: one line per segment, breaks mark abbreviated gaps -->
          <g class="time-axis">
            <line
              v-for="(seg, i) in axisSegments"
              :key="`seg${i}`"
              class="axis-line"
              :x1="seg.x1"
              :y1="AXIS_HEIGHT - 10"
              :x2="seg.x2"
              :y2="AXIS_HEIGHT - 10"
            />
            <g v-for="(brk, i) in axisBreaks" :key="`b${i}`" class="axis-break">
              <line :x1="brk.x - 7" :y1="AXIS_HEIGHT - 5" :x2="brk.x - 1" :y2="AXIS_HEIGHT - 15" />
              <line :x1="brk.x + 1" :y1="AXIS_HEIGHT - 5" :x2="brk.x + 7" :y2="AXIS_HEIGHT - 15" />
            </g>
            <g v-for="(tick, i) in axisTicks" :key="`t${i}`">
              <line
                class="axis-tick"
                :x1="tick.x"
                :y1="AXIS_HEIGHT - 14"
                :x2="tick.x"
                :y2="AXIS_HEIGHT - 6"
              />
              <line
                class="axis-grid"
                :x1="tick.x"
                :y1="AXIS_HEIGHT"
                :x2="tick.x"
                :y2="svgHeight - 8"
              />
              <text class="axis-label" :x="tick.x" :y="AXIS_HEIGHT - 18" text-anchor="middle">
                {{ tick.label }}
              </text>
            </g>
          </g>

          <!-- Graph edges between timeline nodes -->
          <path
            v-for="link in edgeLinks"
            :key="link.id"
            class="edge-link"
            :d="link.d"
            :style="link.color ? { stroke: link.color } : undefined"
          />
          <line
            v-for="(line, i) in connectors"
            :key="`c${i}`"
            class="timeline-connector"
            :x1="line.x1"
            :y1="line.y1"
            :x2="line.x2"
            :y2="line.y2"
          />

          <g
            v-for="lane in lanes"
            :key="lane.id"
            class="timeline-lane"
            @click="emit('open-reader', lane.id)"
          >
            <line
              v-if="lane.beads.length > 1"
              class="lane-track"
              :x1="Math.min(...lane.beads.map(b => b.x))"
              :y1="lane.y"
              :x2="Math.max(...lane.beads.map(b => b.x))"
              :y2="lane.y"
              :style="{ stroke: lane.color }"
            />
            <!-- Time spans (date + date_end): bars instead of beads -->
            <rect
              v-for="span in lane.spans"
              :key="`s${span.nodeId}`"
              class="lane-span"
              :x="span.x1"
              :y="span.y - 5"
              :width="Math.max(4, span.x2 - span.x1)"
              height="10"
              rx="5"
              :style="{ fill: span.color }"
              @mouseenter="hoveredPreview = { nodeId: span.nodeId, title: span.title, dateLabel: span.dateLabel, x: span.x1, y: span.y }"
              @mouseleave="hoveredPreview = null"
            >
              <title>{{ span.title }} ({{ span.dateLabel }})</title>
            </rect>
            <!-- Beads with an oversized invisible hit target -->
            <g v-for="bead in lane.beads" :key="bead.nodeId">
              <circle
                class="lane-hit"
                :cx="bead.x"
                :cy="bead.y"
                :r="HIT_RADIUS"
                @mouseenter="hoveredPreview = { nodeId: bead.nodeId, title: bead.title, dateLabel: bead.dateLabel, x: bead.x, y: bead.y }"
                @mouseleave="hoveredPreview = null"
              />
              <circle
                class="lane-bead"
                :cx="bead.x"
                :cy="bead.y"
                :r="BEAD_RADIUS"
                :style="{ fill: bead.color }"
              >
                <title>{{ bead.dateLabel ? `${bead.title} (${bead.dateLabel})` : bead.title }}</title>
              </circle>
            </g>
          </g>
        </svg>

        <!-- Same hover preview window as the canvas -->
        <CanvasHoverTooltip
          :visible="hoveredPreview !== null"
          :position="{ x: hoveredPreview?.x ?? 0, y: hoveredPreview?.y ?? 0 }"
          :node="hoveredNode"
          :content="hoveredNode?.markdown_content || ''"
          :rendered-content="hoveredRenderedContent"
          :edge-stats="hoveredEdgeStats"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.timelines-view {
  /* Validated categorical fallback palette (light mode) */
  --tl-cat-0: #2a78d6;
  --tl-cat-1: #eb6834;
  --tl-cat-2: #1baf7a;
  --tl-cat-3: #eda100;
  --tl-cat-4: #e87ba4;
  --tl-cat-5: #008300;
  --tl-cat-6: #4a3aa7;
  --tl-cat-7: #e34948;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--bg-surface);
}

.timelines-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  height: 52px;
  box-sizing: border-box;
  border-bottom: 1px solid var(--border-default);
}

.timelines-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.timelines-hint {
  flex: 1;
  font-size: 11px;
  color: var(--text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.close-btn {
  background: none;
  border: none;
  padding: 4px;
  cursor: pointer;
  color: var(--text-muted);
  border-radius: 4px;
  display: flex;
}

.close-btn:hover {
  background: var(--bg-elevated);
  color: var(--text-main);
}

.range-controls {
  display: flex;
  align-items: center;
  gap: 4px;
}

.range-input {
  width: 90px;
  padding: 4px 8px;
  border: 1px solid var(--border-default);
  border-radius: 6px;
  font-size: 12px;
  background: var(--bg-surface);
  color: var(--text-main);
}

.range-input:focus {
  outline: none;
  border-color: var(--primary-color);
}

.range-sep {
  color: var(--text-muted);
  font-size: 12px;
}

.timelines-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 1;
  color: var(--text-muted);
  font-size: 13px;
  padding: 24px;
  text-align: center;
}

/* Split layout: fixed identity column, scrollable plot */
.tl-body {
  flex: 1;
  display: flex;
  overflow-y: auto;
  min-height: 0;
  overscroll-behavior: contain;
}

.tl-labels {
  flex-shrink: 0;
  width: 200px;
  border-right: 1px solid var(--border-default);
}

.tl-label-row {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 0 12px;
  border: none;
  background: transparent;
  cursor: pointer;
  text-align: left;
  transition: background 0.1s;
}

.tl-label-row.striped {
  background: var(--bg-elevated);
}

.tl-label-row:hover {
  background: rgba(59, 130, 246, 0.08);
}

.tl-chip {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
}

.tl-label-title {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  color: var(--text-main);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.tl-label-count {
  font-size: 11px;
  color: var(--text-muted);
  background: var(--bg-surface);
  border: 1px solid var(--border-default);
  padding: 1px 7px;
  border-radius: 10px;
  flex-shrink: 0;
}

.tl-plot {
  position: relative;
  flex: 1;
  overflow-x: auto;
  min-width: 0;
}

.lane-stripe {
  fill: var(--bg-elevated);
  opacity: 0.55;
}

.timeline-lane {
  cursor: pointer;
}

.lane-track {
  stroke-width: 2;
  opacity: 0.35;
}

.lane-hit {
  fill: transparent;
}

.lane-bead {
  stroke: var(--bg-surface);
  stroke-width: 2;
  pointer-events: none;
  transition: r 0.1s;
}

.lane-hit:hover + .lane-bead {
  r: 7;
}

.lane-span {
  opacity: 0.8;
  cursor: pointer;
  stroke: var(--bg-surface);
  stroke-width: 2;
}

.lane-span:hover {
  opacity: 1;
}

.axis-line,
.axis-tick {
  stroke: var(--text-muted);
  stroke-width: 1;
  opacity: 0.7;
}

.axis-break line {
  stroke: var(--text-muted);
  stroke-width: 1.5;
}

.axis-grid {
  stroke: var(--border-default);
  stroke-width: 1;
  opacity: 0.45;
}

.axis-label {
  font-size: 10px;
  fill: var(--text-muted);
}

.timeline-connector {
  stroke: var(--text-muted);
  stroke-width: 1.5;
  stroke-dasharray: 4 3;
  opacity: 0.55;
}

.edge-link {
  fill: none;
  stroke: var(--text-muted);
  stroke-width: 1.2;
  opacity: 0.3;
}

</style>

<style>
/* Dark-mode steps of the same fallback hues (selected, not auto-flipped) */
:is([data-theme='dark'], [data-theme='pitch-black'], [data-theme='cyber']) .timelines-view {
  --tl-cat-0: #3987e5;
  --tl-cat-1: #d95926;
  --tl-cat-2: #199e70;
  --tl-cat-3: #c98500;
  --tl-cat-4: #d55181;
  --tl-cat-5: #008300;
  --tl-cat-6: #9085e9;
  --tl-cat-7: #e66767;
}
</style>
