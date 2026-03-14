<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, nextTick, inject } from 'vue'
import { useNodesStore } from '../stores/nodes'
import { marked } from 'marked'
import { openExternal } from '../lib/tauri'
import {
  routeAllEdges,
  routeEdgesWithBundling,
  assignPorts,
  calculatePortOffset,
  getSide,
  getPortPoint,
  getStandoff,
  getAngledStandoff,
  GridTracker,
  PORT_SPACING,
  SpatialIndex,
  setRoutingSpatialIndex,
  type NodeRect,
  type EdgeStyle,
} from './edgeRouting'
import { useLLM, executeTool, llmQueue, type ToolContext } from './llm'
import { uiStorage, llmStorage } from '../lib/storage'
import { canvasLogger } from '../lib/logger'
import { useMinimap } from './composables/useMinimap'
import { measureNodeContent } from './utils/nodeSizing'
import { useAgentRunner, type AgentContext } from './composables/useAgentRunner'
import { useNeighborhoodMode } from './composables/useNeighborhoodMode'
import { useLasso } from './composables/useLasso'
import { useFrames } from './composables/useFrames'
import { useLayout } from './composables/useLayout'
import { usePdfDrop } from './composables/usePdfDrop'
import { useNodeAgent, type NodeAgentContext } from './composables/useNodeAgent'
import { NODE_DEFAULTS } from './constants'

// Undo injection for position, content, and deletion changes
import type { Node, Edge } from '../types'

const injectedPushUndo = inject<(() => void) | undefined>('pushUndo')
const injectedPushContentUndo = inject<((nodeId: string, oldContent: string | null, oldTitle: string) => void) | undefined>('pushContentUndo')
const injectedPushDeletionUndo = inject<((node: Node, edges: Edge[]) => void) | undefined>('pushDeletionUndo')

const pushUndo = () => {
  if (injectedPushUndo) {
    injectedPushUndo()
  } else {
    console.warn('pushUndo not provided - undo will not work')
  }
}

const pushContentUndo = (nodeId: string, oldContent: string | null, oldTitle: string) => {
  if (injectedPushContentUndo) {
    injectedPushContentUndo(nodeId, oldContent, oldTitle)
  } else {
    console.warn('pushContentUndo not provided - content undo will not work')
  }
}

const pushDeletionUndo = (node: Node, edges: Edge[]) => {
  if (injectedPushDeletionUndo) {
    injectedPushDeletionUndo(node, edges)
  } else {
    console.warn('pushDeletionUndo not provided - deletion undo will not work')
  }
}

// Configure marked
marked.use({
  gfm: true,
  breaks: true,
  async: false,
})

const store = useNodesStore()

// Reactive theme tracking
const isDarkMode = ref(false)

function updateTheme() {
  const theme = document.documentElement.getAttribute('data-theme') || 'light'
  currentTheme.value = theme
  isDarkMode.value = theme === 'dark' || theme === 'pitch-black' || theme === 'cyber'
}

// Track if we've centered the view initially
let hasInitiallyCentered = false

// Canvas transform state - restored from localStorage if available
// MUST be defined before onMounted and watchers that reference it
const VIEW_STORAGE_KEY = 'nodus-canvas-view'

function loadViewState(): { scale: number; offsetX: number; offsetY: number } | null {
  try {
    const stored = localStorage.getItem(VIEW_STORAGE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored)
      if (typeof parsed.scale === 'number' && typeof parsed.offsetX === 'number' && typeof parsed.offsetY === 'number') {
        return parsed
      }
    }
  } catch { /* ignore */ }
  return null
}

const savedView = loadViewState()
const scale = ref(savedView?.scale ?? 1)
const offsetX = ref(savedView?.offsetX ?? 0)
const offsetY = ref(savedView?.offsetY ?? 0)
const isZooming = ref(false)
let zoomTimeout: number | null = null
let viewSaveTimeout: number | null = null

function saveViewState() {
  try {
    localStorage.setItem(VIEW_STORAGE_KEY, JSON.stringify({
      scale: scale.value,
      offsetX: offsetX.value,
      offsetY: offsetY.value,
    }))
  } catch { /* ignore */ }
}

function scheduleSaveViewState() {
  if (viewSaveTimeout) clearTimeout(viewSaveTimeout)
  viewSaveTimeout = window.setTimeout(saveViewState, 500)
}

onMounted(() => {

  updateTheme()
  // Watch for theme changes
  const observer = new MutationObserver(updateTheme)
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme']
  })

  // Track viewport size for node culling
  const updateViewportSize = () => {
    const rect = canvasRef.value?.getBoundingClientRect()
    if (rect) {
      viewportWidth.value = rect.width
      viewportHeight.value = rect.height
    }
  }
  updateViewportSize()
  window.addEventListener('resize', updateViewportSize)

  // Listen for zoom-to-node events from search
  const handleZoomToNode = (e: Event) => {
    const nodeId = (e as CustomEvent).detail?.nodeId
    if (nodeId) zoomToNode(nodeId)
  }
  window.addEventListener('zoom-to-node', handleZoomToNode)

  // Keyboard handler for Delete/Backspace
  const handleKeydown = (e: KeyboardEvent) => {
    // Skip if user is typing in an input
    const target = e.target as HTMLElement
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
      return
    }

    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault()
      // Delete selected nodes
      if (store.selectedNodeIds.length > 0) {
        deleteSelectedNodes()
      }
      // Delete selected edge
      else if (selectedEdge.value) {
        deleteSelectedEdge()
      }
      // Delete selected frame
      else if (store.selectedFrameId) {
        deleteSelectedFrame()
      }
    }

    // L key triggers force layout
    if (e.key === 'l' || e.key === 'L') {
      e.preventDefault()
      store.layoutNodes()
    }

    // N key toggles neighborhood view
    if (e.key === 'n' || e.key === 'N') {
      e.preventDefault()
      toggleNeighborhoodMode(store.selectedNodeIds[0])
    }

    // Shift+R resets all node sizes to default
    if ((e.key === 'R' || e.key === 'r') && e.shiftKey) {
      e.preventDefault()
      resetAllNodeSizes()
    }

    // Shift+E exports graph as YAML
    if ((e.key === 'E' || e.key === 'e') && e.shiftKey) {
      e.preventDefault()
      exportGraphAsYaml()
    }

    // F key fits to content
    if (e.key === 'f' || e.key === 'F') {
      e.preventDefault()
      fitToContent()
    }

    // Cmd+A / Ctrl+A selects all nodes
    if ((e.key === 'a' || e.key === 'A') && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      selectAllNodes()
    }

    // Ctrl+Shift+R refreshes workspace from files
    if ((e.key === 'R' || e.key === 'r') && e.ctrlKey && e.shiftKey) {
      e.preventDefault()
      refreshFromFiles()
    }
  }
  window.addEventListener('keydown', handleKeydown)

  // Setup PDF drop listener
  pdfDrop.setup()

  onUnmounted(() => {
    observer.disconnect()
    window.removeEventListener('resize', updateViewportSize)
    window.removeEventListener('keydown', handleKeydown)
    window.removeEventListener('zoom-to-node', handleZoomToNode)
    pdfDrop.cleanup()
  })

  // Only center if no saved view state
  if (!savedView) {
    centerGrid()
  }

  // Render mermaid diagrams after mount (delayed to ensure DOM is ready)
  setTimeout(() => renderMermaidDiagrams?.(), 500)

  // Periodically check for unrendered mermaid diagrams
  // Less frequent for large graphs to save CPU
  const mermaidCheckInterval = store.filteredNodes.length > 200 ? 5000 : 2000
  const mermaidInterval = setInterval(() => {
    const unrendered = document.querySelectorAll('.mermaid:not(:has(svg))')
    if (unrendered.length > 0) {
      renderMermaidDiagrams?.()
    }
  }, mermaidCheckInterval)

  onUnmounted(() => {
    clearInterval(mermaidInterval)
  })
})

// Center the grid so origin (0,0) is in the middle of the viewport
function centerGrid() {
  const rect = canvasRef.value?.getBoundingClientRect()
  if (rect) {
    offsetX.value = rect.width / 2
    offsetY.value = rect.height / 2
  }
}

// Center view when nodes are first loaded, or center grid when empty
// But only if there's no saved view state
watch(() => store.filteredNodes.length, (newLen, _oldLen) => {
  if (newLen > 0 && !hasInitiallyCentered && !savedView) {
    hasInitiallyCentered = true
    setTimeout(fitToContent, 50)
    // Render mermaid diagrams after initial load (use arrow fn to defer lookup)
    setTimeout(() => renderMermaidDiagrams?.(), 500)
  } else if (newLen === 0 && !savedView) {
    // Empty workspace - center the grid
    hasInitiallyCentered = false
    setTimeout(centerGrid, 50)
  } else if (newLen > 0 && !hasInitiallyCentered) {
    hasInitiallyCentered = true
    // Render mermaid diagrams after initial load (even with saved view)
    setTimeout(() => renderMermaidDiagrams?.(), 500)
  }
}, { immediate: true })

// Re-center when workspace changes - but preserve view if user has panned/zoomed
watch(() => store.currentWorkspaceId, () => {
  // Don't auto-reset view on workspace change - let user control it
  hasInitiallyCentered = store.filteredNodes.length > 0
  // Exit neighborhood mode when workspace changes
  neighborhood.exit()
})

// Viewport size for culling (updated on resize)
const viewportWidth = ref(window.innerWidth)
const viewportHeight = ref(window.innerHeight)

// Only render nodes visible in viewport (with margin for smooth scrolling)
const visibleNodes = computed(() => {
  const s = scale.value
  const ox = offsetX.value
  const oy = offsetY.value
  // Scale margin inversely with zoom to maintain consistent screen-space buffer
  // At zoom 1.0: 500px margin. At zoom 0.2: 2500px margin in canvas coords
  const baseMargin = 500
  const margin = baseMargin / Math.max(s, 0.1)

  // Viewport bounds in canvas coordinates
  const viewLeft = -ox / s - margin
  const viewTop = -oy / s - margin
  const viewRight = (viewportWidth.value - ox) / s + margin
  const viewBottom = (viewportHeight.value - oy) / s + margin

  // Use displayNodes which respects neighborhood mode
  return displayNodes.value.filter(node => {
    const nodeRight = node.canvas_x + (node.width || NODE_DEFAULTS.WIDTH)
    const nodeBottom = node.canvas_y + (node.height || NODE_DEFAULTS.HEIGHT)
    // Check if node intersects viewport
    return nodeRight >= viewLeft &&
           node.canvas_x <= viewRight &&
           nodeBottom >= viewTop &&
           node.canvas_y <= viewBottom
  })
})

// Set of visible node IDs for quick lookup
const visibleNodeIds = computed(() => new Set(visibleNodes.value.map(n => n.id)))

// Graph size thresholds - defined after displayNodes so they use actual displayed count
// (moved below displayNodes definition)

// Canvas element ref (needed early for layout functions)
const canvasRef = ref<HTMLElement | null>(null)

// Screen to canvas coordinate conversion
function screenToCanvas(screenX: number, screenY: number) {
  const rect = canvasRef.value?.getBoundingClientRect()
  if (!rect) return { x: 0, y: 0 }
  return {
    x: (screenX - rect.left - offsetX.value) / scale.value,
    y: (screenY - rect.top - offsetY.value) / scale.value,
  }
}

// Neighborhood mode composable
const neighborhood = useNeighborhoodMode({
  store: {
    getFilteredNodes: () => [...store.filteredNodes],
    getFilteredEdges: () => [...store.filteredEdges],
    getNode: store.getNode,
    getSelectedNodeIds: () => [...store.selectedNodeIds],
  },
  viewState: {
    scale,
    offsetX,
    offsetY,
    canvasRect: () => canvasRef.value?.getBoundingClientRect() || null,
  },
})

// Destructure for convenience
const { neighborhoodMode, focusNodeId, displayNodes, neighborhoodDepth, setDepth } = neighborhood

// Expose functions with original names for compatibility
function toggleNeighborhoodMode(nodeId?: string) {
  neighborhood.toggle(nodeId)
}
function layoutNeighborhood(focusId: string) {
  return neighborhood.layout(focusId)
}
function getVisualNode(nodeId: string) {
  return neighborhood.getVisualNode(nodeId)
}

// Lasso selection composable
const lasso = useLasso({
  store: {
    getFilteredNodes: () => [...store.filteredNodes],
    setSelectedNodeIds: (ids: string[]) => { store.selectedNodeIds = ids },
  },
  screenToCanvas,
})
const { isLassoSelecting, lassoPoints } = lasso
function startLasso(e: MouseEvent) { lasso.start(e) }
function updateLasso(e: MouseEvent) { lasso.update(e) }
function endLasso() { lasso.end() }

// Graph size thresholds - use displayNodes count so neighborhood mode gets proper routing
// In neighborhood mode, always use full routing since we have few nodes
const isLargeGraph = computed(() => !neighborhoodMode.value && (displayNodes.value.length > 200 || store.filteredEdges.length > 500))
const isHugeGraph = computed(() => !neighborhoodMode.value && displayNodes.value.length > 350)
const isMassiveGraph = computed(() => !neighborhoodMode.value && (displayNodes.value.length > 300 || store.filteredEdges.length > 800))

// Semantic zoom collapse - hide content for massive graphs when zoomed out
const isSemanticZoomCollapsed = computed(() => isMassiveGraph.value && scale.value < 0.6)

// Extract first image URL from node content for zoomed-out thumbnail display
const nodeFirstImage = computed(() => {
  const imageMap: Record<string, string | null> = {}
  for (const node of store.filteredNodes) {
    if (!node.markdown_content) {
      imageMap[node.id] = null
      continue
    }
    // Match markdown image: ![alt](url) or HTML img: <img src="url">
    const mdMatch = node.markdown_content.match(/!\[.*?\]\(([^)]+)\)/)
    const htmlMatch = node.markdown_content.match(/<img[^>]+src=["']([^"']+)["']/)
    imageMap[node.id] = mdMatch?.[1] || htmlMatch?.[1] || null
  }
  return imageMap
})

// Show image thumbnail when zoomed out (scale < 0.5) and node has an image
const showImageThumbnail = computed(() => scale.value < 0.5)

// Magnifying lens - shows when zoomed out far
const MAGNIFIER_THRESHOLD = 0.4
const MAGNIFIER_SIZE = 200
const MAGNIFIER_ZOOM = 2.5
const showMagnifier = ref(false)
const isMouseOnCanvas = ref(false)
const magnifierPos = ref({ x: 0, y: 0 })
const magnifierEnabled = ref(uiStorage.getMagnifierEnabled())
const shouldShowMagnifier = computed(() => magnifierEnabled.value && scale.value < MAGNIFIER_THRESHOLD && showMagnifier.value && !isLargeGraph.value)

// Only render nodes visible within magnifier viewport for performance
const magnifierVisibleNodes = computed(() => {
  if (!shouldShowMagnifier.value) return []

  // Calculate the canvas area visible in the magnifier
  const viewRadius = (MAGNIFIER_SIZE / 2) / MAGNIFIER_ZOOM / scale.value
  const centerX = (magnifierPos.value.x - offsetX.value) / scale.value
  const centerY = (magnifierPos.value.y - offsetY.value) / scale.value

  return store.filteredNodes.filter(node => {
    const nodeRight = node.canvas_x + (node.width || NODE_DEFAULTS.WIDTH)
    const nodeBottom = node.canvas_y + (node.height || NODE_DEFAULTS.HEIGHT)
    // Check if node intersects with magnifier circle (use bounding box approximation)
    const closestX = Math.max(node.canvas_x, Math.min(centerX, nodeRight))
    const closestY = Math.max(node.canvas_y, Math.min(centerY, nodeBottom))
    const dx = centerX - closestX
    const dy = centerY - closestY
    return (dx * dx + dy * dy) < (viewRadius * viewRadius * 4) // 2x radius for margin
  })
})

// Edge stroke width - slight scaling to stay visible at low zoom
const edgeStrokeWidth = computed(() => {
  if (scale.value >= 1) return 2
  return Math.min(2 / Math.sqrt(scale.value), 4)
})

// Minimap - using composable
const minimap = useMinimap({
  nodes: computed(() => store.filteredNodes.map(n => ({
    id: n.id,
    canvas_x: n.canvas_x,
    canvas_y: n.canvas_y,
    width: n.width || NODE_DEFAULTS.WIDTH,
    height: n.height || NODE_DEFAULTS.HEIGHT,
    color_theme: n.color_theme,
  }))),
  selectedNodeIds: computed(() => store.selectedNodeIds),
  scale,
  offsetX,
  offsetY,
  getViewportSize: () => {
    const rect = canvasRef.value?.getBoundingClientRect()
    return rect ? { width: rect.width, height: rect.height } : null
  },
})

function onMinimapClick(e: MouseEvent) {
  const target = e.currentTarget as HTMLElement
  const rect = target.getBoundingClientRect()
  const result = minimap.handleClick(e.clientX - rect.left, e.clientY - rect.top)
  if (result) {
    offsetX.value = result.offsetX
    offsetY.value = result.offsetY
  }
}

// Interaction state
const draggingNode = ref<string | null>(null)
const dragStart = ref({ x: 0, y: 0, nodeX: 0, nodeY: 0 })
const multiDragInitial = ref<Map<string, { x: number; y: number }>>(new Map())
const isPanning = ref(false)
const panStart = ref({ x: 0, y: 0, offsetX: 0, offsetY: 0 })
const selectedEdge = ref<string | null>(null)
const hoveredNodeId = ref<string | null>(null)
const hoverMousePos = ref({ x: 0, y: 0 })

