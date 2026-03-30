<script setup lang="ts">
/**
 * Canvas 2D LOD layer - renders node circles on a canvas element
 * Much faster than 5000 DOM elements
 */
import { ref, watch, onMounted, onUnmounted, computed } from 'vue'
import type { Node } from '../../types'
import { NODE_DEFAULTS } from '../constants'

const props = defineProps<{
  nodes: Node[]
  scale: number
  offsetX: number
  offsetY: number
  selectedNodeIds: string[]
  highlightedNodeIds: Set<string>
  draggingNodeId: string | null
  hoveredNodeId: string | null
  getLODRadius: (nodeId: string) => number
}>()

const emit = defineEmits<{
  (e: 'node-pointerdown', event: PointerEvent, nodeId: string): void
  (e: 'node-pointerenter', event: PointerEvent, nodeId: string): void
  (e: 'node-pointerleave'): void
  (e: 'node-dblclick', nodeId: string): void
  (e: 'node-contextmenu', event: MouseEvent, nodeId: string): void
  (e: 'canvas-contextmenu', event: MouseEvent): void
}>()

const canvasRef = ref<HTMLCanvasElement | null>(null)
let ctx: CanvasRenderingContext2D | null = null
let animationId: number | null = null

const selectedSet = computed(() => new Set(props.selectedNodeIds))

// Build spatial lookup for hit testing
const nodePositions = computed(() => {
  const positions: Array<{ id: string; cx: number; cy: number; r: number }> = []
  for (const node of props.nodes) {
    const r = props.getLODRadius(node.id)
    positions.push({
      id: node.id,
      cx: node.canvas_x + (node.width || NODE_DEFAULTS.WIDTH) / 2,
      cy: node.canvas_y + (node.height || NODE_DEFAULTS.HEIGHT) / 2,
      r,
    })
  }
  return positions
})

function render() {
  if (!canvasRef.value || !ctx) return

  const canvas = canvasRef.value
  const dpr = window.devicePixelRatio || 1

  // Clear
  ctx.clearRect(0, 0, canvas.width, canvas.height)

  // Apply transform
  ctx.save()
  ctx.scale(dpr, dpr)
  ctx.translate(props.offsetX, props.offsetY)
  ctx.scale(props.scale, props.scale)

  // Separate nodes into layers for proper z-ordering
  const regularNodes: Node[] = []
  const highlightedNodes: Node[] = []
  const selectedNodes: Node[] = []

  for (const node of props.nodes) {
    const isSelected = selectedSet.value.has(node.id)
    const isHighlighted = props.highlightedNodeIds.has(node.id)
    const isHovered = props.hoveredNodeId === node.id

    if (isSelected || isHovered) {
      selectedNodes.push(node)
    } else if (isHighlighted) {
      highlightedNodes.push(node)
    } else {
      regularNodes.push(node)
    }
  }

  // Draw in layers: regular -> highlighted -> selected (on top)
  const drawNode = (node: Node) => {
    const r = props.getLODRadius(node.id)
    const cx = node.canvas_x + (node.width || NODE_DEFAULTS.WIDTH) / 2
    const cy = node.canvas_y + (node.height || NODE_DEFAULTS.HEIGHT) / 2
    const isSelected = selectedSet.value.has(node.id)
    const isDragging = props.draggingNodeId === node.id
    const isHovered = props.hoveredNodeId === node.id
    const isHighlighted = props.highlightedNodeIds.has(node.id)

    // Highlight ring for neighbors
    if (isHighlighted && !isSelected) {
      ctx!.beginPath()
      ctx!.arc(cx, cy, r + 8, 0, Math.PI * 2)
      ctx!.fillStyle = 'rgba(59, 130, 246, 0.3)'
      ctx!.fill()
      ctx!.beginPath()
      ctx!.arc(cx, cy, r + 5, 0, Math.PI * 2)
      ctx!.fillStyle = 'rgba(59, 130, 246, 0.5)'
      ctx!.fill()
    }

    // Selection or hover ring
    if (isSelected || isHovered) {
      ctx!.beginPath()
      ctx!.arc(cx, cy, r + 6, 0, Math.PI * 2)
      ctx!.fillStyle = isSelected ? 'rgba(59, 130, 246, 0.5)' : 'rgba(59, 130, 246, 0.3)'
      ctx!.fill()
    }

    // Main circle - slightly larger for highlighted/selected
    const radiusMultiplier = isDragging ? 1.15 : (isSelected || isHighlighted) ? 1.08 : 1
    ctx!.beginPath()
    ctx!.arc(cx, cy, r * radiusMultiplier, 0, Math.PI * 2)
    ctx!.fillStyle = node.color_theme || '#3b82f6'
    ctx!.fill()

    // Border
    const borderColor = isSelected ? '#3b82f6' : isHovered ? '#60a5fa' : isHighlighted ? '#60a5fa' : 'rgba(255, 255, 255, 0.3)'
    const borderWidth = (isSelected || isHovered || isHighlighted) ? 3 / props.scale : 2 / props.scale
    ctx!.strokeStyle = borderColor
    ctx!.lineWidth = borderWidth
    ctx!.stroke()
  }

  // Draw layers in order
  for (const node of regularNodes) drawNode(node)
  for (const node of highlightedNodes) drawNode(node)
  for (const node of selectedNodes) drawNode(node)

  ctx.restore()
}

