<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'
import { Application, Container, Graphics, Text } from 'pixi.js'
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

// Watch for store changes
watch(
  () => [store.nodes.length, store.edges.length],
  () => {
    renderGraph()
  }
)

function renderGraph() {
  renderEdges()
  renderNodes()
}

async function initCanvas() {
  console.log('PixiCanvas: initCanvas called, canvasRef:', canvasRef.value)
  if (!canvasRef.value) {
    console.error('PixiCanvas: canvasRef is null')
    return
  }

  try {
    console.log('PixiCanvas: Creating Application...')
    app = new Application()
    await app.init({
      resizeTo: canvasRef.value,
      background: 0xf4f4f5,
      antialias: true,
    })
    console.log('PixiCanvas: Application initialized')

    canvasRef.value.appendChild(app.canvas)
    console.log('PixiCanvas: Canvas appended')

    // Create containers
    edgesContainer = new Container()
    nodesContainer = new Container()

    app.stage.addChild(edgesContainer)
    app.stage.addChild(nodesContainer)

    // Setup pan/zoom
    setupInteraction()

    // Render initial graph
    console.log('PixiCanvas: Rendering graph, nodes:', store.nodes.length)
    renderGraph()
  } catch (e) {
    console.error('PixiCanvas: Failed to initialize:', e)
  }
}

function setupInteraction() {
  if (!app) return

  let isDragging = false
  let lastPos = { x: 0, y: 0 }

  app.canvas.addEventListener('mousedown', (e: MouseEvent) => {
    isDragging = true
    lastPos = { x: e.clientX, y: e.clientY }
  })

  window.addEventListener('mousemove', (e: MouseEvent) => {
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
  app.canvas.addEventListener('wheel', (e: WheelEvent) => {
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

  nodesContainer.removeChildren()

  for (const node of store.nodes) {
    const nodeContainer = new Container()
    nodeContainer.x = node.canvas_x || 0
    nodeContainer.y = node.canvas_y || 0

    const nodeGraphics = new Graphics()
    const width = node.width || 200
    const height = node.height || 100

    // Draw node rectangle
    nodeGraphics
      .roundRect(0, 0, width, height, 8)
      .fill(0xffffff)
      .stroke({ width: 1, color: 0xe4e4e7 })

    nodeContainer.addChild(nodeGraphics)

    // Add title text
    const titleText = new Text({
      text: node.title || 'Untitled',
      style: {
        fontFamily: 'system-ui, -apple-system, sans-serif',
        fontSize: 14,
        fontWeight: '600',
        fill: 0x18181b,
        wordWrap: true,
        wordWrapWidth: 180,
      },
    })
    titleText.x = 12
    titleText.y = 12
    nodeContainer.addChild(titleText)

    // Add node type indicator
    const typeText = new Text({
      text: node.node_type || 'note',
      style: {
        fontFamily: 'system-ui, -apple-system, sans-serif',
        fontSize: 11,
        fill: 0xa1a1aa,
      },
    })
    typeText.x = 12
    typeText.y = height - 24
    nodeContainer.addChild(typeText)

    nodeContainer.eventMode = 'static'
    nodeContainer.cursor = 'pointer'

    // Make draggable
    let dragging = false
    let dragOffset = { x: 0, y: 0 }

    nodeContainer.on('pointerdown', (e) => {
      dragging = true
      dragOffset = {
        x: e.global.x - nodeContainer.x * viewport.value.zoom - viewport.value.x,
        y: e.global.y - nodeContainer.y * viewport.value.zoom - viewport.value.y,
      }
      store.selectNode(node.id)
      e.stopPropagation()
    })

    nodeContainer.on('globalpointermove', (e) => {
      if (!dragging) return
      nodeContainer.x = (e.global.x - viewport.value.x - dragOffset.x) / viewport.value.zoom
      nodeContainer.y = (e.global.y - viewport.value.y - dragOffset.y) / viewport.value.zoom
      renderEdges()
    })

    nodeContainer.on('pointerup', () => {
      if (dragging) {
        store.updateNodePosition(node.id, nodeContainer.x, nodeContainer.y)
      }
      dragging = false
    })

    nodeContainer.on('pointerupoutside', () => {
      if (dragging) {
        store.updateNodePosition(node.id, nodeContainer.x, nodeContainer.y)
      }
      dragging = false
    })

    nodesContainer.addChild(nodeContainer)
  }
}

function renderEdges() {
  if (!edgesContainer || !nodesContainer) return

  edgesContainer.removeChildren()

  for (const edge of store.edges) {
    const source = store.getNode(edge.source_node_id)
    const target = store.getNode(edge.target_node_id)

    if (!source || !target) continue

    const edgeGraphics = new Graphics()
    const color = getEdgeColor(edge.link_type)

    // Get positions
    let sx = (source.canvas_x || 0) + (source.width || 200) / 2
    let sy = (source.canvas_y || 0) + (source.height || 100) / 2
    let tx = (target.canvas_x || 0) + (target.width || 200) / 2
    let ty = (target.canvas_y || 0) + (target.height || 100) / 2

    const cpOffset = Math.abs(tx - sx) / 2

    edgeGraphics
      .moveTo(sx, sy)
      .bezierCurveTo(sx + cpOffset, sy, tx - cpOffset, ty, tx, ty)
      .stroke({ width: 2, color, alpha: 0.6 })

    edgesContainer.addChild(edgeGraphics)
  }
}

function getEdgeColor(linkType: string): number {
  const colors: Record<string, number> = {
    related: 0xa1a1aa,
    wikilink: 0x8b5cf6,
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