// Node agent mode (Simple vs Agent with tools)
const nodeAgentMode = ref<'simple' | 'agent'>('simple')
const showNodeAgentLog = ref(false)
const nodeAgent = useNodeAgent()

// Tooltip for zoomed-out hover - shows node info when scale is low
const showHoverTooltip = computed(() => {
  return hoveredNodeId.value && scale.value < 0.5
})

const hoveredNode = computed(() => {
  if (!hoveredNodeId.value) return null
  return store.getNode(hoveredNodeId.value)
})

// Strip markdown for tooltip preview
const tooltipContent = computed(() => {
  const content = hoveredNode.value?.markdown_content
  if (!content) return ''
  return content
    .replace(/!\[.*?\]\(.*?\)/g, '[image]')  // Replace images with [image]
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // Links -> just text
    .replace(/#{1,6}\s*/g, '')               // Remove headings
    .replace(/[*_]{1,2}([^*_]+)[*_]{1,2}/g, '$1') // Bold/italic -> plain
    .replace(/`{1,3}[^`]*`{1,3}/g, '')       // Remove code blocks
    .replace(/^\s*[-*+]\s+/gm, '- ')         // Normalize lists
    .replace(/\n{2,}/g, '\n')                // Collapse multiple newlines
    .trim()
    .slice(0, 200)
})

// Cached active node IDs for highlight detection (avoids recreating Set on every edge)
const activeNodeIds = computed(() => {
  const ids = new Set<string>()
  if (hoveredNodeId.value) ids.add(hoveredNodeId.value)
  for (const id of store.selectedNodeIds) ids.add(id)
  return ids
})

// Pre-computed set of highlighted edge IDs for O(1) lookup in template
const highlightedEdgeIds = computed(() => {
  const ids = new Set<string>()
  const active = activeNodeIds.value
  if (active.size === 0) return ids
  for (const edge of store.filteredEdges) {
    if (active.has(edge.source_node_id) || active.has(edge.target_node_id)) {
      ids.add(edge.id)
    }
  }
  return ids
})

// Check if an edge is connected to a hovered or selected node
function isEdgeHighlighted(edge: { id?: string; source_node_id: string; target_node_id: string }): boolean {
  // Fast path: use pre-computed set if edge has ID
  if (edge.id) return highlightedEdgeIds.value.has(edge.id)
  // Fallback for edges without ID
  const active = activeNodeIds.value
  if (active.size === 0) return false
  return active.has(edge.source_node_id) || active.has(edge.target_node_id)
}

// Edge creation
const isCreatingEdge = ref(false)
const edgeStartNode = ref<string | null>(null)
const edgePreviewEnd = ref({ x: 0, y: 0 })

// Prevent double-click node creation right after drag
let lastDragEndTime = 0

// Node resizing (supports multiple selected nodes)
const resizingNode = ref<string | null>(null)
const resizeDirection = ref<string>('se') // n, s, e, w, nw, ne, se, sw
const resizeStart = ref({ x: 0, y: 0, width: 0, height: 0, nodeX: 0, nodeY: 0 })
const resizePreview = ref({ width: 0, height: 0, x: 0, y: 0 })
const multiResizeInitial = ref<Map<string, { width: number, height: number, x: number, y: number }>>(new Map())

// Gridlock (snap to grid)
const gridLockEnabled = ref(false)
const gridSize = 20 // Snap to 20px grid

function snapToGrid(value: number): number {
  if (!gridLockEnabled.value) return value
  return Math.round(value / gridSize) * gridSize
}

// Frame operations composable
const frames = useFrames({
  store: {
    frames: store.frames,
    filteredNodes: store.filteredNodes,
    selectedNodeIds: store.selectedNodeIds,
    selectedFrameId: store.selectedFrameId,
    selectFrame: store.selectFrame,
    selectNode: store.selectNode,
    createFrame: store.createFrame,
    deleteFrame: store.deleteFrame,
    updateFramePosition: store.updateFramePosition,
    updateFrameSize: store.updateFrameSize,
    updateFrameTitle: store.updateFrameTitle,
    updateNodePosition: store.updateNodePosition,
  },
  viewState: {
    scale,
    offsetX,
    offsetY,
    canvasRect: () => canvasRef.value?.getBoundingClientRect() || null,
  },
  screenToCanvas,
  snapToGrid,
})
const { editingFrameId, editFrameTitle } = frames
function onFrameMouseDown(e: MouseEvent, frameId: string) { frames.onMouseDown(e, frameId) }
function startFrameResize(e: MouseEvent, frameId: string) { frames.startResize(e, frameId) }
function startEditingFrameTitle(frameId: string) { frames.startEditingTitle(frameId) }
function saveFrameTitleEditing() { frames.saveTitle() }
function cancelFrameTitleEditing() { frames.cancelTitleEditing() }
function createFrameAtCenter() { frames.createAtCenter() }
function deleteSelectedFrame() { frames.deleteSelected() }

// Layout composable
const layout = useLayout({
  store: {
    getNodes: () => [...store.nodes],
    getFilteredNodes: () => [...store.filteredNodes],
    getFilteredEdges: () => [...store.filteredEdges],
    getSelectedNodeIds: () => [...store.selectedNodeIds],
    updateNodePosition: store.updateNodePosition,
    layoutNodes: store.layoutNodes,
  },
  viewState: {
    scale,
    offsetX,
    offsetY,
    canvasRect: () => canvasRef.value?.getBoundingClientRect() || null,
  },
  pushUndo,
})
async function autoLayoutNodes(type: 'grid' | 'horizontal' | 'vertical' | 'force' = 'grid') {
  await layout.autoLayout(type)
}
function fitToContent() { layout.fitToContent() }

// Auto-fit is per-node (stored on node.auto_fit)

function fitNodeToContent(nodeId: string) {
  const node = store.getNode(nodeId)
  if (!node) return

  const cardEl = document.querySelector(`[data-node-id="${nodeId}"]`) as HTMLElement
  if (!cardEl) return

  const result = measureNodeContent(cardEl, node.width || NODE_DEFAULTS.WIDTH)
  if (!result) return

  store.updateNodeSize(nodeId, result.width, result.height)

  // In neighborhood mode, re-layout to adapt to new sizes
  if (neighborhoodMode.value && focusNodeId.value) {
    setTimeout(() => layoutNeighborhood(focusNodeId.value!), 10)
  }
}

// Fit all visible nodes to their content (auto-expand to show all content)
async function fitAllNodesToContent() {
  // Exit any active editing first
  if (editingNodeId.value) {
    saveEditing()
    await nextTick()
  }
  // Wait for DOM to render
  setTimeout(() => {
    for (const node of store.filteredNodes) {
      fitNodeToContent(node.id)
    }
    // Trigger edge re-routing after sizes change
    store.nodeLayoutVersion++
  }, 100)
}

// Reset all nodes to default size (200x120)
async function resetAllNodeSizes() {
  for (const node of store.filteredNodes) {
    await store.updateNodeSize(node.id, 200, 120)
  }
  store.nodeLayoutVersion++
}

// Zoom to node - animate view to center on node and fit it in viewport
function zoomToNode(nodeId: string, requestedScale?: number) {
  // Use visual node position (accounts for neighborhood mode)
  const node = neighborhoodMode.value
    ? neighborhood.getVisualNode(nodeId)
    : store.getNode(nodeId)
  if (!node) return

  const rect = canvasRef.value?.getBoundingClientRect()
  if (!rect) return

  // Calculate node dimensions
  const nodeWidth = node.width || NODE_DEFAULTS.WIDTH
  const nodeHeight = node.height || NODE_DEFAULTS.HEIGHT
  const nodeCenterX = node.canvas_x + nodeWidth / 2
  const nodeCenterY = node.canvas_y + nodeHeight / 2

  // Calculate scale to fit node with padding (80% of viewport)
  const padding = 0.8
  const scaleToFitWidth = (rect.width * padding) / nodeWidth
  const scaleToFitHeight = (rect.height * padding) / nodeHeight
  const fitScale = Math.min(scaleToFitWidth, scaleToFitHeight, 2.0) // Cap at 2x zoom

  // Use requested scale if provided, otherwise calculate based on node size
  const targetScale = requestedScale ?? Math.max(0.5, Math.min(fitScale, 1.5))

  // Calculate target offset to center the node
  const targetOffsetX = rect.width / 2 - nodeCenterX * targetScale
  const targetOffsetY = rect.height / 2 - nodeCenterY * targetScale

  // Animate to the target position
  const startScale = scale.value
  const startOffsetX = offsetX.value
  const startOffsetY = offsetY.value
  const duration = 300
  const startTime = performance.now()

  function easeOutCubic(t: number): number {
    return 1 - Math.pow(1 - t, 3)
  }

  function animate() {
    const elapsed = performance.now() - startTime
    const progress = Math.min(elapsed / duration, 1)
    const eased = easeOutCubic(progress)

    scale.value = startScale + (targetScale - startScale) * eased
    offsetX.value = startOffsetX + (targetOffsetX - startOffsetX) * eased
    offsetY.value = startOffsetY + (targetOffsetY - startOffsetY) * eased

    if (progress < 1) {
      requestAnimationFrame(animate)
    } else {
      // Select the node after zoom completes
      store.selectNode(nodeId, false)
    }
  }

  requestAnimationFrame(animate)
}

// Refresh all nodes from their source files
async function refreshFromFiles() {
  try {
    const updated = await store.refreshWorkspace()
    console.log(`Refreshed ${updated} nodes from files`)
  } catch (e) {
    console.error('Failed to refresh workspace:', e)
  }
}

// Inline editing
const editingNodeId = ref<string | null>(null)
const editContent = ref('')
const editingTitleId = ref<string | null>(null)
const editTitle = ref('')

// Autosave with debounce
let autosaveContentTimer: ReturnType<typeof setTimeout> | null = null
let autosaveTitleTimer: ReturnType<typeof setTimeout> | null = null
const AUTOSAVE_DELAY = 1000 // Save 1 second after typing stops

watch(editContent, (newContent) => {
  if (!editingNodeId.value) return
  if (autosaveContentTimer) clearTimeout(autosaveContentTimer)
  autosaveContentTimer = setTimeout(() => {
    if (editingNodeId.value) {
      store.updateNodeContent(editingNodeId.value, newContent)
    }
  }, AUTOSAVE_DELAY)
})

watch(editTitle, (newTitle) => {
  if (!editingTitleId.value) return
  if (autosaveTitleTimer) clearTimeout(autosaveTitleTimer)
  autosaveTitleTimer = setTimeout(() => {
    if (editingTitleId.value) {
      store.updateNodeTitle(editingTitleId.value, newTitle)
    }
  }, AUTOSAVE_DELAY)
})

// LLM interface - using composable
const llm = useLLM()
const {
  model: ollamaModel,
  contextLength: ollamaContextLength,
  systemPrompt: customSystemPrompt,
  isRunning: agentRunning,
  log: agentLog,
  tasks: agentTasks,
  conversationHistory,
  simpleGenerate: callOllama,
  savePromptToHistory,
  navigateHistory,
  agentTools,
} = llm

const graphPrompt = ref('')
const nodePrompt = ref('')
const isGraphLLMLoading = ref(false)
const isNodeLLMLoading = ref(false)
const showLLMSettings = ref(false)
const lastContextSize = ref(0) // Track context size of last request
let nodeLLMAbortController: AbortController | null = null

function stopNodeLLM() {
  // Stop agent if in agent mode
  if (nodeAgentMode.value === 'agent') {
    nodeAgent.stop()
  }
  if (nodeLLMAbortController) {
    nodeLLMAbortController.abort()
    nodeLLMAbortController = null
  }
  isNodeLLMLoading.value = false
}

// PDF drop composable
const pdfDrop = usePdfDrop({
  store: {
    createNode: store.createNode,
    updateNodeContent: store.updateNodeContent,
    updateNodeTitle: store.updateNodeTitle,
    createEdge: store.createEdge,
  },
  viewState: {
    getViewportCenter: () => {
      const rect = canvasRef.value?.getBoundingClientRect()
      if (!rect) return { x: 0, y: 0 }
      return {
        x: (rect.width / 2 - offsetX.value) / scale.value,
        y: (rect.height / 2 - offsetY.value) / scale.value,
      }
    },
  },
  llm: {
    simpleGenerate: callOllama,
  },
})

function onPromptKeydown(e: KeyboardEvent) {
  if (e.key === 'ArrowUp') {
    e.preventDefault()
    const prev = navigateHistory('up')
    if (prev !== null) graphPrompt.value = prev
  } else if (e.key === 'ArrowDown') {
    e.preventDefault()
    const next = navigateHistory('down')
    if (next !== null) graphPrompt.value = next
  }
}

async function executeAgentTool(name: string, args: any): Promise<string> {
  // Create tool context for the extracted executor
  const toolCtx: ToolContext = {
    store: {
      filteredNodes: store.filteredNodes,
      filteredEdges: store.filteredEdges,
      createNode: store.createNode,
      createEdge: store.createEdge,
      deleteNode: store.deleteNode,
      deleteEdge: store.deleteEdge,
      updateNodePosition: store.updateNodePosition,
      updateNodeContent: store.updateNodeContent,
      updateNodeTitle: store.updateNodeTitle,
    },
    log: (msg: string) => agentLog.value.push(msg),
    screenToCanvas,
    snapToGrid,
    ollamaModel: ollamaModel.value,
    ollamaContextLength: ollamaContextLength.value,
  }

  // Try extracted executor (handles simple tools)
  const result = await executeTool(name, args, toolCtx)
  if (!result.startsWith('__UNHANDLED__:')) {
    return result
  }

  // Handle LLM-dependent tools inline
  switch (name) {
    case 'for_each_node': {
      let nodes = [...store.filteredNodes]
      const filter = args.filter || 'all'
      if (filter === 'empty') {
        nodes = nodes.filter(n => !n.markdown_content?.trim())
      } else if (filter === 'has_content') {
        nodes = nodes.filter(n => n.markdown_content?.trim())
      } else if (filter !== 'all') {
        const term = filter.toLowerCase()
        nodes = nodes.filter(n => n.title.toLowerCase().includes(term) || n.markdown_content?.toLowerCase().includes(term))
      }
      if (nodes.length === 0) return `No nodes match filter "${filter}"`
      agentLog.value.push(`> Iterating ${nodes.length} nodes`)

      const evalExpr = (expr: string, n: number): string => {
        try {
          const safe = expr.replace(/\bn\b/g, String(n)).replace(/\^/g, '**')
          if (!/^[\d\s+\-*/().]+$/.test(safe)) return expr
          return String(Math.round(Function(`"use strict"; return (${safe})`)() * 1000) / 1000)
        } catch { return expr }
      }

      const results: string[] = []
      for (const node of nodes) {
        const num = parseInt(node.title.match(/\d+/)?.[0] || '0')
        let query = (args.template || '').replace(/\{title\}/g, node.title).replace(/\{([^}]+)\}/g, (_: string, expr: string) => evalExpr(expr, num))

        if (args.action === 'set') {
          pushContentUndo(node.id, node.markdown_content, node.title)
          await store.updateNodeContent(node.id, query)
          results.push(`${node.title}: set`)
        } else if (args.action === 'append') {
          pushContentUndo(node.id, node.markdown_content, node.title)
          await store.updateNodeContent(node.id, (node.markdown_content || '') + '\n\n' + query)
          results.push(`${node.title}: appended`)
        } else if (args.action === 'llm') {
          // Skip empty nodes
          if (!node.markdown_content?.trim()) {
            results.push(`${node.title}: skipped (empty)`)
            continue
          }
          // Save undo state before modifying
          pushContentUndo(node.id, node.markdown_content, node.title)
          try {
            const prompt = `${query}\n\nContent to process:\n${node.markdown_content}`
            const system = 'You are a text processor. Apply the instruction to the content. Output ONLY the processed text, nothing else.'
            const result = await callOllama(prompt, system)
            if (result?.trim()) {
              await store.updateNodeContent(node.id, result.trim())
              results.push(`${node.title}: processed`)
            }
          } catch (e) { results.push(`${node.title}: llm failed - ${e}`) }
        }
      }
      return `Processed ${nodes.length} nodes`
    }

    case 'smart_move': {
      const nodes = store.filteredNodes
      if (nodes.length === 0) return 'No nodes to move'
      const instruction = args.instruction || ''
      agentLog.value.push(`> Smart move: ${nodes.length} nodes`)

      let categories: string[] = []
      try {
        const prompt = `Extract category names from: "${instruction}"\nList ONLY categories separated by comma:`
        const response = await llmQueue.generate(prompt)
        categories = (response || '').toLowerCase().split(/[,\n]+/).map((c: string) => c.trim()).filter((c: string) => c.length > 1)
      } catch { /* ignore LLM errors, use fallback categories */ }
      if (categories.length < 2) categories = ['left', 'right']

      const groups: Map<string, typeof nodes> = new Map()
      for (const node of nodes) {
        try {
          const prompt = `Classify "${node.title}" into ONE of: ${categories.join(', ')}\nAnswer with ONLY the category:`
          const response = await llmQueue.generate(prompt)
          const group = (response || 'other').toLowerCase().trim().split(/\s+/)[0]
          if (!groups.has(group)) groups.set(group, [])
          groups.get(group)!.push(node)
        } catch { /* ignore classification errors */ }
      }

      let moved = 0
      const spacing = 250
      let groupX = 100
      for (const [, groupNodes] of groups) {
        for (let i = 0; i < groupNodes.length; i++) {
          await store.updateNodePosition(groupNodes[i].id, groupX, 100 + i * 180)
          moved++
        }
        groupX += spacing
      }
      return `Moved ${moved} nodes into ${groups.size} groups`
    }

    case 'smart_connect': {
      const nodes = store.filteredNodes
      if (nodes.length < 2) return 'Need at least 2 nodes'
      const groupsArg = args.groups || ''
      agentLog.value.push(`> Smart connect: ${nodes.length} nodes`)

      const nodeGroups: Map<string, string> = new Map()
      for (const node of nodes) {
        try {
          const prompt = `Classify "${node.title}" into ONE of: ${groupsArg}\nAnswer with ONLY the group name:`
          const response = await llmQueue.generate(prompt)
          nodeGroups.set(node.id, (response || 'other').toLowerCase().trim().split(/\s+/)[0])
        } catch { /* ignore classification errors */ }
      }

      let edgeCount = 0
      const groupedNodes = new Map<string, string[]>()
      for (const [id, group] of nodeGroups) {
        if (!groupedNodes.has(group)) groupedNodes.set(group, [])
        groupedNodes.get(group)!.push(id)
      }

      for (const [, ids] of groupedNodes) {
        for (let i = 0; i < ids.length - 1; i++) {
          await store.createEdge({ source_node_id: ids[i], target_node_id: ids[i + 1] })
          edgeCount++
        }
      }
      return `Created ${edgeCount} edges in ${groupedNodes.size} groups`
    }

    case 'smart_color': {
      const nodes = store.filteredNodes
      if (nodes.length === 0) return 'No nodes to color'
      const instruction = args.instruction || ''
      agentLog.value.push(`> Smart color: ${nodes.length} nodes`)

      // Extract color mappings from instruction using LLM
      let colorMappings: Array<{ category: string; color: string }> = []
      try {
        const prompt = `Extract category-to-color mappings from: "${instruction}"
Output as JSON array: [{"category":"name","color":"#hex"}]
Available colors: #ef4444 (red), #f97316 (orange), #eab308 (yellow), #22c55e (green), #3b82f6 (blue), #8b5cf6 (purple), #ec4899 (pink), #6b7280 (gray)
Example: "departments red, people blue" -> [{"category":"departments","color":"#ef4444"},{"category":"people","color":"#3b82f6"}]
Output ONLY the JSON array:`
        const response = await llmQueue.generate(prompt)
        const match = (response || '').match(/\[[\s\S]*\]/)
        if (match) colorMappings = JSON.parse(match[0])
      } catch { /* ignore LLM errors */ }

      if (colorMappings.length === 0) return 'Could not parse color instruction'

      let colored = 0
      for (const node of nodes) {
        // Check each mapping - match against title and content
        const nodeText = `${node.title} ${node.markdown_content || ''}`.toLowerCase()
        for (const { category, color } of colorMappings) {
          if (nodeText.includes(category.toLowerCase()) ||
              nodeText.includes(`#${category.toLowerCase()}`)) {
            await store.updateNodeColor(node.id, color)
            colored++
            break
          }
        }
      }
      return `Colored ${colored} nodes`
    }

    case 'color_matching': {
      // Simple pattern-based coloring (grep style)
      const pattern = (args.pattern || '').toLowerCase()
      const color = args.color || '#ef4444'
      if (!pattern) return 'Pattern required'

      const nodes = store.filteredNodes
      let colored = 0
      const matchedTitles: string[] = []
      for (const node of nodes) {
        // Search in title, content, and tags
        const nodeText = `${node.title} ${node.markdown_content || ''} ${node.tags || ''}`.toLowerCase()
        if (nodeText.includes(pattern)) {
          await store.updateNodeColor(node.id, color)
          colored++
          matchedTitles.push(node.title)
        }
      }
      const preview = matchedTitles.slice(0, 5).join(', ')
      return `Colored ${colored}/${nodes.length} nodes matching "${pattern}": ${preview}${colored > 5 ? '...' : ''}`
    }

    case 'web_search': {
      const query = args.query || ''
      try {
        const ddgUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1`
        const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(ddgUrl)}`
        const resp = await fetch(proxyUrl)
        const data = await resp.json()
        const results: string[] = []
        if (data.Abstract) results.push(data.Abstract)
        if (data.RelatedTopics) {
          for (const topic of data.RelatedTopics.slice(0, 5)) {
            if (topic.Text) results.push(topic.Text)
          }
        }
        return results.length ? `Search "${query}":\n${results.join('\n\n')}` : `No results for "${query}"`
      } catch {
        return 'Search unavailable'
      }
    }

    default:
      return `Unknown tool: ${name}`
  }
}