function resize() {
  if (!canvasRef.value) return
  const canvas = canvasRef.value
  const rect = canvas.getBoundingClientRect()
  const dpr = window.devicePixelRatio || 1
  canvas.width = rect.width * dpr
  canvas.height = rect.height * dpr
  render()
}

function hitTest(e: PointerEvent): string | null {
  if (!canvasRef.value) return null
  const rect = canvasRef.value.getBoundingClientRect()
  const x = (e.clientX - rect.left - props.offsetX) / props.scale
  const y = (e.clientY - rect.top - props.offsetY) / props.scale

  // Check nodes in reverse order (top-most first)
  for (let i = nodePositions.value.length - 1; i >= 0; i--) {
    const pos = nodePositions.value[i]
    const dx = x - pos.cx
    const dy = y - pos.cy
    if (dx * dx + dy * dy <= pos.r * pos.r) {
      return pos.id
    }
  }
  return null
}

let localHoveredId: string | null = null

function onPointerDown(e: PointerEvent) {
  const nodeId = hitTest(e)
  if (nodeId) {
    emit('node-pointerdown', e, nodeId)
  }
}

function onPointerMove(e: PointerEvent) {
  const nodeId = hitTest(e)
  if (nodeId !== localHoveredId) {
    if (localHoveredId) {
      emit('node-pointerleave')
    }
    localHoveredId = nodeId
    if (nodeId) {
      emit('node-pointerenter', e, nodeId)
    }
  }
}

function onPointerLeave() {
  if (localHoveredId) {
    emit('node-pointerleave')
    localHoveredId = null
  }
}

function onDblClick(e: MouseEvent) {
  const nodeId = hitTest(e as PointerEvent)
  if (nodeId) {
    emit('node-dblclick', nodeId)
  }
}

function onContextMenu(e: MouseEvent) {
  e.preventDefault()
  const nodeId = hitTest(e as PointerEvent)
  if (nodeId) {
    emit('node-contextmenu', e, nodeId)
  } else {
    emit('canvas-contextmenu', e)
  }
}

// Render on any prop change
watch(
  [
    () => props.nodes,
    () => props.scale,
    () => props.offsetX,
    () => props.offsetY,
    () => props.selectedNodeIds,
    () => props.draggingNodeId,
    () => props.hoveredNodeId,
  ],
  () => {
    if (animationId) cancelAnimationFrame(animationId)
    animationId = requestAnimationFrame(render)
  },
  { deep: false }
)

onMounted(() => {
  if (canvasRef.value) {
    ctx = canvasRef.value.getContext('2d')
    resize()
    window.addEventListener('resize', resize)
  }
})

onUnmounted(() => {
  window.removeEventListener('resize', resize)
  if (animationId) cancelAnimationFrame(animationId)
})
</script>

<template>
  <canvas
    ref="canvasRef"
    class="lod-canvas"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerleave="onPointerLeave"
    @dblclick="onDblClick"
    @contextmenu="onContextMenu"
  />
</template>

<style scoped>
.lod-canvas {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: auto;
  z-index: 10;
}
</style>
