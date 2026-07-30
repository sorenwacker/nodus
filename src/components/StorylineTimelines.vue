<script setup lang="ts">
/**
 * StorylineTimelines - all storylines as horizontal lanes
 *
 * Each storyline is a lane in its color; its nodes are beads in sequence
 * order. Nodes shared between storylines are joined by dashed connectors.
 * Clicking a lane or bead opens that storyline in the reader.
 */
import { computed, onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'
import { useNodesStore } from '../stores/nodes'
import {
  extractFrontmatterDate,
  parseHistoricalDate,
  formatYear,
} from '../lib/timelineDates'

const { t } = useI18n()

const emit = defineEmits<{
  (e: 'open-reader', storylineId: string): void
  (e: 'close'): void
}>()

const store = useNodesStore()
const { storylineNodes, storylineNodesVersion } = storeToRefs(store)

const LABEL_WIDTH = 170
const LANE_HEIGHT = 56
const BEAD_SPACING = 48
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
}

interface LaneNode {
  nodeId: string
  title: string
  year: number | null
  raw: string | null
}

const laneNodes = computed<Array<{ storylineId: string; nodes: LaneNode[] }>>(() => {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _version = storylineNodesVersion.value // Reactivity on Map changes
  return storylines.value.map(storyline => ({
    storylineId: storyline.id,
    nodes: (storylineNodes.value.get(storyline.id) || []).map(nodeId => {
      const node = store.getNode(nodeId)
      const raw = extractFrontmatterDate(node?.markdown_content || '')
      return {
        nodeId,
        title: node?.title || 'Unknown',
        year: parseHistoricalDate(raw),
        raw,
      }
    }),
  }))
})

// Shared time range across all lanes; null when no node has a date
const timeRange = computed<{ min: number; max: number } | null>(() => {
  const years = laneNodes.value.flatMap(l =>
    l.nodes.map(n => n.year).filter((y): y is number => y !== null)
  )
  if (years.length === 0) return null
  const min = Math.min(...years)
  const max = Math.max(...years)
  const pad = (max - min || 10) * 0.05
  return { min: min - pad, max: max + pad }
})

function yearToX(year: number): number {
  const range = timeRange.value!
  const t = (year - range.min) / (range.max - range.min)
  return LABEL_WIDTH + PADDING + t * PLOT_WIDTH
}

/** Bead x positions: dated nodes on the time axis, undated interpolated */
function laneXs(nodes: LaneNode[]): number[] {
  if (!timeRange.value) {
    return nodes.map((_, seq) => LABEL_WIDTH + PADDING + seq * BEAD_SPACING)
  }
  const xs: Array<number | null> = nodes.map(n => (n.year !== null ? yearToX(n.year) : null))
  for (let i = 0; i < xs.length; i++) {
    if (xs[i] !== null) continue
    let prev = i - 1
    while (prev >= 0 && xs[prev] === null) prev--
    let next = i + 1
    while (next < xs.length && xs[next] === null) next++
    const prevX = prev >= 0 ? xs[prev]! : null
    const nextX = next < xs.length ? xs[next]! : null
    if (prevX !== null && nextX !== null) {
      xs[i] = prevX + ((nextX - prevX) * (i - prev)) / (next - prev)
    } else if (prevX !== null) {
      xs[i] = prevX + (i - prev) * (BEAD_SPACING / 2)
    } else if (nextX !== null) {
      xs[i] = nextX - (next - i) * (BEAD_SPACING / 2)
    } else {
      xs[i] = LABEL_WIDTH + PADDING + i * BEAD_SPACING
    }
  }
  return xs as number[]
}

const lanes = computed<Lane[]>(() => {
  return laneNodes.value.map((lane, laneIndex) => {
    const storyline = storylines.value[laneIndex]
    const y = AXIS_HEIGHT + PADDING + laneIndex * LANE_HEIGHT + LANE_HEIGHT / 2
    const xs = laneXs(lane.nodes)
    return {
      id: lane.storylineId,
      title: storyline.title,
      color: storyline.color || '#3b82f6',
      y,
      beads: lane.nodes.map((n, i) => ({
        nodeId: n.nodeId,
        title: n.title,
        x: xs[i],
        y,
        dateLabel: n.year !== null ? (n.raw ?? formatYear(n.year)) : null,
      })),
    }
  })
})

// Axis ticks across the shared time range
const axisTicks = computed(() => {
  if (!timeRange.value) return []
  const { min, max } = timeRange.value
  const count = 6
  return Array.from({ length: count + 1 }, (_, i) => {
    const year = min + ((max - min) * i) / count
    return { x: yearToX(year), label: formatYear(year) }
  })
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

const svgWidth = computed(() => {
  if (timeRange.value) return LABEL_WIDTH + PADDING * 2 + PLOT_WIDTH
  const maxBeads = Math.max(0, ...lanes.value.map(l => l.beads.length))
  return LABEL_WIDTH + PADDING * 2 + Math.max(1, maxBeads) * BEAD_SPACING
})

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

    <div v-else class="timelines-scroll">
      <svg :width="svgWidth" :height="svgHeight" class="timelines-svg">
        <!-- Time axis (only when nodes carry date frontmatter) -->
        <g v-if="axisTicks.length > 0" class="time-axis">
          <line
            class="axis-line"
            :x1="LABEL_WIDTH + PADDING"
            :y1="AXIS_HEIGHT - 8"
            :x2="LABEL_WIDTH + PADDING + PLOT_WIDTH"
            :y2="AXIS_HEIGHT - 8"
          />
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
          <circle
            v-for="bead in lane.beads"
            :key="bead.nodeId"
            class="lane-bead"
            :cx="bead.x"
            :cy="bead.y"
            :r="BEAD_RADIUS"
            :fill="lane.color"
          >
            <title>{{ bead.dateLabel ? `${bead.title} (${bead.dateLabel})` : bead.title }}</title>
          </circle>
        </g>
      </svg>
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
  flex: 1;
  overflow: auto;
  min-height: 0;
  overscroll-behavior: contain;
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