function clearConversation() {
  conversationHistory.value = []
}

// Agent runner composable - handles the main agent loop
const agentContext: AgentContext = {
  filteredNodes: () => {
    // Use selected nodes if any, otherwise all filtered nodes
    const hasSelection = store.selectedNodeIds.length > 0
    return hasSelection
      ? store.filteredNodes.filter(n => store.selectedNodeIds.includes(n.id))
      : store.filteredNodes
  },
  cleanupOrphanEdges: () => store.cleanupOrphanEdges(),
  model: ollamaModel,
  contextLength: ollamaContextLength,
  isRunning: agentRunning,
  log: agentLog,
  tasks: agentTasks,
  conversationHistory,
  agentTools,
  executeAgentTool,
}

const agentRunner = useAgentRunner(agentContext)

function stopAgent() {
  agentRunner.stop()
}

async function sendGraphPrompt() {
  if (!graphPrompt.value.trim() || isGraphLLMLoading.value) return

  const prompt = graphPrompt.value.trim()
  savePromptToHistory(prompt)

  isGraphLLMLoading.value = true
  try {
    await agentRunner.run(prompt)
    graphPrompt.value = ''
  } catch (e) {
    alert(e instanceof Error ? e.message : 'Unknown error')
  } finally {
    isGraphLLMLoading.value = false
  }
}

async function sendNodePrompt() {
  // Work with editing node or selected node
  const nodeId = editingNodeId.value || store.selectedNodeIds[0]
  if (!nodePrompt.value.trim() || isNodeLLMLoading.value || !nodeId) return

  const node = store.getNode(nodeId)
  if (!node) return

  const isEditing = editingNodeId.value === nodeId
  // Get current content from editing buffer or store
  const currentContent = isEditing ? editContent.value : (node.markdown_content || '')

  // Save undo state before AI modifies content (use current content, not stored)
  pushContentUndo(nodeId, currentContent, node.title)

  isNodeLLMLoading.value = true
  const prompt = nodePrompt.value
  nodePrompt.value = ''

  try {
    // Use agent mode if enabled
    if (nodeAgentMode.value === 'agent') {
      // Get connected nodes for agent context
      const connectedNodes: Array<{ title: string; content: string }> = []
      for (const edge of store.filteredEdges) {
        let neighborId: string | null = null
        if (edge.source_node_id === nodeId) neighborId = edge.target_node_id
        else if (edge.target_node_id === nodeId) neighborId = edge.source_node_id
        if (neighborId) {
          const n = store.getNode(neighborId)
          if (n) connectedNodes.push({ title: n.title || 'Untitled', content: n.markdown_content || '' })
        }
      }

      const ctx: NodeAgentContext = {
        nodeId,
        nodeTitle: node.title || 'Untitled',
        nodeContent: currentContent,
        connectedNodes,
        updateContent: async (content: string) => {
          if (isEditing) {
            editContent.value = content
          } else {
            await store.updateNodeContent(nodeId, content)
          }
        },
        updateTitle: async (title: string) => {
          await store.updateNodeTitle(nodeId, title)
        },
      }

      showNodeAgentLog.value = true
      await nodeAgent.run(prompt, ctx)
      setTimeout(renderMermaidDiagrams, 100)

      // Auto-fit after agent updates
      if (node.auto_fit) {
        setTimeout(() => {
          renderMermaidDiagrams()
          setTimeout(() => fitNodeToContent(nodeId), 100)
        }, 50)
      }
      return
    }

    // Simple mode: direct LLM call
    // Traverse full chain of connected nodes (BFS)
    const visited = new Set<string>([nodeId])
    const queue = [nodeId]
    const chainNodes: { id: string; title: string; content: string }[] = []

    console.log(`Starting BFS from node ${nodeId}, total edges: ${store.filteredEdges.length}`)

    while (queue.length > 0) {
      const currentId = queue.shift()!
      for (const edge of store.filteredEdges) {
        let neighborId: string | null = null
        if (edge.source_node_id === currentId && !visited.has(edge.target_node_id)) {
          neighborId = edge.target_node_id
        } else if (edge.target_node_id === currentId && !visited.has(edge.source_node_id)) {
          neighborId = edge.source_node_id
        }
        if (neighborId) {
          visited.add(neighborId)
          queue.push(neighborId)
          const n = store.getNode(neighborId)
          if (n) {
            chainNodes.push({
              id: neighborId,
              title: n.title || 'Untitled',
              content: n.markdown_content || '',
            })
            console.log(`Found connected node: ${n.title}, content length: ${(n.markdown_content || '').length}`)
          }
        }
      }
    }

    console.log(`BFS complete: found ${chainNodes.length} connected nodes`)

    // Build context with content from chain (respecting limit)
    const contextLimit = llmStorage.getChainContextLimit()
    console.log(`Chain context limit: ${contextLimit}`)
    let chainContext = ''
    if (chainNodes.length > 0 && contextLimit > 0) {
      let totalChars = 0
      const includedNodes: string[] = []
      for (const n of chainNodes) {
        if (totalChars + n.content.length > contextLimit) {
          // Truncate this node's content to fit
          const remaining = contextLimit - totalChars
          if (remaining > 100) {
            includedNodes.push(`--- ${n.title} ---\n${n.content.slice(0, remaining)}...(truncated)`)
          }
          break
        }
        includedNodes.push(`--- ${n.title} ---\n${n.content}`)
        totalChars += n.content.length
      }
      if (includedNodes.length > 0) {
        chainContext = `\nCONTEXT FROM ${includedNodes.length}/${chainNodes.length} CONNECTED NODES:\n` +
          includedNodes.join('\n\n') + '\n'
      }
    }

    const nodeSystemPrompt = `Rewrite the note based on the user's request. Output content directly.

NO preamble ("Here is", "Sure", etc). NO code fences unless content IS code.
Format: Obsidian markdown with [[wikilinks]], #tags, **bold**, lists.
${chainContext}
CURRENT NODE:
${currentContent || '(empty)'}`

    // Track context size
    lastContextSize.value = nodeSystemPrompt.length + prompt.length
    console.log(`LLM request: ${(lastContextSize.value / 1000).toFixed(1)}k chars, ${chainNodes.length} connected nodes`)

    const response = await callOllama(prompt, nodeSystemPrompt)

    if (isEditing) {
      // Update the editing buffer
      editContent.value = response
    } else {
      // Directly update the node content in store
      await store.updateNodeContent(nodeId, response)
      setTimeout(renderMermaidDiagrams, 100)
    }

    // Auto-fit after LLM updates content (if enabled for this node)
    if (node.auto_fit) {
      setTimeout(() => {
        renderMermaidDiagrams()
        setTimeout(() => fitNodeToContent(nodeId), 100)
      }, 50)
    }
  } catch (e: any) {
    alert(e.message)
  } finally {
    isNodeLLMLoading.value = false
  }
}

// Collapsed height constant for semantic zoom
const COLLAPSED_NODE_HEIGHT = 48

// Get node height - use stored height or estimate from content
// When semantic zoom is active, returns collapsed height instead
function getNodeHeight(node: { height?: number; markdown_content: string | null }, respectCollapse = true): number {
  // When semantic zoom collapse is active, all nodes render at fixed height
  if (respectCollapse && isSemanticZoomCollapsed.value) {
    return COLLAPSED_NODE_HEIGHT
  }
  // Check for explicitly set height (not undefined, not null, and greater than 0)
  if (node.height !== undefined && node.height !== null && node.height > 0) {
    return node.height
  }
  // Fallback: estimate from content with generous padding for routing
  const content = node.markdown_content || ''
  const lineCount = content.split('\n').length
  const charCount = content.length
  // More generous estimate: ~24px per line + header (40px) + padding (40px)
  // Allow taller nodes to avoid routing through them
  const contentHeight = lineCount * 24 + Math.floor(charCount / 35) * 20
  return Math.max(120, Math.min(600, contentHeight + 80))
}

