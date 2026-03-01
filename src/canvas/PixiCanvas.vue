<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { Application, Container, Graphics } from 'pixi.js'
import { useNodesStore } from '../stores/nodes'

const canvasRef = ref<HTMLDivElement>()
const store = useNodesStore()

let app: Application | null = null
let nodesContainer: Container | null = null
let edgesContainer: Container | null = null

// Viewport state
const viewport = ref({
  x: 0,
  y: 0,
  zoom: 1,
})

async function initCanvas() {
  if (!canvasRef.value) return

  app = new Application()
  await app.init({
    resizeTo: canvasRef.value,
    background: 0xf4f4f5,
    antialias: true,
  })

  canvasRef.value.appendChild(app.canvas)

  // Create containers
  edgesContainer = new Container()
  nodesContainer = new Container()

  app.stage.addChild(edgesContainer)
  app.stage.addChild(nodesContainer)

  // Setup pan/zoom
  setupInteraction()

  // Render initial graph
  renderNodes()
  renderEdges()
}

function setupInteraction() {
  if (!app) return

  let isDragging = false
  let lastPos = { x: 0, y: 0 }

  app.canvas.addEventListener('mousedown', (e) => {
    isDragging = true
    lastPos = { x: e.clientX, y: e.clientY }
  })

  window.addEventListener('mousemove', (e) => {
    if (!isDragging || !nodesContainer || !edgesContainer) return

    const dx = e.clientX - lastPos.x
    const dy = e.clientY - lastPos.y

    viewport.value.x += dx
    viewport.value.y += dy

    nodesContainer.x = viewport.value.x
    nodesContainer.y = viewport.value.y
    edgesContainer.x = viewport.value.x
    edgesContainer.y = viewport.value.y

    lastPos = { x: e.clientX, y: e.clientY }
  })

  window.addEventListener('mouseup', () => {
    isDragging = false
  })

  // Zoom with wheel
  app.canvas.addEventListener('wheel', (e) => {
    e.preventDefault()
    const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1
    viewport.value.zoom *= zoomFactor
    viewport.value.zoom = Math.max(0.1, Math.min(3, viewport.value.zoom))

    if (nodesContainer && edgesContainer) {
      nodesContainer.scale.set(viewport.value.zoom)
      edgesContainer.scale.set(viewport.value.zoom)
    }
  })
}

function renderNodes() {
  if (!nodesContainer) return

  // Clear existing
  nodesContainer.removeChildren()

  // Render each node
  for (const node of store.nodes) {
    const nodeGraphics = new Graphics()

    // Draw node rectangle
    nodeGraphics
      .roundRect(0, 0, node.width || 200, node.height || 100, 8)
      .fill(0xffffff)
      .stroke({ width: 1, color: 0xe4e4e7 })

    nodeGraphics.x = node.canvas_x || 0
    nodeGraphics.y = node.canvas_y || 0
    nodeGraphics.eventMode = 'static'
    nodeGraphics.cursor = 'pointer'

    // Make draggable
    let dragging = false
    let dragOffset = { x: 0, y: 0 }

    nodeGraphics.on('pointerdown', (e) => {
      dragging = true
      dragOffset = {
        x: e.global.x - nodeGraphics.x * viewport.value.zoom - viewport.value.x,
        y: e.global.y - nodeGraphics.y * viewport.value.zoom - viewport.value.y,
      }
      e.stopPropagation()
    })

    nodeGraphics.on('globalpointermove', (e) => {
      if (!dragging) return
      nodeGraphics.x = (e.global.x - viewport.value.x - dragOffset.x) / viewport.value.zoom
      nodeGraphics.y = (e.global.y - viewport.value.y - dragOffset.y) / viewport.value.zoom
    })

    nodeGraphics.on('pointerup', () => {
      if (dragging) {
        // Update store
        store.updateNodePosition(node.id, nodeGraphics.x, nodeGraphics.y)
      }
      dragging = false
    })

    nodeGraphics.on('pointerupoutside', () => {
      dragging = false
    })

    nodesContainer.addChild(nodeGraphics)
  }
}

function renderEdges() {
  if (!edgesContainer) return

  edgesContainer.removeChildren()

  for (const edge of store.edges) {
    const source = store.getNode(edge.source_node_id)
    const target = store.getNode(edge.target_node_id)

    if (!source || !target) continue

    const edgeGraphics = new Graphics()

    // Get edge color based on type
    const color = getEdgeColor(edge.link_type)

    // Draw bezier curve
    const sx = (source.canvas_x || 0) + (source.width || 200) / 2
    const sy = (source.canvas_y || 0) + (source.height || 100) / 2
    const tx = (target.canvas_x || 0) + (target.width || 200) / 2
    const ty = (target.canvas_y || 0) + (target.height || 100) / 2

    const cpOffset = Math.abs(tx - sx) / 2

    edgeGraphics
      .moveTo(sx, sy)
      .bezierCurveTo(sx + cpOffset, sy, tx - cpOffset, ty, tx, ty)
      .stroke({ width: 2, color })

    edgesContainer.addChild(edgeGraphics)
  }
}

function getEdgeColor(linkType: string): number {
  const colors: Record<string, number> = {
    related: 0xa1a1aa,
    cites: 0x3b82f6,
    blocks: 0xef4444,
    supports: 0x22c55e,
    contradicts: 0xf97316,
  }
  return colors[linkType] || colors.related
}

onMounted(() => {
  initCanvas()
})

onUnmounted(() => {
  app?.destroy(true)
})
</script>

<template>
  <div ref="canvasRef" class="pixi-canvas"></div>
</template>

<style scoped>
.pixi-canvas {
  width: 100%;
  height: 100%;
}
</style>
