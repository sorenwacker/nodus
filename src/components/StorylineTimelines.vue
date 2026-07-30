<script setup lang="ts">
/**
 * StorylineTimelines - all storylines as horizontal lanes
 *
 * Each storyline is a lane in its color; its nodes are beads in sequence
 * order. Nodes shared between storylines are joined by dashed connectors.
 * Clicking a lane or bead opens that storyline in the reader.
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
import MarkdownContent from './MarkdownContent.vue'

const { t } = useI18n()

const emit = defineEmits<{
  (e: 'open-reader', storylineId: string): void
  (e: 'close'): void
}>()

const store = useNodesStore()
const { storylineNodes, storylineNodesVersion } = storeToRefs(store)

const LABEL_WIDTH = 170
const LANE_HEIGHT = 56
const BEAD_RADIUS = 7
const PADDING = 24
const AXIS_HEIGHT = 32
const PLOT_WIDTH = 900

const storylines = computed(() => store.filteredStorylines)

interface Lane {
  id: string
  title: string
  color: string
  y: number
  beads: Array<{ nodeId: string; title: string; x: number; y: number; dateLabel: string | null }>
  spans: Array<{ nodeId: string; title: string; x1: number; x2: number; y: number; dateLabel: string }>
}

interface LaneNode {
  nodeId: string
  title: string
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
  return buildBrokenAxis(values, LABEL_WIDTH + PADDING, PLOT_WIDTH)
})

const hasAxis = computed(() => axisSegments.value.length > 0)

function yearToX(year: number): number {
  return axisX(axisSegments.value, year)
}

const lanes = computed<Lane[]>(() => {
  return laneNodes.value.map((lane, laneIndex) => {
    const storyline = storylines.value[laneIndex]
    const y = AXIS_HEIGHT + PADDING + laneIndex * LANE_HEIGHT + LANE_HEIGHT / 2
    const base = {
      id: lane.storylineId,
      title: storyline.title,
      color: storyline.color || '#3b82f6',
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
          x: yearToX(n.year!),
          y,
          dateLabel: n.raw ?? formatYear(n.year!),
        })),
      spans: dated.filter(isSpan).map(n => ({
        nodeId: n.nodeId,
        title: n.title,
        x1: yearToX(n.year!),
        x2: yearToX(n.yearEnd!),
        y,
        dateLabel: `${n.raw ?? formatYear(n.year!)} - ${n.rawEnd ?? formatYear(n.yearEnd!)}`,
      })),
    }
  })
})

// Hovered node preview (same rendered content as canvas previews)
const hoveredPreview = ref<{ nodeId: string; title: string; dateLabel: string | null; x: number; y: number } | null>(null)

const hoveredPreviewContent = computed(() =>
  hoveredPreview.value ? store.getNode(hoveredPreview.value.nodeId)?.markdown_content || '' : ''
)

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
      const arc = from.y === to.y ? from.y - 24 : (from.y + to.y) / 2
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

const svgWidth = computed(() => LABEL_WIDTH + PADDING * 2 + PLOT_WIDTH)

const svgHeight = computed(
  () => AXIS_HEIGHT + PADDING * 2 + lanes.value.length * LANE_HEIGHT
)

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

    <div v-else class="timelines-scroll">
      <svg :width="svgWidth" :height="svgHeight" class="timelines-svg">
        <!-- Broken time axis: one line per segment, breaks mark abbreviated gaps -->
        <g v-if="axisTicks.length > 0" class="time-axis">
          <line
            v-for="(seg, i) in axisSegments"
            :key="`seg${i}`"
            class="axis-line"
            :x1="seg.x1"
            :y1="AXIS_HEIGHT - 8"
            :x2="seg.x2"
            :y2="AXIS_HEIGHT - 8"
          />
          <g v-for="(brk, i) in axisBreaks" :key="`b${i}`" class="axis-break">
            <line :x1="brk.x - 7" :y1="AXIS_HEIGHT - 3" :x2="brk.x - 1" :y2="AXIS_HEIGHT - 13" />
            <line :x1="brk.x + 1" :y1="AXIS_HEIGHT - 3" :x2="brk.x + 7" :y2="AXIS_HEIGHT - 13" />
          </g>
          <g v-for="(tick, i) in axisTicks" :key="`t${i}`">
            <line
              class="axis-tick"
              :x1="tick.x"
              :y1="AXIS_HEIGHT - 12"
              :x2="tick.x"
              :y2="AXIS_HEIGHT - 4"
            />
            <line
              class="axis-grid"
              :x1="tick.x"
              :y1="AXIS_HEIGHT"
              :x2="tick.x"
              :y2="svgHeight - PADDING"
            />
            <text class="axis-label" :x="tick.x" :y="AXIS_HEIGHT - 16" text-anchor="middle">
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
          <text class="lane-title" :x="PADDING" :y="lane.y + 4">
            {{ lane.title }}
          </text>
          <line
            v-if="lane.beads.length > 0"
            class="lane-track"
            :x1="LABEL_WIDTH + PADDING"
            :y1="lane.y"
            :x2="lane.beads[lane.beads.length - 1].x"
            :y2="lane.y"
            :stroke="lane.color"
          />
          <!-- Time spans (date + date_end): bars instead of beads -->
          <rect
            v-for="span in lane.spans"
            :key="`s${span.nodeId}`"
            class="lane-span"
            :x="span.x1"
            :y="span.y - 6"
            :width="Math.max(4, span.x2 - span.x1)"
            height="12"
            rx="6"
            :fill="lane.color"
            @mouseenter="hoveredPreview = { nodeId: span.nodeId, title: span.title, dateLabel: span.dateLabel, x: span.x1, y: span.y }"
            @mouseleave="hoveredPreview = null"
          >
            <title>{{ span.title }} ({{ span.dateLabel }})</title>
          </rect>
          <circle
            v-for="bead in lane.beads"
            :key="bead.nodeId"
            class="lane-bead"
            :cx="bead.x"
            :cy="bead.y"
            :r="BEAD_RADIUS"
            :fill="lane.color"
            @mouseenter="hoveredPreview = { nodeId: bead.nodeId, title: bead.title, dateLabel: bead.dateLabel, x: bead.x, y: bead.y }"
            @mouseleave="hoveredPreview = null"
          >
            <title>{{ bead.dateLabel ? `${bead.title} (${bead.dateLabel})` : bead.title }}</title>
          </circle>
        </g>
      </svg>

      <!-- Hover preview: same rendered content as canvas node previews -->
      <div
        v-if="hoveredPreview"
        class="bead-preview"
        :style="{ left: `${Math.max(8, hoveredPreview.x - 140)}px`, top: `${hoveredPreview.y + 16}px` }"
      >
        <div class="bead-preview-title">{{ hoveredPreview.title }}</div>
        <div v-if="hoveredPreview.dateLabel" class="bead-preview-date">{{ hoveredPreview.dateLabel }}</div>
        <MarkdownContent
          v-if="hoveredPreviewContent"
          class="bead-preview-content"
          :content="hoveredPreviewContent"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.timelines-view {
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

.axis-line,
.axis-tick {
  stroke: var(--text-muted);
  stroke-width: 1;
}

.axis-break line {
  stroke: var(--text-muted);
  stroke-width: 1.5;
}

.axis-grid {
  stroke: var(--border-default);
  stroke-width: 1;
  opacity: 0.5;
}

.axis-label {
  font-size: 10px;
  fill: var(--text-muted);
}

.timelines-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 1;
  color: var(--text-muted);
  font-size: 13px;
}

.timelines-scroll {
  position: relative;
  flex: 1;
  overflow: auto;
  min-height: 0;
  overscroll-behavior: contain;
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

.lane-span {
  opacity: 0.75;
  cursor: pointer;
  stroke: var(--bg-surface);
  stroke-width: 1;
}

.lane-span:hover {
  opacity: 1;
}

.bead-preview {
  position: absolute;
  width: 280px;
  max-height: 220px;
  overflow: hidden;
  padding: 10px 12px;
  background: var(--bg-surface);
  border: 1px solid var(--border-default);
  border-radius: 8px;
  box-shadow: 0 4px 12px var(--shadow-md);
  pointer-events: none;
  z-index: 5;
}

.bead-preview-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-main);
}

.bead-preview-date {
  font-size: 11px;
  color: var(--text-muted);
  margin-bottom: 6px;
}

.bead-preview-content {
  font-size: 12px;
  color: var(--text-secondary);
}

.timeline-lane {
  cursor: pointer;
}

.lane-title {
  font-size: 13px;
  fill: var(--text-main);
}

.lane-track {
  stroke-width: 2;
  opacity: 0.5;
}

.lane-bead {
  stroke: var(--bg-surface);
  stroke-width: 2;
  transition: r 0.1s;
}

.timeline-lane:hover .lane-bead {
  r: 9;
}

.timeline-connector {
  stroke: var(--text-muted);
  stroke-width: 1.5;
  stroke-dasharray: 4 3;
  opacity: 0.6;
}

.edge-link {
  fill: none;
  stroke: var(--text-muted);
  stroke-width: 1.2;
  opacity: 0.35;
}
</style>