const edgeLines = computed(() => {
  // Force dependency on node positions, edge properties, and layout version
  // nodeLayoutVersion is incremented when nodes move, edges change, or layout is recalculated
  const _layoutVersion = store.nodeLayoutVersion
  const _nodeTrigger = store.nodes.reduce((sum, n) => sum + n.canvas_x + n.canvas_y + (n.width || 0) + (n.height || 0), 0)
  const _edgeTrigger = store.filteredEdges.reduce((sum, e) => sum + (e.link_type?.length || 0), 0)
  const _edgeCount = store.edges.length // Track edge additions/removals
  void _layoutVersion
  void _nodeTrigger
  void _edgeTrigger
  void _edgeCount

  let edges = store.filteredEdges

  // Deduplicate only exact duplicate edges (same source AND target AND id)
  // Keep bidirectional edges (A→B and B→A are different edges)
  const seenEdgeIds = new Set<string>()
  edges = edges.filter(e => {
    if (seenEdgeIds.has(e.id)) return false
    seenEdgeIds.add(e.id)
    return true
  })

  // Filter edges for neighborhood mode - only show edges connected to focus node
  if (neighborhoodMode.value && focusNodeId.value) {
    const focusId = focusNodeId.value
    edges = edges.filter(e => e.source_node_id === focusId || e.target_node_id === focusId)
  }

  // MASSIVE GRAPH OPTIMIZATION: Skip all expensive routing, use simple center-to-center lines
  if (isMassiveGraph.value) {
    // Build simple node lookup
    const nodeMap = new Map(displayNodes.value.map(n => [n.id, n]))

    return edges.map(edge => {
      const source = nodeMap.get(edge.source_node_id)
      const target = nodeMap.get(edge.target_node_id)
      if (!source || !target) return null

      const sw = source.width || NODE_DEFAULTS.WIDTH
      const sh = source.height || NODE_DEFAULTS.HEIGHT
      const tw = target.width || NODE_DEFAULTS.WIDTH
      const th = target.height || NODE_DEFAULTS.HEIGHT

      // Simple center-to-center coordinates
      const x1 = source.canvas_x + sw / 2
      const y1 = source.canvas_y + sh / 2
      const x2 = target.canvas_x + tw / 2
      const y2 = target.canvas_y + th / 2

      // Simple straight line
      const path = `M${x1},${y1} L${x2},${y2}`

      return {
        id: edge.id,
        source_node_id: edge.source_node_id,
        target_node_id: edge.target_node_id,
        x1, y1, x2, y2,
        path,
        style: 'straight' as const,
        strokeWidth: 1,
        bundleSize: 1,
        trunkPath: undefined,
        trunkStrokeWidth: 3,
        isTrunkOwner: false,
        hitX1: x1, hitY1: y1, hitX2: x2, hitY2: y2,
        link_type: edge.link_type,
        label: edge.label,
        isBidirectional: false,
        isShortEdge: Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2) < 50,
        debugInfo: undefined,
      }
    }).filter(Boolean) as any[]
  }

  // NOTE: Don't filter by visibleNodeIds here - that would make routing
  // recalculate on every pan/zoom! Visibility filtering happens at render time.

  // Build node map for efficient lookup
  // IMPORTANT: Use actual heights for routing obstacle detection
  // Use displayNodes so hidden nodes (in neighborhood mode) aren't included
  const nodeMap = new Map<string, NodeRect>()
  for (const node of displayNodes.value) {
    nodeMap.set(node.id, {
      id: node.id,
      canvas_x: node.canvas_x,
      canvas_y: node.canvas_y,
      width: node.width || NODE_DEFAULTS.WIDTH,
      height: getNodeHeight(node, false),  // false = use real height for routing
    })
  }

  // Filter edges to only those with valid source and target nodes
  edges = edges.filter(e => nodeMap.has(e.source_node_id) && nodeMap.has(e.target_node_id))

  // Deduplicate edges by source-target pair (keep first occurrence)
  // Also handles bidirectional duplicates (A->B and B->A count as same pair)
  const seenPairs = new Set<string>()
  edges = edges.filter(e => {
    const ids = [e.source_node_id, e.target_node_id].sort()
    const key = `${ids[0]}:${ids[1]}`
    if (seenPairs.has(key)) return false
    seenPairs.add(key)
    return true
  })

  // Get edge style
  const style = globalEdgeStyle.value

  // Convert edges to EdgeDef format for routing analysis
  const edgeDefs = edges.map(e => ({
    id: e.id,
    source_node_id: e.source_node_id,
    target_node_id: e.target_node_id,
  }))
  // IMPORTANT: Use actual heights for routing, NOT collapsed heights
  // Otherwise edges route through nodes when zoomed out
  // Use displayNodes for routing so hidden nodes (in neighborhood mode) aren't obstacles
  const nodeRects = displayNodes.value.map(n => ({
    id: n.id,
    canvas_x: n.canvas_x,
    canvas_y: n.canvas_y,
    width: n.width || NODE_DEFAULTS.WIDTH,
    height: getNodeHeight(n, false),  // false = ignore collapse, use real height
  }))

  // Compute port assignments for ALL edges (for proper port spreading)
  // Remove internal deduplication since we already deduplicate above
  const edgeInfos: Array<{
    edge: { id: string; source_node_id: string; target_node_id: string }
    source: NodeRect
    target: NodeRect
    sourceSide: 'left' | 'right' | 'top' | 'bottom'
    targetSide: 'left' | 'right' | 'top' | 'bottom'
  }> = []

  for (const edge of edgeDefs) {
    const source = nodeMap.get(edge.source_node_id)!
    const target = nodeMap.get(edge.target_node_id)!
    const targetCx = target.canvas_x + (target.width || NODE_DEFAULTS.WIDTH) / 2
    const targetCy = target.canvas_y + (target.height || NODE_DEFAULTS.HEIGHT) / 2
    const sourceCx = source.canvas_x + (source.width || NODE_DEFAULTS.WIDTH) / 2
    const sourceCy = source.canvas_y + (source.height || NODE_DEFAULTS.HEIGHT) / 2

    const sourceSide = getSide(source, targetCx, targetCy)
    const targetSide = getSide(target, sourceCx, sourceCy)

    edgeInfos.push({ edge, source, target, sourceSide, targetSide })
  }

  const { sourceAssignments, targetAssignments } = assignPorts(edgeInfos)

  // Use batch routing for both diagonal and orthogonal styles
  // The routing modules handle grid tracking, obstacle avoidance, and path generation
  const effectiveStyle: EdgeStyle = style === 'curved' ? 'orthogonal' : style
  let routedEdges: Map<string, { svgPath: string; strokeWidth?: number; bundleSize?: number; path?: Array<{x: number; y: number}>; debugInfo?: { srcOffset: number; tgtOffset: number; srcSide: string; tgtSide: string } }> | null = null

  // Build spatial index for fast obstacle detection (O(log n) instead of O(n))
  const spatialIndex = new SpatialIndex()
  spatialIndex.build(nodeMap)
  setRoutingSpatialIndex(spatialIndex)

  try {
    if (edgeBundling.value) {
      routedEdges = routeEdgesWithBundling(edgeDefs, nodeRects, nodeMap, effectiveStyle)
    } else {
      routedEdges = routeAllEdges(edgeDefs, nodeRects, nodeMap, effectiveStyle)
    }
  } finally {
    // Clear spatial index after routing
    setRoutingSpatialIndex(null)
  }

  // Grid tracker for curved edges (which still need manual routing)
  const gridTracker = new GridTracker(PORT_SPACING)

  // Sort edges to minimize crossings
  // Edges are sorted by their midpoint position so parallel edges don't cross
  // Use nodeMap for O(1) lookups instead of store.getNode()
  const sortedEdges = [...edges].sort((a, b) => {
    const sourceA = nodeMap.get(a.source_node_id)
    const targetA = nodeMap.get(a.target_node_id)
    const sourceB = nodeMap.get(b.source_node_id)
    const targetB = nodeMap.get(b.target_node_id)
    if (!sourceA || !targetA || !sourceB || !targetB) return 0

    const midAx = (sourceA.canvas_x + targetA.canvas_x) / 2
    const midAy = (sourceA.canvas_y + targetA.canvas_y) / 2
    const midBx = (sourceB.canvas_x + targetB.canvas_x) / 2
    const midBy = (sourceB.canvas_y + targetB.canvas_y) / 2

    // Sort by Y first (top to bottom), then by X (left to right)
    if (Math.abs(midAy - midBy) > 50) return midAy - midBy
    return midAx - midBx
  })

  return sortedEdges.map(edge => {
    const source = nodeMap.get(edge.source_node_id)
    const target = nodeMap.get(edge.target_node_id)
    if (!source || !target) return null

    // Use pre-computed dimensions from nodeMap
    const sw = source.width
    const sh = source.height
    const tw = target.width
    const th = target.height

    // Center points
    const sourceCx = source.canvas_x + sw / 2
    const sourceCy = source.canvas_y + sh / 2
    const targetCx = target.canvas_x + tw / 2
    const targetCy = target.canvas_y + th / 2

    // Get port assignments for edge spreading
    const srcAssign = sourceAssignments.get(edge.id)
    const tgtAssign = targetAssignments.get(edge.id)
    const srcOffset = srcAssign ? calculatePortOffset(srcAssign.index, srcAssign.total) : 0
    const tgtOffset = tgtAssign ? calculatePortOffset(tgtAssign.index, tgtAssign.total) : 0

    // Determine which side each edge exits/enters
    const sourceRect = nodeMap.get(edge.source_node_id)
    const targetRect = nodeMap.get(edge.target_node_id)
    const sourceSide = sourceRect ? getSide(sourceRect, targetCx, targetCy) : 'right'
    const targetSide = targetRect ? getSide(targetRect, sourceCx, sourceCy) : 'left'

    // Get fixed port positions at center of each side (with offset for spreading)
    const startPort = sourceRect
      ? getPortPoint(sourceRect, sourceSide, srcOffset)
      : { x: sourceCx, y: sourceCy }
    const endPort = targetRect
      ? getPortPoint(targetRect, targetSide, tgtOffset)
      : { x: targetCx, y: targetCy }

    // Get standoff points with angled entry for natural flow
    const STANDOFF_DIST = 120
    const ANGLE_OFFSET = 12 // Perpendicular offset for angled entry
    const rawStartStandoff = getStandoff(startPort, sourceSide, STANDOFF_DIST)
    const rawEndStandoff = getStandoff(endPort, targetSide, STANDOFF_DIST)

    // Apply angled offset based on edge direction (avoid 0-degree entries)
    const startStandoff = getAngledStandoff(startPort, rawStartStandoff, sourceSide, rawEndStandoff, ANGLE_OFFSET)
    const endStandoff = getAngledStandoff(endPort, rawEndStandoff, targetSide, rawStartStandoff, ANGLE_OFFSET)

    // Check if this edge is bidirectional (reverse edge exists)
    // Use store.filteredEdges, not the deduplicated edges array
    const isBidirectional = store.filteredEdges.some(
      e => e.source_node_id === edge.target_node_id && e.target_node_id === edge.source_node_id
    )

    // Arrow offset for non-bidirectional edges
    const arrowOffset = isBidirectional ? 0 : 6

    // Adjust end port for arrow head
    let endEdge = { ...endPort }
    if (arrowOffset > 0) {
      // Pull back along the standoff direction
      if (targetSide === 'left') endEdge.x += arrowOffset
      else if (targetSide === 'right') endEdge.x -= arrowOffset
      else if (targetSide === 'top') endEdge.y += arrowOffset
      else if (targetSide === 'bottom') endEdge.y -= arrowOffset
    }

    // For hit detection, use the original port positions
    const x1 = startPort.x
    const y1 = startPort.y
    const x2 = endPort.x
    const y2 = endPort.y

    // Check if edge is too short for arrow (distance < 50px)
    const edgeLength = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2)
    const isShortEdge = edgeLength < 50

    // Get edge style - respect user choice
    const edgeStyle = edgeStyleMap.value[edge.id] || style

    // Generate path based on style
    // Use pre-routed paths for diagonal/orthogonal, manual routing only for curved
    let path = ''
    const routed = routedEdges?.get(edge.id)

    // For huge graphs (400+ nodes), use simple straight lines for performance
    if (isHugeGraph.value) {
      path = `M${startPort.x},${startPort.y} L${endEdge.x},${endEdge.y}`
    } else if (edgeStyle === 'curved') {
      // Curved: port -> standoff -> bezier curve -> standoff -> port
      // Use grid tracker to offset control point and prevent overlapping curves
      const midX = (startStandoff.x + endStandoff.x) / 2
      const midY = (startStandoff.y + endStandoff.y) / 2
      const dist = Math.sqrt((endStandoff.x - startStandoff.x) ** 2 + (endStandoff.y - startStandoff.y) ** 2)
      const baseCurveAmt = Math.min(dist * 0.3, 50)

      // Find a free channel for the curve's peak (perpendicular to the edge direction)
      const angle = Math.atan2(endStandoff.y - startStandoff.y, endStandoff.x - startStandoff.x) + Math.PI / 2
      const isMoreHorizontal = Math.abs(Math.cos(angle)) > Math.abs(Math.sin(angle))

      // Track channel based on curve direction using GridTracker
      let curveOffset = 0
      if (isMoreHorizontal) {
        const idealX = midX + Math.cos(angle) * baseCurveAmt
        const channelX = gridTracker.findAndMarkChannel(idealX, false, startStandoff.y, endStandoff.y)
        curveOffset = channelX - idealX
      } else {
        const idealY = midY + Math.sin(angle) * baseCurveAmt
        const channelY = gridTracker.findAndMarkChannel(idealY, true, startStandoff.x, endStandoff.x)
        curveOffset = channelY - idealY
      }

      const curveAmt = baseCurveAmt + curveOffset
      const cx = midX + Math.cos(angle) * curveAmt
      const cy = midY + Math.sin(angle) * curveAmt
      path = `M${startPort.x},${startPort.y} L${startStandoff.x},${startStandoff.y} Q${cx},${cy} ${endStandoff.x},${endStandoff.y} L${endEdge.x},${endEdge.y}`
    } else if (routed?.svgPath) {
      // Use pre-routed path from routing modules (diagonal or orthogonal)
      path = routed.svgPath
    } else {
      // Fallback: simple line via standoff points
      path = `M${startPort.x},${startPort.y} L${startStandoff.x},${startStandoff.y} L${endStandoff.x},${endStandoff.y} L${endEdge.x},${endEdge.y}`
    }

    // Get stroke width and trunk info (from bundling or default)
    const bundleStrokeWidth = routed?.strokeWidth || 1.5
    const bundleSize = routed?.bundleSize || 1
    const trunkPath = routed?.trunkPath
    const trunkStrokeWidth = routed?.trunkStrokeWidth || 3
    const isTrunkOwner = routed?.isTrunkOwner || false

    return {
      id: edge.id,
      source_node_id: edge.source_node_id,
      target_node_id: edge.target_node_id,
      x1,
      y1,
      x2,
      y2,
      path,
      style: edgeStyle,
      strokeWidth: bundleStrokeWidth,
      bundleSize,
      trunkPath,
      trunkStrokeWidth,
      isTrunkOwner,
      // Full extent for hit area (includes arrow)
      hitX1: startPort.x,
      hitY1: startPort.y,
      hitX2: endPort.x,
      hitY2: endPort.y,
      link_type: edge.link_type,
      label: edge.label,
      isBidirectional,
      isShortEdge,
      // Debug: port offset info
      debugInfo: routed?.debugInfo,
    }
  }).filter(Boolean)
})

// Visible edges - filtered for large graphs with pre-computed rendering properties
const visibleEdgeLines = computed(() => {
  let edges = edgeLines.value

  // Filter for large graphs when zoomed out, but NOT when zoomed out very far
  // At low zoom levels, all content fits on screen anyway so filtering is unnecessary
  // Only filter in the "medium zoom" range (0.3 to 0.8) where culling helps
  if (isLargeGraph.value && !isZooming.value && scale.value <= 0.8 && scale.value >= 0.3) {
    const visIds = visibleNodeIds.value
    edges = edges.filter(e =>
      visIds.has(e.source_node_id) || visIds.has(e.target_node_id)
    )
  }

  // Pre-compute rendering properties to avoid repeated function calls in template
  const highlighted = highlightedEdgeIds.value
  const selected = selectedEdge.value
  const bundling = edgeBundling.value
  const baseStrokeWidth = edgeStrokeWidth.value
  const activeIds = activeNodeIds.value

  return edges.map(e => {
    const isHighlighted = highlighted.has(e.id)
    const isSelected = selected === e.id
    const color = e.link_type?.startsWith('#') ? e.link_type : defaultEdgeColor.value
    const effectiveStrokeWidth = bundling ? e.strokeWidth * baseStrokeWidth : baseStrokeWidth
    const renderStrokeWidth = isSelected || isHighlighted ? effectiveStrokeWidth + 2 : effectiveStrokeWidth

    // Get highlight color based on whether connected node is selected or just hovered
    let edgeHighlightColor = highlightColor.value
    if (isHighlighted) {
      // Check if connected to a selected node (not just hovered)
      const isConnectedToSelected =
        store.selectedNodeIds.includes(e.source_node_id) ||
        store.selectedNodeIds.includes(e.target_node_id)

      if (isConnectedToSelected) {
        // Use selected color (matches selected node border)
        edgeHighlightColor = selectedColor.value
      } else {
        // Just hovered - use node's color or default highlight
        const hoveredNode = hoveredNodeId.value
        if (hoveredNode) {
          const node = store.getNode(hoveredNode)
          edgeHighlightColor = getEdgeHighlightColor(node?.color_theme || null)
        }
      }
    }

    return {
      ...e,
      isHighlighted,
      isSelected,
      color,
      edgeHighlightColor,
      renderStrokeWidth,
      glowStrokeWidth: effectiveStrokeWidth + 6,
      arrowMarkerId: isHighlighted ? `arrow-${edgeHighlightColor.replace('#', '')}` : `arrow-${color.replace('#', '')}`,
    }
  })
})

// Transform for the canvas content
const transform = computed(() => {
  // Use translate3d for GPU acceleration
  return `translate3d(${offsetX.value}px, ${offsetY.value}px, 0) scale(${scale.value})`
})

// Zoom centered on mouse position
function onWheel(e: WheelEvent) {
  // Check if inside a scrollable element
  const target = e.target as HTMLElement
  const scrollable = target.closest('.node-content') || target.closest('.inline-editor')

  if (scrollable) {
    const el = scrollable as HTMLElement
    const canScroll = el.scrollHeight > el.clientHeight

    if (canScroll) {
      // Check if at scroll boundaries
      const atTop = el.scrollTop <= 0
      const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 1

      // Let the element scroll if not at boundary
      if ((e.deltaY < 0 && !atTop) || (e.deltaY > 0 && !atBottom)) {
        return // Let the element scroll normally
      }

      // At boundary - prevent canvas zoom, just absorb the event
      e.preventDefault()
      e.stopPropagation()
      return
    }
  }

  e.preventDefault()

  const rect = canvasRef.value?.getBoundingClientRect()
  if (!rect) return

  const mouseX = e.clientX - rect.left
  const mouseY = e.clientY - rect.top

  // Two-finger vertical (up/down) = zoom
  // Two-finger horizontal = pan
  // Pinch = zoom (ctrlKey is set)
  const isHorizontalPan = Math.abs(e.deltaX) > Math.abs(e.deltaY) * 0.3

  if (isHorizontalPan && !e.ctrlKey) {
    // Horizontal pan - disable smooth transitions
    isZooming.value = false
    offsetX.value -= e.deltaX
    offsetY.value -= e.deltaY
  } else {
    // Smooth zoom - use deltaY magnitude for proportional zooming
    isZooming.value = true
    if (zoomTimeout) clearTimeout(zoomTimeout)
    zoomTimeout = window.setTimeout(() => { isZooming.value = false }, 150)

    const zoomIntensity = 0.003
    const delta = Math.exp(-e.deltaY * zoomIntensity)
    const newScale = Math.min(Math.max(scale.value * delta, 0.1), 3)
    const scaleChange = newScale / scale.value
    offsetX.value = mouseX - (mouseX - offsetX.value) * scaleChange
    offsetY.value = mouseY - (mouseY - offsetY.value) * scaleChange
    scale.value = newScale

    // Update magnifier visibility when zoom crosses threshold
    if (isMouseOnCanvas.value) {
      showMagnifier.value = newScale < MAGNIFIER_THRESHOLD
    }
  }

  // Save view state (debounced)
  scheduleSaveViewState()
}

// Magnifier mouse tracking (throttled for performance)
let magnifierRafId: number | null = null

function onCanvasMouseMove(e: MouseEvent) {
  // Throttle magnifier updates using requestAnimationFrame
  if (magnifierRafId) return

  magnifierRafId = requestAnimationFrame(() => {
    magnifierRafId = null
    const rect = canvasRef.value?.getBoundingClientRect()
    if (rect) {
      magnifierPos.value = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      }
    }
    // Update magnifier visibility based on current zoom level
    if (scale.value < MAGNIFIER_THRESHOLD && isMouseOnCanvas.value) {
      showMagnifier.value = true
    } else {
      showMagnifier.value = false
    }
  })
}

function onCanvasMouseEnter() {
  isMouseOnCanvas.value = true
  if (scale.value < MAGNIFIER_THRESHOLD) {
    showMagnifier.value = true
  }
}

function onCanvasMouseLeave() {
  isMouseOnCanvas.value = false
  showMagnifier.value = false
}

// Pan with left mouse drag on empty canvas space
function onCanvasMouseDown(e: MouseEvent) {
  // Left click - start panning or lasso if not on a node
  if (e.button === 0) {
    const target = e.target as HTMLElement
    // Don't pan if clicking on a node, edge, panel, frame, or node AI toolbar
    if (target.closest('.node-card') || target.closest('.edge-line') || target.closest('.edge-panel') || target.closest('.canvas-frame') || target.closest('.node-llm-bar-floating')) {
      return
    }
    e.preventDefault()
    // End any editing
    if (editingNodeId.value) {
      saveEditing()
    }

    // Shift+drag = lasso selection
    if (e.shiftKey) {
      startLasso(e)
      document.addEventListener('mousemove', updateLasso)
      document.addEventListener('mouseup', () => {
        endLasso()
        document.removeEventListener('mousemove', updateLasso)
      }, { once: true })
      return
    }

    store.selectNode(null)
    store.selectFrame(null)
    selectedEdge.value = null
    startPan(e)
    return
  }
}

