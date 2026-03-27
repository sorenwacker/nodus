<script setup lang="ts">
/**
 * GPU-accelerated LOD (Level of Detail) layer
 *
 * Renders node circles via PixiJS WebGL instead of DOM elements.
 * This provides smooth zooming performance for 5000+ nodes.
 *
 * This layer handles its own transform and is placed outside the DOM canvas-content.
 */
import { ref, watch, onMounted, onUnmounted, computed, nextTick } from 'vue'
import { Application, Graphics, Container } from 'pixi.js'
import type { Node } from '../../types'
import { NODE_DEFAULTS } from '../constants'

const props = defineProps<{
  nodes: Node[]
  scale: number
  offsetX: number
  offsetY: number
  selectedNodeIds: string[]
  draggingNodeId: string | null
  getLODRadius: (nodeId: string) => number
}>()

const emit = defineEmits<{
  (e: 'node-pointerdown', event: PointerEvent, nodeId: string): void
  (e: 'node-pointerenter', event: PointerEvent, nodeId: string): void
  (e: 'node-pointerleave'): void
  (e: 'node-dblclick', nodeId: string): void
}>()

const containerRef = ref<HTMLDivElement | null>(null)
let app: Application | null = null
let circleContainer: Container | null = null
const circleGraphics = new Map<string, Graphics>()

// Track hovered node for highlighting
const hoveredNodeId = ref<string | null>(null)

// Selected set for quick lookup
const selectedSet = computed(() => new Set(props.selectedNodeIds))

// Build node map for efficient lookup during updates
const nodeMap = computed(() => new Map(props.nodes.map(n => [n.id, n])))

async function initPixi() {
  if (!containerRef.value) return

  app = new Application()
  await app.init({
    backgroundAlpha: 0,
    resizeTo: containerRef.value,
    antialias: true,
    resolution: window.devicePixelRatio || 1,
    autoDensity: true,
  })

  containerRef.value.appendChild(app.canvas as HTMLCanvasElement)

  circleContainer = new Container()
  circleContainer.eventMode = 'static'
  circleContainer.sortableChildren = true
  app.stage.addChild(circleContainer)

  // Initial render
  updateTransform()
  renderCircles()
}

function renderCircles() {
  if (!circleContainer || !app) return

  const existingIds = new Set(circleGraphics.keys())
  const currentIds = new Set(props.nodes.map(n => n.id))

  // Remove circles for nodes no longer visible
  for (const id of existingIds) {
    if (!currentIds.has(id)) {
      const graphics = circleGraphics.get(id)
      if (graphics) {
        circleContainer.removeChild(graphics)
        graphics.destroy()
        circleGraphics.delete(id)
      }
    }
  }

  // Add or update circles
  for (const node of props.nodes) {
    let graphics = circleGraphics.get(node.id)

    if (!graphics) {
      graphics = new Graphics()
      graphics.eventMode = 'static'
      graphics.cursor = 'grab'

      // Event handlers
      graphics.on('pointerdown', (e: { nativeEvent: PointerEvent }) => {
        emit('node-pointerdown', e.nativeEvent, node.id)
      })
      graphics.on('pointerenter', (e: { nativeEvent: PointerEvent }) => {
        hoveredNodeId.value = node.id
        emit('node-pointerenter', e.nativeEvent, node.id)
      })
      graphics.on('pointerleave', () => {
        hoveredNodeId.value = null
        emit('node-pointerleave')
      })
      graphics.on('dblclick', () => {
        emit('node-dblclick', node.id)
      })

      circleContainer.addChild(graphics)
      circleGraphics.set(node.id, graphics)
    }

    // Update circle appearance
    updateCircle(graphics, node)
  }
}

function updateCircle(graphics: Graphics, node: Node) {
  const radius = props.getLODRadius(node.id)
  const isSelected = selectedSet.value.has(node.id)
  const isHovered = hoveredNodeId.value === node.id
  const isDragging = props.draggingNodeId === node.id

  // Calculate position (center of node)
  const centerX = node.canvas_x + (node.width || NODE_DEFAULTS.WIDTH) / 2
  const centerY = node.canvas_y + (node.height || NODE_DEFAULTS.HEIGHT) / 2

  // Parse color
  const color = node.color_theme || '#3b82f6'
  const colorNum = parseInt(color.replace('#', ''), 16) || 0x3b82f6

  graphics.clear()

  // Selection/hover ring
  if (isSelected) {
    graphics.circle(0, 0, radius + 4)
    graphics.fill({ color: 0x3b82f6, alpha: 0.4 })
  } else if (isHovered) {
    graphics.circle(0, 0, radius + 2)
    graphics.fill({ color: 0xffffff, alpha: 0.3 })
  }

  // Main circle
  graphics.circle(0, 0, radius)
  graphics.fill({ color: colorNum })

  // Border
  graphics.circle(0, 0, radius)
  graphics.stroke({
    color: isSelected ? 0x3b82f6 : 0xffffff,
    width: isSelected ? 3 : 2,
    alpha: isSelected ? 1 : 0.3,
  })

  // Position
  graphics.x = centerX
  graphics.y = centerY

  // Z-index and scale for dragging
  if (isDragging) {
    graphics.zIndex = 1000
    graphics.scale.set(1.1)
  } else {
    graphics.zIndex = isSelected ? 20 : isHovered ? 10 : 0
    graphics.scale.set(1)
  }
}

function updateTransform() {
  if (!circleContainer) return
  circleContainer.x = props.offsetX
  circleContainer.y = props.offsetY
  circleContainer.scale.set(props.scale)
}

// Watch for node changes - batch update
let renderPending = false
watch(
  () => props.nodes,
  () => {
    if (!renderPending) {
      renderPending = true
      nextTick(() => {
        renderCircles()
        renderPending = false
      })
    }
  },
  { deep: false }
)

// Watch for selection changes
watch(
  () => props.selectedNodeIds,
  () => {
    for (const [id, graphics] of circleGraphics) {
      const node = nodeMap.value.get(id)
      if (node) updateCircle(graphics, node)
    }
  }
)

// Watch for dragging changes
watch(
  () => props.draggingNodeId,
  () => {
    for (const [id, graphics] of circleGraphics) {
      const node = nodeMap.value.get(id)
      if (node) updateCircle(graphics, node)
    }
  }
)

// Watch for transform changes - this is the fast path during zoom
watch([() => props.scale, () => props.offsetX, () => props.offsetY], () => {
  updateTransform()
})

onMounted(async () => {
  await initPixi()
})

onUnmounted(() => {
  if (app) {
    app.destroy(true, { children: true })
    app = null
  }
  circleGraphics.clear()
})
</script>

<template>
  <div ref="containerRef" class="lod-layer"></div>
</template>

<style scoped>
.lod-layer {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: auto;
  z-index: 5;
}

.lod-layer :deep(canvas) {
  display: block;
}
</style>
