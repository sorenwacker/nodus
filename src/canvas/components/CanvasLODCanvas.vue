<script setup lang="ts">
/**
 * Canvas 2D LOD layer - renders node circles on a canvas element
 * Much faster than 5000 DOM elements
 */
import { ref, watch, onMounted, onUnmounted, computed } from 'vue'
import type { Node } from '../../types'
import { NODE_DEFAULTS } from '../constants'

/** Just what drawing a straight edge needs; avoids importing the edge module. */
export interface LODEdge {
  id: string
  x1: number
  y1: number
  x2: number
  y2: number
  color: string
}

const props = defineProps<{
  nodes: Node[]
  /**
   * Edges to draw beneath the circles.
   *
   * They are painted here rather than left to the SVG layer so that nodes and
   * edges are produced by one pass over one view state. As two layers - a
   * canvas drawn in JavaScript and an SVG moved by a CSS transform - they
   * updated at different moments and visibly came apart while panning and
   * zooming, and no amount of synchronising two mechanisms makes that
   * reliable. It also keeps ~1,000 SVG elements out of the document, which is
   * what WebKitGTK struggles with (PRODUCT_DESIGN.md > Canvas rendering).
   *
   * Geometry and colour only. Which edges are lit is read from
   * highlightedEdgeIds at draw time, so hovering repaints without rebuilding
   * the list (useEdgeVisibility > canvasEdges).
   */
  edges: LODEdge[]
  highlightedEdgeIds: Set<string>
  edgeStrokeWidth: number
  highlightColor: string
  scale: number
  offsetX: number
  offsetY: number
  selectedNodeIds: string[]
  highlightedNodeIds: Set<string>
  draggingNodeId: string | null
  hoveredNodeId: string | null
  getLODRadius: (nodeId: string) => number
  /** Reports how long one draw took, for the performance readout. */
  onRenderTime?: (ms: number) => void
}>()

const emit = defineEmits<{
  (e: 'node-pointerdown', event: PointerEvent, nodeId: string): void
  (e: 'node-pointerenter', event: PointerEvent, nodeId: string): void
  (e: 'node-pointerleave'): void
  (e: 'node-dblclick', nodeId: string): void
  (e: 'node-contextmenu', event: MouseEvent, nodeId: string): void
  (e: 'canvas-contextmenu', event: MouseEvent): void
  (e: 'canvas-dblclick', event: MouseEvent): void
}>()

const canvasRef = ref<HTMLCanvasElement | null>(null)
let ctx: CanvasRenderingContext2D | null = null
let animationId: number | null = null

/** Smallest radius, in screen pixels, that a node may be pressed at. */
const MIN_HIT_RADIUS_PX = 9

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
  const started = performance.now()
  renderFrame()
  props.onRenderTime?.(performance.now() - started)
}

function renderFrame() {
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

  // Edges first: the circles sit on top of them
  if (props.edges.length > 0) {
    const lit = props.highlightedEdgeIds
    const width = props.edgeStrokeWidth
    const anyLit = lit.size > 0
    ctx.lineCap = 'round'
    // Highlighting has to win on more than hue: the highlight colour is a
    // neon cyan and the edges are already teal, so a lit edge read as just
    // another line in the mesh. The contrast comes from the rest receding -
    // and only while something is actually lit, so the ordinary view keeps
    // its normal weight.
    for (const edge of props.edges) {
      const isLit = lit.has(edge.id)
      ctx.globalAlpha = isLit ? 1 : anyLit ? 0.12 : 0.35
      ctx.strokeStyle = isLit ? props.highlightColor : edge.color
      ctx.lineWidth = isLit ? width * 2.2 : width
      ctx.beginPath()
      ctx.moveTo(edge.x1, edge.y1)
      ctx.lineTo(edge.x2, edge.y2)
      ctx.stroke()
    }
    ctx.globalAlpha = 1
  }

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

  // A circle's radius is in canvas units, so zooming out shrinks the target
  // with the drawing: at 16% a radius-8 node is about a pixel and a quarter
  // across, and pressing it means landing inside that - which is why nodes
  // stopped being selectable when zoomed out. The target never falls below a
  // clickable size on screen, whatever the drawing does.
  const minRadius = MIN_HIT_RADIUS_PX / props.scale

  // Check nodes in reverse order (top-most first)
  for (let i = nodePositions.value.length - 1; i >= 0; i--) {
    const pos = nodePositions.value[i]
    const dx = x - pos.cx
    const dy = y - pos.cy
    const r = Math.max(pos.r, minRadius)
    if (dx * dx + dy * dy <= r * r) {
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
  } else {
    emit('canvas-dblclick', e)
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

/**
 * Repaint in the same frame the view changed, not a frame later.
 *
 * Scheduling through requestAnimationFrame put this a frame behind the CSS
 * transform that moves everything else, so the nodes trailed their own edges.
 * Carrying the bitmap on a CSS transform instead and repainting once the view
 * settled fixed the drift but left the canvas - which is only viewport-sized -
 * showing blank where the pan had just revealed new ground.
 *
 * Neither is needed now that the edges are drawn here too: a few hundred
 * circles and a thousand lines cost a couple of milliseconds, so the honest
 * thing is to draw them, in the same frame, every frame. Nothing can lag
 * behind anything else because it is all one pass.
 */
let paintedThisFrame = false

function renderNow() {
  if (paintedThisFrame) return
  paintedThisFrame = true
  render()
  requestAnimationFrame(() => {
    paintedThisFrame = false
  })
}

// The view moved. Post flush, not sync: one pan writes offsetX and then
// offsetY, and one zoom writes both plus scale, as separate reactive updates.
// A sync watcher runs between them and paints a view that is half old - the
// new x against the previous y - and the once-per-frame guard then suppressed
// the corrected paint, so the canvas jittered against every other layer.
// Post runs once, after the whole change has landed, still inside the frame.
watch(
  [() => props.scale, () => props.offsetX, () => props.offsetY],
  renderNow,
  { flush: 'post' }
)

// The content changed: nothing about it is an affine move, so repaint.
watch(
  [
    () => props.nodes,
    () => props.edges,
    () => props.highlightedEdgeIds,
    () => props.selectedNodeIds,
    () => props.draggingNodeId,
    () => props.hoveredNodeId,
    // drawNode reads this for the highlight ring, the radius multiplier and the
    // layer split. It is derived from edges as well as nodes, so it changes
    // when an edge is added while the selection stands still - and without it
    // listed here, no repaint was scheduled and the canvas kept drawing the
    // previous highlight set (PRODUCT_DESIGN.md > Repainting above the LOD threshold)
    () => props.highlightedNodeIds,
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