function startPan(e: MouseEvent) {
  panStart.value = {
    x: e.clientX,
    y: e.clientY,
    offsetX: offsetX.value,
    offsetY: offsetY.value,
  }
  document.addEventListener('mousemove', onPanMove)
  document.addEventListener('mouseup', stopPan)
}

function onPanMove(e: MouseEvent) {
  // Only set panning true after mouse actually moves (allows double-click to work)
  const dx = e.clientX - panStart.value.x
  const dy = e.clientY - panStart.value.y
  if (!isPanning.value && (Math.abs(dx) > 3 || Math.abs(dy) > 3)) {
    isPanning.value = true
  }
  if (!isPanning.value) return
  offsetX.value = panStart.value.offsetX + dx
  offsetY.value = panStart.value.offsetY + dy
}

function stopPan() {
  if (isPanning.value) {
    lastDragEndTime = Date.now()
  }
  isPanning.value = false
  document.removeEventListener('mousemove', onPanMove)
  document.removeEventListener('mouseup', stopPan)
}

// Node hover handlers for tooltip
function onNodeMouseEnter(e: MouseEvent, nodeId: string) {
  hoveredNodeId.value = nodeId
  hoverMousePos.value = { x: e.clientX, y: e.clientY }
}

function onNodeMouseMove(e: MouseEvent) {
  hoverMousePos.value = { x: e.clientX, y: e.clientY }
}

// Node dragging
function onNodeMouseDown(e: MouseEvent, nodeId: string) {
  e.stopPropagation()

  // Don't start drag if editing this node
  if (editingNodeId.value === nodeId) {
    return
  }

  // Cmd+click to zoom to node
  if (e.metaKey && !e.shiftKey && !e.altKey) {
    zoomToNode(nodeId)
    return
  }

  // Alt+drag to create edge
  if (e.altKey) {
    const node = store.getNode(nodeId)
    if (node) {
      isCreatingEdge.value = true
      edgeStartNode.value = nodeId
      const pos = screenToCanvas(e.clientX, e.clientY)
      edgePreviewEnd.value = pos
      document.addEventListener('mousemove', onEdgePreviewMove)
      document.addEventListener('mouseup', onEdgeCreate)
    }
    return
  }

  const node = store.getNode(nodeId)
  if (!node) return

  // Check if file content has changed (on-demand sync)
  store.refreshNodeFromFile(nodeId)

  // Capture undo state before dragging
  pushUndo()

  draggingNode.value = nodeId

  // If node is already selected, don't change selection (allows multi-drag)
  // Only select if not already selected
  if (!store.selectedNodeIds.includes(nodeId)) {
    store.selectNode(nodeId, e.shiftKey || e.metaKey)
  }
  selectedEdge.value = null

  // In neighborhood mode, clicking a neighbor navigates to its neighborhood
  if (neighborhoodMode.value && nodeId !== focusNodeId.value) {
    focusNodeId.value = nodeId
    // Layout and center on the new focus (synchronous)
    layoutNeighborhood(nodeId)
  }

  const pos = screenToCanvas(e.clientX, e.clientY)
  dragStart.value = {
    x: pos.x,
    y: pos.y,
    nodeX: node.canvas_x,
    nodeY: node.canvas_y,
  }

  // Store initial positions for all selected nodes (multi-drag)
  multiDragInitial.value.clear()
  if (store.selectedNodeIds.length > 1 && store.selectedNodeIds.includes(nodeId)) {
    for (const id of store.selectedNodeIds) {
      const n = store.getNode(id)
      if (n) {
        multiDragInitial.value.set(id, { x: n.canvas_x, y: n.canvas_y })
      }
    }
  }

  document.addEventListener('mousemove', onNodeDrag)
  document.addEventListener('mouseup', stopNodeDrag)
}

function onNodeDrag(e: MouseEvent) {
  if (!draggingNode.value) return
  const pos = screenToCanvas(e.clientX, e.clientY)
  const dx = pos.x - dragStart.value.x
  const dy = pos.y - dragStart.value.y

  // Move all selected nodes if multi-dragging
  if (multiDragInitial.value.size > 0) {
    for (const [id, initial] of multiDragInitial.value) {
      const newX = snapToGrid(initial.x + dx)
      const newY = snapToGrid(initial.y + dy)
      store.updateNodePosition(id, newX, newY)
    }
  } else {
    const newX = snapToGrid(dragStart.value.nodeX + dx)
    const newY = snapToGrid(dragStart.value.nodeY + dy)
    store.updateNodePosition(draggingNode.value, newX, newY)
  }
}

function stopNodeDrag() {
  // Push overlapping nodes away after drag
  if (multiDragInitial.value.size > 0) {
    // Push away for all dragged nodes
    for (const id of multiDragInitial.value.keys()) {
      pushOverlappingNodesAway(id)
    }
  } else if (draggingNode.value) {
    pushOverlappingNodesAway(draggingNode.value)
  }

  draggingNode.value = null
  multiDragInitial.value.clear()
  lastDragEndTime = Date.now()
  document.removeEventListener('mousemove', onNodeDrag)
  document.removeEventListener('mouseup', stopNodeDrag)
}

// Node resizing (supports multiple selected nodes, all directions)
function onResizeMouseDown(e: MouseEvent, nodeId: string, direction: string = 'se') {
  e.stopPropagation()
  e.preventDefault()

  const node = store.getNode(nodeId)
  if (!node) return

  resizingNode.value = nodeId
  resizeDirection.value = direction
  resizeStart.value = {
    x: e.clientX,
    y: e.clientY,
    width: node.width || NODE_DEFAULTS.WIDTH,
    height: node.height || NODE_DEFAULTS.HEIGHT,
    nodeX: node.canvas_x,
    nodeY: node.canvas_y,
  }
  resizePreview.value = {
    width: node.width || NODE_DEFAULTS.WIDTH,
    height: node.height || NODE_DEFAULTS.HEIGHT,
    x: node.canvas_x,
    y: node.canvas_y,
  }

  // Store initial sizes of all selected nodes for multi-resize
  multiResizeInitial.value.clear()
  if (store.selectedNodeIds.includes(nodeId) && store.selectedNodeIds.length > 1) {
    for (const id of store.selectedNodeIds) {
      const n = store.getNode(id)
      if (n) {
        multiResizeInitial.value.set(id, {
          width: n.width || NODE_DEFAULTS.WIDTH,
          height: n.height || NODE_DEFAULTS.HEIGHT,
          x: n.canvas_x,
          y: n.canvas_y,
        })
      }
    }
  }

  document.addEventListener('mousemove', onResizeMove)
  document.addEventListener('mouseup', stopResize)
}

function onResizeMove(e: MouseEvent) {
  if (!resizingNode.value) return

  const dx = (e.clientX - resizeStart.value.x) / scale.value
  const dy = (e.clientY - resizeStart.value.y) / scale.value
  const dir = resizeDirection.value

  let width = resizeStart.value.width
  let height = resizeStart.value.height
  let x = resizeStart.value.nodeX
  let y = resizeStart.value.nodeY

  // Handle horizontal resize
  if (dir.includes('e')) {
    width = Math.max(120, resizeStart.value.width + dx)
  } else if (dir.includes('w')) {
    const newWidth = Math.max(120, resizeStart.value.width - dx)
    x = resizeStart.value.nodeX + (resizeStart.value.width - newWidth)
    width = newWidth
  }

  // Handle vertical resize
  if (dir.includes('s')) {
    height = Math.max(60, resizeStart.value.height + dy)
  } else if (dir.includes('n')) {
    const newHeight = Math.max(60, resizeStart.value.height - dy)
    y = resizeStart.value.nodeY + (resizeStart.value.height - newHeight)
    height = newHeight
  }

  // Apply grid snap if enabled
  if (gridLockEnabled.value) {
    width = snapToGrid(width)
    height = snapToGrid(height)
    x = snapToGrid(x)
    y = snapToGrid(y)
  }

  resizePreview.value = { width, height, x, y }

  // Update all selected nodes to the SAME size (not proportional)
  if (multiResizeInitial.value.size > 0) {
    for (const [id, _initial] of multiResizeInitial.value) {
      if (id === resizingNode.value) continue
      const n = store.getNode(id)
      if (n) {
        n.width = width
        n.height = height
      }
    }
  }
}

function stopResize() {
  if (resizingNode.value) {
    const nodeId = resizingNode.value
    const { width, height, x, y } = resizePreview.value

    // Update primary node size and position
    store.updateNodeSize(nodeId, width, height)
    store.updateNodePosition(nodeId, x, y)

    // Update all other selected nodes to the SAME size
    if (multiResizeInitial.value.size > 0) {
      for (const [id, _initial] of multiResizeInitial.value) {
        if (id === nodeId) continue
        store.updateNodeSize(id, width, height)
      }
    }

    // In neighborhood mode, re-layout to adapt to new sizes
    if (neighborhoodMode.value && focusNodeId.value) {
      setTimeout(() => layoutNeighborhood(focusNodeId.value!), 10)
    } else {
      pushOverlappingNodesAway(nodeId)
    }
  }
  resizingNode.value = null
  multiResizeInitial.value.clear()
  lastDragEndTime = Date.now()
  document.removeEventListener('mousemove', onResizeMove)
  document.removeEventListener('mouseup', stopResize)
}

/**
 * Push nodes that overlap with the given node away (ripples through graph)
 */
function pushOverlappingNodesAway(sourceId: string) {
  const PADDING = 50  // Space between nodes for edges

  const sourceNode = store.getNode(sourceId)
  if (!sourceNode) return

  const sw = sourceNode.width || NODE_DEFAULTS.WIDTH
  const sh = sourceNode.height || NODE_DEFAULTS.HEIGHT
  const sx = sourceNode.canvas_x
  const sy = sourceNode.canvas_y
  const scx = sx + sw / 2
  const scy = sy + sh / 2

  for (const node of store.filteredNodes) {
    if (node.id === sourceId) continue

    const nw = node.width || NODE_DEFAULTS.WIDTH
    const nh = node.height || NODE_DEFAULTS.HEIGHT
    const nx = node.canvas_x
    const ny = node.canvas_y

    // Check if nodes overlap (with padding)
    const overlapX = sx < nx + nw + PADDING && sx + sw + PADDING > nx
    const overlapY = sy < ny + nh + PADDING && sy + sh + PADDING > ny

    if (overlapX && overlapY) {
      const ncx = nx + nw / 2
      const ncy = ny + nh / 2

      // Direction from source to this node
      const dx = ncx - scx
      const dy = ncy - scy

      let newX = nx
      let newY = ny

      // Push in the dominant direction
      if (Math.abs(dx) >= Math.abs(dy)) {
        // Push horizontally
        if (dx >= 0) {
          newX = sx + sw + PADDING  // Push right
        } else {
          newX = sx - nw - PADDING  // Push left
        }
      } else {
        // Push vertically
        if (dy >= 0) {
          newY = sy + sh + PADDING  // Push down
        } else {
          newY = sy - nh - PADDING  // Push up
        }
      }

      store.updateNodePosition(node.id, newX, newY)
    }
  }
}

// Navigate to a node by title (for wikilinks)
function navigateToNode(title: string) {
  // Find node by title (case-insensitive)
  const targetNode = store.filteredNodes.find(
    n => n.title.toLowerCase() === title.toLowerCase()
  )

  if (!targetNode) {
    console.warn(`Node not found: ${title}`)
    return
  }

  // Center view on node
  const rect = canvasRef.value?.getBoundingClientRect()
  if (rect) {
    const nodeCenterX = targetNode.canvas_x + (targetNode.width || NODE_DEFAULTS.WIDTH) / 2
    const nodeCenterY = targetNode.canvas_y + (targetNode.height || NODE_DEFAULTS.HEIGHT) / 2
    offsetX.value = rect.width / 2 - nodeCenterX * scale.value
    offsetY.value = rect.height / 2 - nodeCenterY * scale.value
  }

  // Select the node
  store.selectNode(targetNode.id)
}

// Handle clicks in node content (for external links and wikilinks)
function handleContentClick(e: MouseEvent) {
  const target = e.target as HTMLElement
  const link = target.closest('a')
  if (link) {
    e.preventDefault()
    e.stopPropagation()
    // Check if it's a wikilink
    if (link.classList.contains('wikilink')) {
      const linkTarget = link.dataset.target
      if (linkTarget) {
        navigateToNode(linkTarget)
      }
    } else if (link.href) {
      // External link
      openExternal(link.href)
    }
  }
}

// Inline editing
function startEditing(nodeId: string) {
  // Save any current editing first
  if (editingNodeId.value && editingNodeId.value !== nodeId) {
    saveEditing()
  }
  const node = store.getNode(nodeId)
  if (!node) return
  editingNodeId.value = nodeId
  editContent.value = node.markdown_content || ''
  // Focus the textarea after Vue updates the DOM
  setTimeout(() => {
    const textarea = document.querySelector('.inline-editor') as HTMLTextAreaElement
    if (textarea) {
      textarea.focus()
      textarea.setSelectionRange(textarea.value.length, textarea.value.length)
    }
  }, 10)
}

function startEditingTitle(nodeId: string) {
  const node = store.getNode(nodeId)
  if (!node) return
  editingTitleId.value = nodeId
  editTitle.value = node.title || ''
  setTimeout(() => {
    const input = document.querySelector('.title-editor') as HTMLInputElement
    if (input) {
      input.focus()
      input.select()
    }
  }, 10)
}

function saveTitleEditing() {
  if (editingTitleId.value) {
    const node = store.getNode(editingTitleId.value)
    if (node) {
      node.title = editTitle.value
    }
  }
  editingTitleId.value = null
  editTitle.value = ''
}

function cancelTitleEditing() {
  editingTitleId.value = null
  editTitle.value = ''
}

function saveEditing(e?: FocusEvent) {
  // Don't close if focus moved to LLM inputs, buttons, or color bar
  if (e?.relatedTarget) {
    const related = e.relatedTarget as HTMLElement
    if (related.closest('.node-llm-bar-floating') ||
        related.closest('.node-color-bar') ||
        related.closest('.graph-llm-bar')) {
      return
    }
  }
  const nodeId = editingNodeId.value
  if (nodeId) {
    store.updateNodeContent(nodeId, editContent.value)
    // Trigger mermaid rendering after content update
    setTimeout(renderMermaidDiagrams, 100)
    // Auto-fit node to content after saving (if enabled for this node)
    // Delay to ensure content is rendered (including mermaid)
    const node = store.getNode(nodeId)
    if (node?.auto_fit) {
      setTimeout(() => fitNodeToContent(nodeId), 500)
    }
  }
  editingNodeId.value = null
  editContent.value = ''
  nodePrompt.value = ''
}

function onEditorKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    saveEditing()
  }
  // Cmd/Ctrl+Enter to save and exit
  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
    saveEditing()
  }
  // Don't propagate to prevent canvas shortcuts
  e.stopPropagation()
}

// Edge creation
function onEdgePreviewMove(e: MouseEvent) {
  edgePreviewEnd.value = screenToCanvas(e.clientX, e.clientY)
}

function onEdgeCreate(e: MouseEvent) {
  document.removeEventListener('mousemove', onEdgePreviewMove)
  document.removeEventListener('mouseup', onEdgeCreate)

  if (!edgeStartNode.value) {
    isCreatingEdge.value = false
    return
  }

  // Find node under cursor using DOM hit testing
  const target = document.elementFromPoint(e.clientX, e.clientY)
  const nodeCard = target?.closest('.node-card') as HTMLElement | null
  const targetNodeId = nodeCard?.dataset.nodeId
  const finalTarget = targetNodeId ? store.filteredNodes.find(n => n.id === targetNodeId) : null

  if (finalTarget && finalTarget.id !== edgeStartNode.value) {
    store.createEdge({
      source_node_id: edgeStartNode.value,
      target_node_id: finalTarget.id,
      link_type: 'related',
    })
  }

  isCreatingEdge.value = false
  edgeStartNode.value = null
}

// Edge selection
function onEdgeClick(e: MouseEvent, edgeId: string) {
  e.stopPropagation()
  selectedEdge.value = edgeId
  store.selectNode(null)
}

async function deleteSelectedEdge() {
  if (selectedEdge.value) {
    await store.deleteEdge(selectedEdge.value)
    selectedEdge.value = null
  }
}

function changeEdgeLabel(label: string) {
  if (selectedEdge.value) {
    const edge = store.filteredEdges.find(e => e.id === selectedEdge.value)
    if (edge) {
      edge.label = label || null
    }
  }
}

function reverseEdge() {
  if (!selectedEdge.value) return
  const edge = store.filteredEdges.find(e => e.id === selectedEdge.value)
  if (!edge) return
  // Swap source and target
  const temp = edge.source_node_id
  edge.source_node_id = edge.target_node_id
  edge.target_node_id = temp
}

