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

const { t } = useI18n()

const emit = defineEmits<{
  (e: 'open-reader', storylineId: string): void
}>()

const store = useNodesStore()
const { storylineNodes, storylineNodesVersion } = storeToRefs(store)

const LABEL_WIDTH = 170
const LANE_HEIGHT = 56
const BEAD_SPACING = 48
const BEAD_RADIUS = 7
const PADDING = 24

const storylines = computed(() => store.filteredStorylines)

interface Lane {
  id: string
  title: string
  color: string
  y: number
  beads: Array<{ nodeId: string; title: string; x: number; y: number }>
}

const lanes = computed<Lane[]>(() => {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _version = storylineNodesVersion.value // Reactivity on Map changes
  return storylines.value.map((storyline, laneIndex) => {
    const y = PADDING + laneIndex * LANE_HEIGHT + LANE_HEIGHT / 2
    const nodeIds = storylineNodes.value.get(storyline.id) || []
    return {
      id: storyline.id,
      title: storyline.title,
      color: storyline.color || '#3b82f6',
      y,
      beads: nodeIds.map((nodeId, seq) => ({
        nodeId,
        title: store.getNode(nodeId)?.title || 'Unknown',
        x: LABEL_WIDTH + PADDING + seq * BEAD_SPACING,
        y,
      })),
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
  const maxBeads = Math.max(0, ...lanes.value.map(l => l.beads.length))
  return LABEL_WIDTH + PADDING * 2 + Math.max(1, maxBeads) * BEAD_SPACING
})

const svgHeight = computed(() => PADDING * 2 + lanes.value.length * LANE_HEIGHT)

onMounted(() => {
  store.loadStorylines()
})
</script>

<template>
  <div class="timelines-view">
    <header class="timelines-header">
      <span class="timelines-title">{{ t('storyline.timelines') }}</span>
    </header>

    <div v-if="lanes.length === 0" class="timelines-empty">
      <p>{{ t('storyline.noStorylines') }}</p>
    </div>

    <div v-else class="timelines-scroll">
      <svg :width="svgWidth" :height="svgHeight" class="timelines-svg">
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
            <title>{{ bead.title }}</title>
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
</style>