function isEdgeBidirectional(edgeId: string): boolean {
  const edge = store.edges.find(e => e.id === edgeId)
  if (!edge) return false
  return store.edges.some(
    e => e.source_node_id === edge.target_node_id && e.target_node_id === edge.source_node_id
  )
}

async function makeUnidirectional() {
  if (!selectedEdge.value) return
  const edge = store.edges.find(e => e.id === selectedEdge.value)
  if (!edge) return

  // Find and delete the reverse edge
  const reverseEdge = store.edges.find(
    e => e.source_node_id === edge.target_node_id && e.target_node_id === edge.source_node_id
  )

  if (reverseEdge) {
    await store.deleteEdge(reverseEdge.id)
  }
}

async function makeBidirectional() {
  if (!selectedEdge.value) return
  const edge = store.edges.find(e => e.id === selectedEdge.value)
  if (!edge) return

  // Check if reverse edge already exists
  const reverseExists = store.edges.some(
    e => e.source_node_id === edge.target_node_id && e.target_node_id === edge.source_node_id
  )

  if (!reverseExists) {
    await store.createEdge({
      source_node_id: edge.target_node_id,
      target_node_id: edge.source_node_id,
      link_type: edge.link_type,
      label: edge.label || undefined,
    })
  }
}

async function insertNodeOnEdge() {
  if (!selectedEdge.value) return

  const edge = store.filteredEdges.find(e => e.id === selectedEdge.value)
  if (!edge) return

  const sourceNode = store.getNode(edge.source_node_id)
  const targetNode = store.getNode(edge.target_node_id)
  if (!sourceNode || !targetNode) return

  // Calculate midpoint
  const midX = (sourceNode.canvas_x + targetNode.canvas_x) / 2
  const midY = (sourceNode.canvas_y + targetNode.canvas_y) / 2

  // Create new node at midpoint
  const newNode = await store.createNode({
    title: '',
    node_type: 'note',
    markdown_content: '',
    canvas_x: midX,
    canvas_y: midY,
  })

  // Delete old edge
  await store.deleteEdge(edge.id)

  // Create two new edges
  await store.createEdge({
    source_node_id: edge.source_node_id,
    target_node_id: newNode.id,
    link_type: edge.link_type,
  })
  await store.createEdge({
    source_node_id: newNode.id,
    target_node_id: edge.target_node_id,
    link_type: edge.link_type,
  })

  selectedEdge.value = null
  store.selectNode(newNode.id)
}

// Double click to create node
async function onCanvasDoubleClick(e: MouseEvent) {
  const target = e.target as HTMLElement

  // Don't create if clicking on interactive elements
  if (target.closest('.node-card') ||
      target.closest('.edge-panel') ||
      target.closest('.zoom-controls') ||
      target.closest('.status-bar')) {
    return
  }

  // Don't create if we just finished dragging (within 200ms)
  if (Date.now() - lastDragEndTime < 200) return

  const pos = screenToCanvas(e.clientX, e.clientY)
  await store.createNode({
    title: '',
    node_type: 'note',
    markdown_content: '',
    canvas_x: snapToGrid(pos.x),
    canvas_y: snapToGrid(pos.y),
  })
}

// Edge color palettes per theme
const defaultEdgeColors = [
  { value: '#94a3b8' }, // gray (default)
  { value: '#3b82f6' }, // blue
  { value: '#22c55e' }, // green
  { value: '#f97316' }, // orange
  { value: '#ef4444' }, // red
  { value: '#8b5cf6' }, // purple
  { value: '#ec4899' }, // pink
]

const cyberEdgeColors = [
  { value: '#00ffcc' }, // neon cyan (default)
  { value: '#ff00ff' }, // neon magenta
  { value: '#00ccff' }, // neon blue
  { value: '#ffff00' }, // neon yellow
  { value: '#ff3366' }, // neon red
  { value: '#9933ff' }, // neon purple
  { value: '#00ff66' }, // neon green
]

// Track current theme name for reactive palette switching
const currentTheme = ref(document.documentElement.getAttribute('data-theme') || 'light')

// Reactive edge color palette based on theme
const edgeColorPalette = computed(() => {
  return currentTheme.value === 'cyber' ? cyberEdgeColors : defaultEdgeColors
})

// Default edge color (first in palette)
const defaultEdgeColor = computed(() => edgeColorPalette.value[0].value)

// Highlight color for hover - matches theme accent
const highlightColor = computed(() => {
  return currentTheme.value === 'cyber' ? '#00ffcc' : '#3b82f6'
})

// Selected color - matches selected node border
const selectedColor = computed(() => {
  return currentTheme.value === 'cyber' ? '#ff00ff' : '#3b82f6'
})

// Map pastel node colors to neon equivalents for cyber theme edge highlights
const cyberHighlightColors: Record<string, string> = {
  '#fee2e2': '#ff3366', // red pastel -> neon red
  '#ffedd5': '#ffaa00', // orange pastel -> neon orange
  '#fef9c3': '#ffff00', // yellow pastel -> neon yellow
  '#dcfce7': '#00ff66', // green pastel -> neon green
  '#dbeafe': '#00ccff', // blue pastel -> neon blue
  '#f3e8ff': '#9933ff', // purple pastel -> neon purple
  '#fce7f3': '#ff00ff', // pink pastel -> neon magenta
}

// Get edge highlight color, mapping to cyber neon if needed
function getEdgeHighlightColor(nodeColor: string | null): string {
  if (!nodeColor) return highlightColor.value
  if (currentTheme.value === 'cyber' && cyberHighlightColors[nodeColor]) {
    return cyberHighlightColors[nodeColor]
  }
  return nodeColor
}

// Edge style types
const edgeStyles = [
  { value: 'diagonal', label: '/' },
  { value: 'orthogonal', label: '⌐' },
]

// Store edge styles (edgeId -> style)
const edgeStyleMap = ref<Record<string, string>>({})
const globalEdgeStyle = ref<'diagonal' | 'orthogonal'>('orthogonal')

// Edge bundling - merge edges with shared endpoints
const edgeBundling = ref(false)

function toggleEdgeBundling() {
  edgeBundling.value = !edgeBundling.value
}

function toggleMagnifier() {
  magnifierEnabled.value = !magnifierEnabled.value
  uiStorage.setMagnifierEnabled(magnifierEnabled.value)
}

function cycleEdgeStyle() {
  const styles: typeof globalEdgeStyle.value[] = ['diagonal', 'orthogonal']
  const idx = styles.indexOf(globalEdgeStyle.value)
  globalEdgeStyle.value = styles[(idx + 1) % styles.length]
}

function getEdgeStyle(edgeId: string): string {
  return edgeStyleMap.value[edgeId] || 'diagonal'
}

function setEdgeStyle(style: string) {
  if (selectedEdge.value) {
    edgeStyleMap.value[selectedEdge.value] = style
  }
}

function getEdgeColor(edge: { link_type: string; debugInfo?: { srcOffset: number } }): string {
  // link_type stores the color directly, or defaults to gray
  const color = edge.link_type
  if (color && color.startsWith('#')) return color
  return '#94a3b8'
}

function getArrowMarkerId(color: string): string {
  // Create a safe ID from the color
  return `arrow-${color.replace('#', '')}`
}

function changeEdgeColor(color: string) {
  if (selectedEdge.value) {
    store.updateEdgeLinkType(selectedEdge.value, color)
  }
}

// Render markdown to HTML with caching
const markdownCache = new Map<string, string>()
let mermaidCounter = 0
let typstCounter = 0

// Typst math cache: math expression -> rendered SVG
const typstCache = new Map<string, string>()
let typstRenderer: any = null
let typstInitPromise: Promise<void> | null = null

async function initTypstRenderer() {
  if (typstRenderer) return
  if (typstInitPromise) return typstInitPromise

  typstInitPromise = (async () => {
    try {
      // Use the simplified $typst API
      const module = await import('@myriaddreamin/typst.ts')
      typstRenderer = module.$typst
      canvasLogger.info('Typst renderer initialized')
    } catch (e) {
      canvasLogger.warn('Typst renderer failed to load:', e)
    }
  })()
  return typstInitPromise
}

async function renderTypstMath() {
  if (!typstRenderer) {
    await initTypstRenderer()
    if (!typstRenderer) return
  }

  const elements = document.querySelectorAll('.typst-pending')
  for (const el of elements) {
    const math = el.getAttribute('data-math')
    const isDisplay = el.classList.contains('typst-display')
    if (!math) continue

    // Check cache
    const cacheKey = `${isDisplay ? 'd' : 'i'}:${math}`
    if (typstCache.has(cacheKey)) {
      el.innerHTML = typstCache.get(cacheKey)!
      el.classList.remove('typst-pending')
      continue
    }

    try {
      const typstCode = isDisplay ? `$ ${math} $` : `$${math}$`
      const mainContent = `#set page(width: auto, height: auto, margin: 0.3em)
#set text(size: 14pt)
${typstCode}`
      const svg = await typstRenderer.svg({ mainContent })
      typstCache.set(cacheKey, svg)
      el.innerHTML = svg
      el.classList.remove('typst-pending')
    } catch (e) {
      console.warn('Typst render error:', e)
      el.textContent = math // Fallback to raw math
      el.classList.remove('typst-pending')
      el.classList.add('typst-error')
    }
  }
}

function renderMarkdown(content: string | null): string {
  if (!content) return ''

  // Check cache first
  if (markdownCache.has(content)) {
    return markdownCache.get(content)!
  }

  // Render full content (no truncation)
  let html = marked.parse(content) as string

  // Post-process to handle mermaid code blocks
  const mermaidRegex = /<pre><code class="language-mermaid">([\s\S]*?)<\/code><\/pre>/g

  let needsMermaidRender = false
  html = html.replace(mermaidRegex, (match, code) => {
    const id = `mermaid-${mermaidCounter++}`
    const decoded = code
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")

    // If we have cached SVG for this mermaid code, use it directly
    if (mermaidCache.has(decoded)) {
      return `<div class="mermaid-wrapper">${mermaidCache.get(decoded)}</div>`
    }
    // Only trigger mermaid render if we have uncached diagrams
    needsMermaidRender = true
    return `<div class="mermaid-wrapper"><pre class="mermaid" id="${id}">${decoded}</pre></div>`
  })

  // Post-process to handle math expressions ($...$ and $$...$$)
  // Display math: $$...$$
  let needsTypstRender = false
  html = html.replace(/\$\$([^$]+)\$\$/g, (match, math) => {
    const id = `typst-${typstCounter++}`
    const cacheKey = `d:${math.trim()}`
    if (typstCache.has(cacheKey)) {
      return `<div class="typst-math typst-display">${typstCache.get(cacheKey)}</div>`
    }
    needsTypstRender = true
    return `<div class="typst-math typst-display typst-pending" id="${id}" data-math="${math.trim()}">${math}</div>`
  })

  // Inline math: $...$  (but not $$)
  html = html.replace(/(?<!\$)\$(?!\$)([^$\n]+)\$(?!\$)/g, (match, math) => {
    const id = `typst-${typstCounter++}`
    const cacheKey = `i:${math.trim()}`
    if (typstCache.has(cacheKey)) {
      return `<span class="typst-math typst-inline">${typstCache.get(cacheKey)}</span>`
    }
    needsTypstRender = true
    return `<span class="typst-math typst-inline typst-pending" id="${id}" data-math="${math.trim()}">${math}</span>`
  })

  // Only schedule mermaid render if there are uncached diagrams
  if (needsMermaidRender) {
    setTimeout(() => renderMermaidDiagrams?.(), 50)
  }

  // Schedule Typst render if needed
  if (needsTypstRender) {
    setTimeout(renderTypstMath, 50)
  }

  // Convert [[link]] and [[link|display]] wikilinks to clickable elements
  const wikilinkRegex = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g
  html = html.replace(wikilinkRegex, (match, target, display) => {
    const displayText = display || target
    const targetTrimmed = target.trim()
    // Check if target node exists for styling
    const targetExists = store.filteredNodes.some(
      n => n.title.toLowerCase() === targetTrimmed.toLowerCase()
    )
    const missingClass = targetExists ? '' : ' missing'
    return `<a class="wikilink${missingClass}" data-target="${targetTrimmed}">${displayText}</a>`
  })

  // Cache the result (limit cache size)
  if (markdownCache.size > 100) {
    const firstKey = markdownCache.keys().next().value
    markdownCache.delete(firstKey)
  }
  markdownCache.set(content, html)

  return html
}

// Pre-rendered HTML cache for each node (avoids re-renders during drag)
const nodeRenderedContent = ref<Record<string, string>>({})
const nodeContentHashes = new Map<string, string>() // Track content for change detection

// Debounced markdown rendering - only re-render changed nodes
let markdownRenderTimer: ReturnType<typeof setTimeout> | null = null
function updateRenderedContent() {
  if (markdownRenderTimer) clearTimeout(markdownRenderTimer)
  markdownRenderTimer = setTimeout(() => {
    const result = { ...nodeRenderedContent.value }
    let changed = false

    // Track which nodes still exist
    const currentIds = new Set<string>()

    for (const node of store.filteredNodes) {
      currentIds.add(node.id)
      const contentKey = node.markdown_content || ''
      const prevHash = nodeContentHashes.get(node.id)

      // Only re-render if content actually changed
      if (prevHash !== contentKey) {
        result[node.id] = renderMarkdown(node.markdown_content)
        nodeContentHashes.set(node.id, contentKey)
        changed = true
      } else if (!result[node.id]) {
        // New node, render it
        result[node.id] = renderMarkdown(node.markdown_content)
        nodeContentHashes.set(node.id, contentKey)
        changed = true
      }
    }

    // Clean up removed nodes
    for (const id of nodeContentHashes.keys()) {
      if (!currentIds.has(id)) {
        nodeContentHashes.delete(id)
        delete result[id]
        changed = true
      }
    }

    if (changed) {
      nodeRenderedContent.value = result
    }
  }, 50) // 50ms debounce
}

// Watch for node changes with shallow comparison
watch(
  () => store.filteredNodes.length + store.filteredNodes.reduce((sum, n) => sum + (n.markdown_content?.length || 0), 0),
  updateRenderedContent,
  { immediate: true }
)

// Mermaid rendering
let mermaidLoaded = false
let mermaidApi: any = null
const mermaidCache = new Map<string, string>() // code -> svg
let mermaidRenderPending = false
let mermaidRenderQueued = false

async function renderMermaidDiagrams() {
  // If already rendering, queue another render for when it's done
  if (mermaidRenderPending) {
    mermaidRenderQueued = true
    return
  }
  mermaidRenderPending = true
  mermaidRenderQueued = false

  await nextTick()

  const elements = document.querySelectorAll('.mermaid')
  if (elements.length === 0) {
    mermaidRenderPending = false
    // Check if another render was queued
    if (mermaidRenderQueued) {
      mermaidRenderQueued = false
      setTimeout(renderMermaidDiagrams, 50)
    }
    return
  }

  // Lazy load mermaid only when needed
  if (!mermaidLoaded) {
    try {
      const mod = await import('mermaid')
      let api = mod.default || mod
      if (api.default) api = api.default

      mermaidApi = api
      if (typeof mermaidApi.initialize === 'function') {
        mermaidApi.initialize({
          startOnLoad: false,
          theme: isDarkMode.value ? 'dark' : 'default',
          securityLevel: 'loose',
        })
      }
      mermaidLoaded = true
    } catch (e) {
      console.error('Mermaid load error:', e)
      mermaidRenderPending = false
      return
    }
  }

  let didRenderNew = false
  for (const el of elements) {
    // Skip if already contains SVG (already rendered in DOM)
    if (el.querySelector('svg')) continue

    const code = el.textContent?.trim() || ''
    if (!code) continue

    // Check cache first
    if (mermaidCache.has(code)) {
      el.innerHTML = mermaidCache.get(code)!
      didRenderNew = true
      continue
    }

    try {
      const id = `m${Date.now()}${Math.random().toString(36).substr(2, 5)}`
      const { svg } = await mermaidApi.render(id, code)
      mermaidCache.set(code, svg)
      el.innerHTML = svg
      didRenderNew = true
    } catch (e: any) {
      const msg = e.message || String(e)
      const errorHtml = `<div style="color:var(--danger-color);font-size:11px;padding:8px;user-select:text;">Diagram error: ${msg.substring(0, 100)}</div>`
      mermaidCache.set(code, errorHtml)
      el.innerHTML = errorHtml
      didRenderNew = true
    }
  }

  // Only clear markdown cache if we actually rendered something new
  if (didRenderNew) {
    markdownCache.clear()
    // Note: Don't auto-fit here - it causes unexpected node resizing
    // Users can manually fit nodes with the Fit button
  }

  mermaidRenderPending = false

  // Check if another render was queued while we were rendering
  if (mermaidRenderQueued) {
    mermaidRenderQueued = false
    setTimeout(renderMermaidDiagrams, 50)
  }
}

// Track mermaid code for re-rendering (only changes when actual mermaid content changes)
let lastMermaidCode = ''

// Watch for mermaid content changes only
watch(() => {
  // Extract only mermaid code blocks from all nodes
  const mermaidBlocks: string[] = []
  for (const node of store.filteredNodes) {
    const content = node.markdown_content || ''
    const matches = content.match(/```mermaid[\s\S]*?```/g)
    if (matches) {
      mermaidBlocks.push(...matches)
    }
  }
  return mermaidBlocks.join('|||')
}, (newMermaidCode) => {
  if (newMermaidCode && newMermaidCode !== lastMermaidCode) {
    lastMermaidCode = newMermaidCode
    setTimeout(renderMermaidDiagrams, 100)
  }
})

// Node colors for the color picker (pastel for light/dark, neon for cyber)
const defaultNodeColors = [
  { value: null },
  { value: '#fee2e2' }, // red
  { value: '#ffedd5' }, // orange
  { value: '#fef9c3' }, // yellow
  { value: '#dcfce7' }, // green
  { value: '#dbeafe' }, // blue
  { value: '#f3e8ff' }, // purple
  { value: '#fce7f3' }, // pink
]

const cyberNodeColors = [
  { value: null },
  { value: '#ff3366' }, // neon red
  { value: '#ffaa00' }, // neon orange
  { value: '#ffff00' }, // neon yellow
  { value: '#00ff66' }, // neon green
  { value: '#00ccff' }, // neon blue
  { value: '#9933ff' }, // neon purple
  { value: '#ff00ff' }, // neon magenta
]

const nodeColors = computed(() => {
  return currentTheme.value === 'cyber' ? cyberNodeColors : defaultNodeColors
})

// All colors that need arrow markers (edge colors + node colors + highlight + cyber neons)
const allMarkerColors = computed(() => {
  const colors = new Set<string>()
  // Edge colors
  for (const c of edgeColorPalette.value) {
    if (c.value) colors.add(c.value)
  }
  // Node colors (both default and cyber for highlighted edges)
  for (const c of defaultNodeColors) {
    if (c.value) colors.add(c.value)
  }
  for (const c of cyberNodeColors) {
    if (c.value) colors.add(c.value)
  }
  // Cyber highlight colors (neon equivalents of pastels)
  for (const neon of Object.values(cyberHighlightColors)) {
    colors.add(neon)
  }
  // Highlight and selected colors
  colors.add(highlightColor.value)
  colors.add(selectedColor.value)
  return Array.from(colors).map(v => ({ value: v }))
})

// Frame border colors (more saturated for visibility)
const frameColors = [
  { value: null },
  { value: '#ef4444' },
  { value: '#f97316' },
  { value: '#eab308' },
  { value: '#22c55e' },
  { value: '#3b82f6' },
  { value: '#8b5cf6' },
  { value: '#ec4899' },
]

function updateNodeColor(nodeId: string, color: string | null) {
  // Use store method to persist to database
  store.updateNodeColor(nodeId, color)
}

// One-shot fit to content (does NOT enable auto_fit)
async function fitNodeNow(nodeId: string) {
  // Exit edit mode first to measure rendered view, not textarea
  const wasEditing = editingNodeId.value === nodeId
  if (wasEditing) {
    // Save content directly
    store.updateNodeContent(nodeId, editContent.value)
    // Clear editing state
    editingNodeId.value = null
    editContent.value = ''
    nodePrompt.value = ''
  }

  // Force update rendered content for this node
  const node = store.getNode(nodeId)
  if (node) {
    nodeRenderedContent.value = {
      ...nodeRenderedContent.value,
      [nodeId]: renderMarkdown(node.markdown_content)
    }
  }

  // Wait for Vue to render the view mode content
  await nextTick()
  await nextTick()

  // Poll until .node-content exists (max 500ms)
  const cardEl = document.querySelector(`[data-node-id="${nodeId}"]`)
  if (!cardEl) return

  let attempts = 0
  const waitForContent = () => {
    const contentEl = cardEl.querySelector('.node-content')
    const editorEl = cardEl.querySelector('.inline-editor')

    if (contentEl && !editorEl) {
      // Content element exists, editor gone - safe to measure
      renderMermaidDiagrams()
      setTimeout(() => fitNodeToContent(nodeId), 100)
    } else if (attempts < 10) {
      attempts++
      setTimeout(waitForContent, 50)
    }
  }
  waitForContent()
}

function selectAllNodes() {
  // Select all visible nodes (respects neighborhood mode)
  const nodeIds = displayNodes.value.map(n => n.id)
  store.selectedNodeIds.splice(0, store.selectedNodeIds.length, ...nodeIds)
}

async function deleteSelectedNodes() {
  const count = store.selectedNodeIds.length
  if (count === 0) return
  // Delete without confirm to avoid Tauri permission issues
  for (const id of [...store.selectedNodeIds]) {
    const node = store.getNode(id)
    if (node) {
      // Capture connected edges before deletion
      const connectedEdges = store.filteredEdges.filter(
        e => e.source_node_id === id || e.target_node_id === id
      )
      // Save for undo
      pushDeletionUndo(node, connectedEdges)
    }
    await store.deleteNode(id)
  }
}

// Map light colors to dark mode equivalents (subtle tints on dark background)
const darkModeColors: Record<string, string> = {
  '#fee2e2': '#3f2a2a', // red tint
  '#ffedd5': '#3d3328', // orange tint
  '#fef9c3': '#3a3826', // yellow tint
  '#dcfce7': '#2a3d2e', // green tint
  '#dbeafe': '#2a3041', // blue tint
  '#f3e8ff': '#352a41', // purple tint
  '#fce7f3': '#3d2a38', // pink tint
}

// Get appropriate node background color for current theme
function getNodeBackground(colorTheme: string | null): string | undefined {
  if (!colorTheme) return undefined
  if (isDarkMode.value && darkModeColors[colorTheme]) {
    return darkModeColors[colorTheme]
  }
  return colorTheme
}

// Prevent context menu
function onContextMenu(e: MouseEvent) {
  e.preventDefault()
}

// Export current graph/subgraph as YAML for debugging
function exportGraphAsYaml() {
  const nodes = displayNodes.value.map(n => ({
    id: n.id,
    title: n.title,
    x: n.canvas_x,
    y: n.canvas_y,
    width: n.width || NODE_DEFAULTS.WIDTH,
    height: n.height || NODE_DEFAULTS.HEIGHT,
  }))

  const edges = edgeLines.value.map(e => ({
    id: e.id,
    source: e.source_node_id,
    target: e.target_node_id,
    path: e.path,
    style: e.style,
  }))

  const yaml = `# Graph Export - ${new Date().toISOString()}
# Nodes: ${nodes.length}, Edges: ${edges.length}
# Neighborhood mode: ${neighborhoodMode.value}

nodes:
${nodes.map(n => `  - id: "${n.id}"
    title: "${n.title?.replace(/"/g, '\\"') || 'Untitled'}"
    x: ${n.x}
    y: ${n.y}
    width: ${n.width}
    height: ${n.height}`).join('\n')}

edges:
${edges.map(e => `  - id: "${e.id}"
    source: "${e.source}"
    target: "${e.target}"
    style: "${e.style}"
    path: "${e.path}"`).join('\n')}
`

  // Copy to clipboard
  navigator.clipboard.writeText(yaml).then(() => {
    console.log('[EXPORT] Graph YAML copied to clipboard')
  })
}

// Expose export function globally for debugging
;(window as any).exportGraphAsYaml = exportGraphAsYaml
</script>

<template>
  <div class="canvas-wrapper">
    <!-- Graph-level LLM prompt bar -->
    <div class="graph-llm-bar">
      <div class="llm-input-row">
        <input
          v-model="graphPrompt"
          type="text"
          placeholder="Ask about the graph..."
          class="llm-input"
          :disabled="isGraphLLMLoading"
          @keydown.enter="sendGraphPrompt"
          @keydown.up="onPromptKeydown"
          @keydown.down="onPromptKeydown"
        />
        <button class="llm-settings-btn" :class="{ active: showLLMSettings }" title="Settings" @click="showLLMSettings = !showLLMSettings">
          S
        </button>
        <button class="llm-clear-btn" title="Clear conversation memory" :class="{ active: conversationHistory.length > 0 }" @click="clearConversation">
          {{ conversationHistory.length || 'C' }}
        </button>
        <button v-if="!agentRunning" class="llm-send" :disabled="isGraphLLMLoading || !graphPrompt.trim()" @click="sendGraphPrompt">
          {{ isGraphLLMLoading ? '...' : 'Go' }}
        </button>
        <button v-else class="llm-stop" @click="stopAgent">Stop</button>
      </div>
      <!-- LLM Settings Panel -->
      <div v-if="showLLMSettings" class="llm-settings-panel">
        <div class="settings-grid">
          <label>Model</label>
          <select v-model="ollamaModel" class="settings-select">
            <option value="llama3.2">llama3.2</option>
            <option value="llama3.1">llama3.1</option>
            <option value="mistral">mistral</option>
            <option value="mistral:7b-instruct">mistral:7b-instruct</option>
            <option value="codellama">codellama</option>
            <option value="phi3">phi3</option>
            <option value="gemma2">gemma2</option>
            <option value="qwen2">qwen2</option>
          </select>
          <label>Model Context</label>
          <div class="slider-row">
            <input v-model.number="ollamaContextLength" type="range" min="1024" max="131072" step="1024" class="settings-slider" />
            <span class="slider-value">{{ (ollamaContextLength / 1024).toFixed(0) }}k</span>
          </div>
        </div>
        <div v-if="lastContextSize > 0" class="context-info">
          Last request: {{ (lastContextSize / 1000).toFixed(1) }}k chars
        </div>
        <label class="settings-label">System Prompt</label>
        <textarea v-model="customSystemPrompt" class="settings-textarea" rows="8" placeholder="Instructions for the LLM..."></textarea>
      </div>
      <!-- Agent Task List -->
      <div v-if="agentTasks.length > 0" class="agent-tasks">
        <div v-for="task in agentTasks" :key="task.id" class="agent-task" :class="task.status">
          <span class="task-status">{{ task.status === 'done' ? 'v' : task.status === 'running' ? '~' : 'o' }}</span>
          <span class="task-desc">{{ task.description }}</span>
        </div>
      </div>
      <!-- Agent activity log -->
      <div v-if="agentLog.length > 0" class="agent-log">
        <div v-for="(line, i) in agentLog" :key="i" class="log-line">{{ line }}</div>
      </div>
    </div>

    <div
      ref="canvasRef"
      class="canvas-viewport"
      :class="{ panning: isPanning }"
      :style="{ backgroundPosition: offsetX + 'px ' + offsetY + 'px', backgroundSize: (24 * scale) + 'px ' + (24 * scale) + 'px' }"
      @wheel="onWheel"
      @mousedown="onCanvasMouseDown"
      @mousemove="onCanvasMouseMove"
      @mouseenter="onCanvasMouseEnter"
      @mouseleave="onCanvasMouseLeave"
      @dblclick="onCanvasDoubleClick"
      @contextmenu="onContextMenu"
    >
    <div class="canvas-content" :style="{ transform }">
      <!-- SVG for edges -->
      <svg class="edges-layer" style="position:absolute;top:0;left:0;width:100%;height:100%;overflow:visible;">
        <defs>
          <marker v-for="color in allMarkerColors" :id="getArrowMarkerId(color.value)" :key="color.value" viewBox="0 0 10 10" markerWidth="6" markerHeight="6" refX="10" refY="5" orient="auto">
            <path d="M0,0 L10,5 L0,10 z" :fill="color.value" />
          </marker>
        </defs>

        <!-- Existing edges (simplified for large graphs) -->
        <template v-if="isLargeGraph">
          <!-- Fast rendering: paths without hit areas, markers only for highlighted -->
          <path
            v-for="edge in visibleEdgeLines"
            :key="edge.id + '-' + edge.arrowMarkerId"
            :d="edge.path"
            :stroke="edge.isHighlighted ? edge.edgeHighlightColor : edge.color"
            :stroke-width="edge.isHighlighted ? 2.5 : 1"
            :marker-end="edge.isHighlighted && !edge.isBidirectional && !edge.isShortEdge ? `url(#${edge.arrowMarkerId})` : undefined"
            fill="none"
            class="edge-line-fast"
            :class="{ 'edge-highlighted': edge.isHighlighted }"
          />
        </template>
        <template v-else>
          <g v-for="edge in visibleEdgeLines" :key="edge.id + '-' + edge.arrowMarkerId">
            <!-- Invisible wider hit area -->
            <path
              :d="edge.path"
              stroke="transparent"
              stroke-width="12"
              fill="none"
              class="edge-hit-area"
              @click="onEdgeClick($event, edge.id)"
            />
            <!-- Trunk path (thick, shared segment) - only rendered by trunk owner -->
            <path
              v-if="edgeBundling && edge.isTrunkOwner && edge.trunkPath"
              :d="edge.trunkPath"
              :stroke="edge.color"
              :stroke-width="edge.trunkStrokeWidth * edgeStrokeWidth"
              stroke-linecap="round"
              fill="none"
              class="edge-trunk"
              pointer-events="none"
            />
            <!-- Glow effect for selected edge -->
            <path
              v-if="edge.isSelected"
              :d="edge.path"
              :stroke="edge.color"
              :stroke-width="edge.glowStrokeWidth"
              stroke-linecap="round"
              fill="none"
              class="edge-glow"
              opacity="0.3"
              pointer-events="none"
            />
            <!-- Visible edge path (branch for bundled, full path for unbundled) -->
            <path
              :d="edge.path"
              :stroke="edge.isHighlighted ? edge.edgeHighlightColor : edge.color"
              :stroke-width="edge.renderStrokeWidth"
              :marker-end="edge.isBidirectional || edge.isShortEdge ? undefined : `url(#${edge.arrowMarkerId})`"
              stroke-linecap="round"
              fill="none"
              class="edge-line-visible"
              :class="{ 'edge-selected': edge.isSelected, 'edge-highlighted': edge.isHighlighted }"
              pointer-events="none"
            />
            <text
              v-if="edge.label"
              :x="(edge.x1 + edge.x2) / 2"
              :y="(edge.y1 + edge.y2) / 2 - 8"
              class="edge-label"
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

        <!-- Edge preview while creating -->
        <line
          v-if="isCreatingEdge && edgeStartNode"
          :x1="(store.getNode(edgeStartNode)?.canvas_x || 0) + 100"
          :y1="(store.getNode(edgeStartNode)?.canvas_y || 0) + 40"
          :x2="edgePreviewEnd.x"
          :y2="edgePreviewEnd.y"
          :stroke="highlightColor"
          stroke-width="2"
          stroke-dasharray="8,4"
        />
      </svg>

      <!-- Frames -->
      <div
        v-for="frame in store.filteredFrames"
        :key="'frame-' + frame.id"
        class="canvas-frame"
        :class="{ selected: store.selectedFrameId === frame.id }"
        :style="{
          transform: `translate(${frame.canvas_x}px, ${frame.canvas_y}px)`,
          width: frame.width + 'px',
          height: frame.height + 'px',
          borderColor: frame.color || 'var(--border-default)',
        }"
        @mousedown.stop="onFrameMouseDown($event, frame.id)"
        @dblclick.stop="startEditingFrameTitle(frame.id)"
      >
        <div class="frame-header">
          <input
            v-if="editingFrameId === frame.id"
            v-model="editFrameTitle"
            class="frame-title-editor"
            @blur="saveFrameTitleEditing"
            @keydown.enter="saveFrameTitleEditing"
            @keydown.escape="cancelFrameTitleEditing"
            @click.stop
            @mousedown.stop
          />
          <span v-else class="frame-title">{{ frame.title }}</span>
          <div v-if="store.selectedFrameId === frame.id && editingFrameId !== frame.id" class="frame-color-picker" @mousedown.stop>
            <button
              v-for="color in frameColors"
              :key="color.value || 'default'"
              class="frame-color-dot"
              :class="{ active: frame.color === color.value }"
              :style="{ background: color.value || 'var(--border-default)' }"
              @click.stop="store.updateFrameColor(frame.id, color.value)"
            ></button>
          </div>
          <button
            v-if="store.selectedFrameId === frame.id && editingFrameId !== frame.id"
            class="frame-delete-btn"
            title="Delete frame"
            @click.stop="deleteSelectedFrame"
          >x</button>
        </div>
        <div class="frame-resize-handle" @mousedown.stop="startFrameResize($event, frame.id)"></div>
      </div>

      <!-- Node cards (viewport culled for performance) -->
      <div
        v-for="node in visibleNodes"
        :key="node.id"
        :data-node-id="node.id"
        class="node-card"
        :class="{
          selected: store.selectedNodeIds.includes(node.id),
          dragging: draggingNode === node.id,
          resizing: resizingNode === node.id,
          editing: editingNodeId === node.id,
          collapsed: isSemanticZoomCollapsed,
          'neighborhood-mode': neighborhoodMode,
          'neighborhood-focus': neighborhoodMode && node.id === focusNodeId
        }"
        :style="{
          transform: `translate3d(${resizingNode === node.id ? resizePreview.x : node.canvas_x}px, ${resizingNode === node.id ? resizePreview.y : node.canvas_y}px, 0)`,
          width: (resizingNode === node.id ? resizePreview.width : (node.width || NODE_DEFAULTS.WIDTH)) + 'px',
          height: (resizingNode === node.id ? resizePreview.height : (node.height || NODE_DEFAULTS.HEIGHT)) + 'px',
          ...(node.color_theme ? { background: getNodeBackground(node.color_theme) } : {}),
        }"
        @mousedown="onNodeMouseDown($event, node.id)"
        @mouseenter="onNodeMouseEnter($event, node.id)"
        @mousemove="onNodeMouseMove($event)"
        @mouseleave="hoveredNodeId = null"
        @dblclick.stop="startEditing(node.id)"
      >
        <!-- Image thumbnail when zoomed out -->
        <div
          v-if="showImageThumbnail && nodeFirstImage[node.id]"
          class="node-thumbnail"
        >
          <img :src="nodeFirstImage[node.id]!" :alt="node.title" />
        </div>
        <!-- Node title header (hidden when showing thumbnail) -->
        <div v-else class="node-header" @dblclick.stop="startEditingTitle(node.id)">
          <input
            v-if="editingTitleId === node.id"
            v-model="editTitle"
            class="title-editor"
            @blur="saveTitleEditing"
            @keydown.enter="saveTitleEditing"
            @keydown.escape="cancelTitleEditing"
            @click.stop
            @mousedown.stop
          />
          <span v-else>{{ node.title || 'Untitled' }}</span>
        </div>
        <!-- Editing mode (disabled when collapsed) -->
        <textarea
          v-if="editingNodeId === node.id && !isSemanticZoomCollapsed"
          v-model="editContent"
          class="inline-editor"
          placeholder="Write markdown..."
          @blur="saveEditing($event)"
          @keydown="onEditorKeydown"
        ></textarea>
        <!-- View mode - hidden when collapsed for performance -->
        <div
          v-else-if="!isSemanticZoomCollapsed"
          class="node-content"
          @click="handleContentClick"
          v-html="nodeRenderedContent[node.id] || ''"
        ></div>

        <!-- Color palette and options (shown when selected or editing) -->
        <div v-if="store.selectedNodeIds.includes(node.id) || editingNodeId === node.id" class="node-color-bar" @mousedown.prevent>
          <button
            v-for="color in nodeColors"
            :key="color.value || 'default'"
            class="color-dot"
            :class="{ active: node.color_theme === color.value }"
            :style="{ background: color.value || 'var(--bg-surface)' }"
            @click.stop="updateNodeColor(node.id, color.value)"
          ></button>
          <span class="color-bar-sep"></span>
          <button
            class="autofit-toggle"
            title="Fit node to content"
            @click.stop="fitNodeNow(node.id)"
          >Fit</button>
        </div>

        <!-- Delete button (shown when selected but not editing) -->
        <button
          v-if="store.selectedNodeIds.includes(node.id) && editingNodeId !== node.id"
          class="delete-node-btn"
          @mousedown.stop="deleteSelectedNodes"
        >x</button>

        <!-- Resize handles - edges -->
        <div class="resize-edge resize-edge-n" @mousedown.stop="onResizeMouseDown($event, node.id, 'n')"></div>
        <div class="resize-edge resize-edge-s" @mousedown.stop="onResizeMouseDown($event, node.id, 's')"></div>
        <div class="resize-edge resize-edge-e" @mousedown.stop="onResizeMouseDown($event, node.id, 'e')"></div>
        <div class="resize-edge resize-edge-w" @mousedown.stop="onResizeMouseDown($event, node.id, 'w')"></div>
        <!-- Resize handles - corners -->
        <div class="resize-corner resize-corner-nw" @mousedown.stop="onResizeMouseDown($event, node.id, 'nw')"></div>
        <div class="resize-corner resize-corner-ne" @mousedown.stop="onResizeMouseDown($event, node.id, 'ne')"></div>
        <div class="resize-corner resize-corner-se" @mousedown.stop="onResizeMouseDown($event, node.id, 'se')"></div>
        <div class="resize-corner resize-corner-sw" @mousedown.stop="onResizeMouseDown($event, node.id, 'sw')"></div>
      </div>

      <!-- Empty state (positioned in viewport, not canvas) -->

      <!-- Floating Node LLM bar (above selected/editing node) -->
      <div
        v-if="(store.selectedNodeIds.length === 1 || editingNodeId) && getVisualNode(store.selectedNodeIds[0] || editingNodeId!)"
        class="node-llm-bar-floating"
        :style="{
          transform: `translate(${getVisualNode(store.selectedNodeIds[0] || editingNodeId!)!.canvas_x}px, ${getVisualNode(store.selectedNodeIds[0] || editingNodeId!)!.canvas_y - 40}px)`,
          width: (getVisualNode(store.selectedNodeIds[0] || editingNodeId!)!.width || NODE_DEFAULTS.WIDTH) + 'px'
        }"
        @mousedown.stop
        @click.stop
      >
        <input
          v-model="nodePrompt"
          type="text"
          :placeholder="isNodeLLMLoading ? 'Processing...' : 'Ask AI to update this note...'"
          class="node-llm-input"
          :class="{ loading: isNodeLLMLoading }"
          tabindex="0"
          :disabled="isNodeLLMLoading"
          @mousedown.stop
          @keydown.enter.stop="sendNodePrompt"
          @keydown.stop
        />
        <button
          v-if="!isNodeLLMLoading"
          class="node-llm-send"
          tabindex="0"
          :disabled="!nodePrompt.trim()"
          @mousedown.stop
          @click.stop="sendNodePrompt"
        >
          AI
        </button>
        <button
          v-else
          class="node-llm-stop"
          tabindex="0"
          @mousedown.stop
          @click.stop="stopNodeLLM"
        >
          Stop
        </button>
      </div>
    </div>

    <!-- Edge edit panel -->
    <div v-if="selectedEdge" class="edge-panel" @mousedown.stop @click.stop @dblclick.stop @pointerdown.stop>
      <div class="edge-panel-header">
        <span>Edge</span>
        <button @click="selectedEdge = null">x</button>
      </div>
      <div class="edge-panel-content">
        <label>Label:</label>
        <input
          type="text"
          :value="store.filteredEdges.find(e => e.id === selectedEdge)?.label || ''"
          placeholder="e.g. depends on"
          class="edge-label-input"
          @input="changeEdgeLabel(($event.target as HTMLInputElement).value)"
        />
        <label>Color:</label>
        <div class="edge-color-picker">
          <button
            v-for="color in edgeColorPalette"
            :key="color.value"
            class="edge-color-dot"
            :class="{ active: getEdgeColor(store.filteredEdges.find(e => e.id === selectedEdge) || { link_type: '' }) === color.value }"
            :style="{ background: color.value }"
            @click.stop="changeEdgeColor(color.value)"
          ></button>
        </div>
        <label>Style:</label>
        <div class="edge-style-picker">
          <button
            v-for="style in edgeStyles"
            :key="style.value"
            class="edge-style-btn"
            :class="{ active: getEdgeStyle(selectedEdge || '') === style.value }"
            @click.stop="setEdgeStyle(style.value)"
          >{{ style.label }}</button>
        </div>
        <label>Direction:</label>
        <div class="direction-btns">
          <button title="Reverse direction" @click.stop="reverseEdge">Flip</button>
          <button
            v-if="isEdgeBidirectional(selectedEdge || '')"
            title="Make directional (one-way)"
            @click.stop="makeUnidirectional"
          >Directional</button>
          <button
            v-else
            title="Make non-directional (both ways)"
            @click.stop="makeBidirectional"
          >Non-directional</button>
        </div>
        <button class="insert-node-btn" @click="insertNodeOnEdge">Insert Node</button>
        <button class="delete-edge-btn" @click="deleteSelectedEdge">Delete Edge</button>
      </div>
    </div>

    <!-- Controls -->
    <div class="zoom-controls" @mousedown.stop>
      <button data-tooltip="Zoom In" @click="scale = Math.min(scale * 1.25, 3)">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
      </button>
      <span>{{ Math.round(scale * 100) }}%</span>
      <button data-tooltip="Zoom Out" @click="scale = Math.max(scale * 0.8, 0.1)">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="5" y1="12" x2="19" y2="12"/></svg>
      </button>
      <button data-tooltip="Fit to Content - Show all nodes" @click="fitToContent">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>
      </button>
      <button
        :class="{ active: gridLockEnabled }"
        data-tooltip="Snap to Grid - Align nodes to grid when dragging"
        @click="gridLockEnabled = !gridLockEnabled"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
      </button>
      <button data-tooltip="Grid Layout - Arrange nodes in a grid" @click="autoLayoutNodes('grid')">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="5" height="5"/><rect x="10" y="3" width="5" height="5"/><rect x="17" y="3" width="5" height="5"/><rect x="3" y="10" width="5" height="5"/><rect x="10" y="10" width="5" height="5"/><rect x="17" y="10" width="5" height="5"/></svg>
      </button>
      <button data-tooltip="Force Layout - Arrange by connections" @click="autoLayoutNodes('force')">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="6" cy="6" r="3"/><circle cx="18" cy="6" r="3"/><circle cx="12" cy="18" r="3"/><line x1="8" y1="8" x2="10" y2="16"/><line x1="16" y1="8" x2="14" y2="16"/><line x1="9" y1="6" x2="15" y2="6"/></svg>
      </button>
      <button data-tooltip="Fit Nodes to Content - Resize all nodes to show full content" @click="fitAllNodesToContent">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18"/><path d="M3 9h18"/></svg>
      </button>
      <button
        :class="{ active: true }"
        :disabled="isLargeGraph"
        :data-tooltip="`Edge Style: ${globalEdgeStyle} - Click to cycle (diagonal → orthogonal)`"
        @click="cycleEdgeStyle"
      >
        <svg v-if="globalEdgeStyle === 'diagonal'" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 20 L12 12 L20 12 L20 4"/></svg>
        <svg v-else-if="globalEdgeStyle === 'orthogonal'" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 20 L4 12 L20 12 L20 4"/></svg>
        <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 20 Q4 12 12 12 Q20 12 20 4"/></svg>
      </button>
      <button
        :class="{ active: edgeBundling }"
        data-tooltip="Edge Bundling - Merge edges with shared endpoints"
        @click="toggleEdgeBundling"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M4 4 L12 12 L4 20"/>
          <path d="M8 4 L12 12 L8 20"/>
          <line x1="12" y1="12" x2="20" y2="12" stroke-width="3"/>
        </svg>
      </button>
      <button
        :class="{ active: magnifierEnabled }"
        data-tooltip="Magnifier - Show magnified view when zoomed out"
        @click="toggleMagnifier"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="10" cy="10" r="7"/>
          <line x1="15" y1="15" x2="21" y2="21"/>
        </svg>
      </button>
      <button
        :class="{ active: neighborhoodMode }"
        data-tooltip="Neighborhood View - Show only selected node and neighbors (N)"
        @mousedown.stop.prevent="toggleNeighborhoodMode()"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="4"/>
          <circle cx="4" cy="8" r="2"/>
          <circle cx="20" cy="8" r="2"/>
          <circle cx="4" cy="16" r="2"/>
          <circle cx="20" cy="16" r="2"/>
          <line x1="8" y1="10" x2="6" y2="9"/>
          <line x1="16" y1="10" x2="18" y2="9"/>
          <line x1="8" y1="14" x2="6" y2="15"/>
          <line x1="16" y1="14" x2="18" y2="15"/>
        </svg>
      </button>
      <select
        v-if="neighborhoodMode"
        class="depth-select"
        :value="neighborhoodDepth"
        @change="setDepth(Number(($event.target as HTMLSelectElement).value))"
        data-tooltip="Neighborhood depth (hops)"
      >
        <option value="1">1 hop</option>
        <option value="2">2 hops</option>
        <option value="3">3 hops</option>
        <option value="4">4 hops</option>
        <option value="5">5 hops</option>
      </select>
      <button data-tooltip="Add Frame - Group selected nodes" @click="createFrameAtCenter">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="3" x2="9" y2="21"/></svg>
      </button>
    </div>

    <div class="status-bar">
      <span v-if="pdfDrop.isProcessing.value" class="pdf-processing">
        PDF: {{ pdfDrop.processingStatus.value }}
        <button class="stop-btn" @click="pdfDrop.stop()">Stop</button>
      </span>
      <span v-if="pdfDrop.isProcessing.value" class="sep">|</span>
      <span v-if="isLargeGraph" class="perf-mode">PERF</span>
      <span>{{ visibleNodes.length }}/{{ store.filteredNodes.length }} nodes</span>
      <span class="sep">|</span>
      <span>{{ edgeLines.length }}/{{ store.filteredEdges.length }} edges</span>
      <span class="sep">|</span>
      <!-- Node agent mode toggle -->
      <button
        class="agent-mode-toggle"
        :class="{ active: nodeAgentMode === 'agent' }"
        @click="nodeAgentMode = nodeAgentMode === 'simple' ? 'agent' : 'simple'"
        :title="nodeAgentMode === 'simple' ? 'Simple mode: direct LLM responses' : 'Agent mode: LLM with tools (web search, edit)'"
      >
        {{ nodeAgentMode === 'simple' ? 'Simple' : 'Agent' }}
      </button>
      <button
        v-if="nodeAgent.log.value.length > 0"
        class="agent-log-toggle"
        @click="showNodeAgentLog = !showNodeAgentLog"
        :title="showNodeAgentLog ? 'Hide agent log' : 'Show agent log'"
      >
        Log ({{ nodeAgent.log.value.length }})
      </button>
      <span class="sep">|</span>
      <span class="hint">Scroll up/down: zoom | Scroll sideways: pan | Alt+drag: link | Dbl-click: new</span>
    </div>

    <!-- Node agent log panel (fixed position) -->
    <div
      v-if="showNodeAgentLog && nodeAgent.log.value.length > 0"
      class="node-agent-log-panel"
      @mousedown.stop
    >
      <div class="log-header">
        <span>Agent Log</span>
        <button @click="showNodeAgentLog = false">x</button>
      </div>
      <div class="log-content">
        <div v-for="(line, i) in nodeAgent.log.value" :key="i" class="log-line">{{ line }}</div>
      </div>
    </div>

    <!-- SVG filter for fisheye warp effect -->
    <svg width="0" height="0" style="position: absolute;">
      <defs>
        <filter id="fisheye-warp" x="-50%" y="-50%" width="200%" height="200%">
          <!-- Slight barrel distortion effect -->
          <feGaussianBlur in="SourceGraphic" stdDeviation="0" result="blur" />
          <feDisplacementMap
            in="blur"
            in2="SourceGraphic"
            scale="0"
            xChannelSelector="R"
            yChannelSelector="G"
          />
        </filter>
      </defs>
    </svg>

    <!-- Magnifying lens (when zoomed out far) -->
    <div
      v-if="shouldShowMagnifier && magnifierVisibleNodes.length > 0"
      class="magnifier"
      :style="{
        left: (magnifierPos.x - MAGNIFIER_SIZE / 2) + 'px',
        top: (magnifierPos.y - MAGNIFIER_SIZE / 2) + 'px',
        width: MAGNIFIER_SIZE + 'px',
        height: MAGNIFIER_SIZE + 'px',
      }"
    >
      <div class="magnifier-warp">
        <div
          v-for="node in magnifierVisibleNodes"
          :key="'mag-' + node.id"
          class="magnifier-node"
          :style="{
            left: ((node.canvas_x - (magnifierPos.x - offsetX) / scale) * MAGNIFIER_ZOOM + MAGNIFIER_SIZE / 2) + 'px',
            top: ((node.canvas_y - (magnifierPos.y - offsetY) / scale) * MAGNIFIER_ZOOM + MAGNIFIER_SIZE / 2) + 'px',
            width: ((node.width || NODE_DEFAULTS.WIDTH) * MAGNIFIER_ZOOM) + 'px',
            height: ((node.height || NODE_DEFAULTS.HEIGHT) * MAGNIFIER_ZOOM) + 'px',
            background: node.color_theme || '#ffffff',
          }"
        >
          <span class="magnifier-node-title">{{ node.title || 'Untitled' }}</span>
        </div>
      </div>
    </div>

    <!-- Hover tooltip (when zoomed out) -->
    <div
      v-if="showHoverTooltip && hoveredNode"
      class="hover-tooltip"
      :style="{
        left: (hoverMousePos.x + 16) + 'px',
        top: (hoverMousePos.y + 16) + 'px',
      }"
    >
      <div class="hover-tooltip-title">{{ hoveredNode.title || 'Untitled' }}</div>
      <div v-if="tooltipContent" class="hover-tooltip-content">
        {{ tooltipContent }}{{ tooltipContent.length >= 200 ? '...' : '' }}
      </div>
    </div>

    <!-- Minimap -->
    <div
      v-if="store.filteredNodes.length > 0"
      class="minimap"
      @click="onMinimapClick"
    >
      <svg :width="minimap.MINIMAP_SIZE" :height="minimap.MINIMAP_SIZE">
        <!-- Nodes -->
        <rect
          v-for="node in store.filteredNodes"
          :key="'mm-' + node.id"
          :x="minimap.getNodePosition(node).x"
          :y="minimap.getNodePosition(node).y"
          :width="minimap.getNodePosition(node).width"
          :height="minimap.getNodePosition(node).height"
          :fill="node.color_theme || 'var(--text-muted)'"
          :opacity="minimap.isSelected(node.id) ? 1 : 0.6"
          rx="1"
        />
        <!-- Viewport indicator -->
        <rect
          :x="minimap.viewport.x"
          :y="minimap.viewport.y"
          :width="minimap.viewport.width"
          :height="minimap.viewport.height"
          fill="none"
          stroke="var(--primary-color)"
          stroke-width="2"
          rx="2"
        />
      </svg>
    </div>

    <!-- Empty state overlay -->
    <div v-if="store.filteredNodes.length === 0" class="empty-state-overlay">
      <div class="empty-state-box">
        <h3>No nodes yet</h3>
        <p>Double-click anywhere to create a node</p>
      </div>
    </div>
    </div>
  </div>
</template>

<style src="./PixiCanvas.css" scoped></style>
