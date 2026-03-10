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
  routeDiagonal,
  routeOrthogonal,
  findObstacles,
  findObstaclesInRegion,
  PORT_SPACING,
  OBSTACLE_MARGIN,
  type NodeRect,
  type EdgeStyle,
} from './edgeRouting'
import { useLLM, executeTool, type ToolContext } from './llm'
import { uiStorage } from '../lib/storage'
import { canvasLogger } from '../lib/logger'
import { useMinimap } from './composables/useMinimap'
import { measureNodeContent } from './utils/nodeSizing'
import { useAgentRunner, type AgentContext } from './composables/useAgentRunner'

// Undo injection for position and content changes
const injectedPushUndo = inject<(() => void) | undefined>('pushUndo')
const injectedPushContentUndo = inject<((nodeId: string, oldContent: string | null, oldTitle: string) => void) | undefined>('pushContentUndo')

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

// Configure marked
marked.use({
  gfm: true,
  breaks: true,
})

const store = useNodesStore()

// Reactive theme tracking
const isDarkMode = ref(false)

function updateTheme() {
  isDarkMode.value = document.documentElement.getAttribute('data-theme') === 'dark'
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
  }
  window.addEventListener('keydown', handleKeydown)

  onUnmounted(() => {
    observer.disconnect()
    window.removeEventListener('resize', updateViewportSize)
    window.removeEventListener('keydown', handleKeydown)
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
})

// Viewport size for culling (updated on resize)
const viewportWidth = ref(window.innerWidth)
const viewportHeight = ref(window.innerHeight)

// Only render nodes visible in viewport (with margin for smooth scrolling)
const visibleNodes = computed(() => {
  const margin = 500 // Large margin to prevent edge flickering during pan/zoom
  const s = scale.value
  const ox = offsetX.value
  const oy = offsetY.value

  // Viewport bounds in canvas coordinates
  const viewLeft = -ox / s - margin
  const viewTop = -oy / s - margin
  const viewRight = (viewportWidth.value - ox) / s + margin
  const viewBottom = (viewportHeight.value - oy) / s + margin

  // Use displayNodes which respects neighborhood mode
  return displayNodes.value.filter(node => {
    const nodeRight = node.canvas_x + (node.width || 200)
    const nodeBottom = node.canvas_y + (node.height || 120)
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

// Neighborhood view mode - show only focus node and its direct neighbors
const neighborhoodMode = ref(false)
const focusNodeId = ref<string | null>(null)
// Local positions for neighborhood view (independent from global positions)
const neighborhoodPositions = ref<Map<string, { x: number; y: number }>>(new Map())

// Get IDs of nodes directly connected to focus node
const neighborhoodNodeIds = computed(() => {
  if (!neighborhoodMode.value || !focusNodeId.value) return null

  const neighbors = new Set<string>([focusNodeId.value])
  for (const edge of store.filteredEdges) {
    if (edge.source_node_id === focusNodeId.value) {
      neighbors.add(edge.target_node_id)
    }
    if (edge.target_node_id === focusNodeId.value) {
      neighbors.add(edge.source_node_id)
    }
  }
  return neighbors
})

// Nodes to display (filtered by neighborhood if active, with local positions)
const displayNodes = computed(() => {
  if (neighborhoodNodeIds.value) {
    const positions = neighborhoodPositions.value
    return store.filteredNodes
      .filter(n => neighborhoodNodeIds.value!.has(n.id))
      .map(n => {
        const pos = positions.get(n.id)
        if (pos) {
          return { ...n, canvas_x: pos.x, canvas_y: pos.y }
        }
        return n
      })
  }
  return store.filteredNodes
})

// Graph size thresholds - use displayNodes count so neighborhood mode gets proper routing
// In neighborhood mode, always use full routing since we have few nodes
const isLargeGraph = computed(() => !neighborhoodMode.value && (displayNodes.value.length > 200 || store.filteredEdges.length > 500))
const isVeryLargeGraph = computed(() => !neighborhoodMode.value && displayNodes.value.length > 500)
const isHugeGraph = computed(() => !neighborhoodMode.value && displayNodes.value.length > 350)
const isMassiveGraph = computed(() => !neighborhoodMode.value && (displayNodes.value.length > 300 || store.filteredEdges.length > 800))

// Get visual node (with correct position accounting for neighborhood mode)
function getVisualNode(nodeId: string) {
  return displayNodes.value.find(n => n.id === nodeId)
}

// Toggle neighborhood mode for a node
function toggleNeighborhoodMode(nodeId?: string) {
  const targetId = nodeId || store.selectedNodeIds[0] || focusNodeId.value

  // If already in neighborhood mode and clicking the same node (or no node specified), exit
  if (neighborhoodMode.value && (!nodeId || focusNodeId.value === targetId)) {
    neighborhoodMode.value = false
    focusNodeId.value = null
    neighborhoodPositions.value = new Map()
  } else if (targetId) {
    // Enter or navigate to new focus
    focusNodeId.value = targetId
    layoutNeighborhood(targetId)
    neighborhoodMode.value = true
  }
}

// Layout neighborhood nodes with focus node centered (uses local positions, not store)
function layoutNeighborhood(focusId: string): boolean {
  const rect = canvasRef.value?.getBoundingClientRect()
  if (!rect) return false

  const focusNode = store.getNode(focusId)
  if (!focusNode) return false

  // Categorize neighbors:
  // - Parents (top): nodes that ONLY link TO focus
  // - Siblings (left/right): nodes with bidirectional edges
  // - Children (bottom): nodes that focus ONLY links TO
  const incomingFrom = new Set<string>() // nodes that link TO focus
  const outgoingTo = new Set<string>()   // nodes that focus links TO

  for (const edge of store.filteredEdges) {
    if (edge.target_node_id === focusId && edge.source_node_id !== focusId) {
      incomingFrom.add(edge.source_node_id)
    }
    if (edge.source_node_id === focusId && edge.target_node_id !== focusId) {
      outgoingTo.add(edge.target_node_id)
    }
  }

  const parents: string[] = []   // only incoming
  const children: string[] = []  // only outgoing
  const siblings: string[] = []  // both directions

  for (const id of incomingFrom) {
    if (outgoingTo.has(id)) {
      siblings.push(id)
    } else {
      parents.push(id)
    }
  }
  for (const id of outgoingTo) {
    if (!incomingFrom.has(id)) {
      children.push(id)
    }
  }

  // Calculate center of viewport in canvas coordinates
  const viewCenterX = (rect.width / 2 - offsetX.value) / scale.value
  const viewCenterY = (rect.height / 2 - offsetY.value) / scale.value

  // Hierarchical layout - focus in center, parents above, children below
  const positions = new Map<string, { x: number; y: number }>()
  const focusWidth = focusNode.width || 200
  const focusHeight = focusNode.height || 120
  const verticalGap = 200 // Vertical distance between rows
  const horizontalGap = 50 // Horizontal gap between nodes in same row

  // Focus node at center (position is top-left corner)
  positions.set(focusId, {
    x: viewCenterX - focusWidth / 2,
    y: viewCenterY - focusHeight / 2,
  })

  // Layout parents in a row above the focus node
  if (parents.length > 0) {
    const totalWidth = parents.reduce((sum, id) => {
      const n = store.getNode(id)
      return sum + (n?.width || 200) + horizontalGap
    }, -horizontalGap)
    let xOffset = viewCenterX - totalWidth / 2

    parents.forEach(parentId => {
      const n = store.getNode(parentId)
      const nodeWidth = n?.width || 200
      const nodeHeight = n?.height || 120
      positions.set(parentId, {
        x: xOffset,
        y: viewCenterY - focusHeight / 2 - verticalGap - nodeHeight,
      })
      xOffset += nodeWidth + horizontalGap
    })
  }

  // Layout children in a row below the focus node
  if (children.length > 0) {
    const totalWidth = children.reduce((sum, id) => {
      const n = store.getNode(id)
      return sum + (n?.width || 200) + horizontalGap
    }, -horizontalGap)
    let xOffset = viewCenterX - totalWidth / 2

    children.forEach(childId => {
      const n = store.getNode(childId)
      const nodeWidth = n?.width || 200
      positions.set(childId, {
        x: xOffset,
        y: viewCenterY + focusHeight / 2 + verticalGap,
      })
      xOffset += nodeWidth + horizontalGap
    })
  }

  // Layout siblings (bidirectional) on left and right of focus
  if (siblings.length > 0) {
    const horizontalDistance = 350 // Distance from focus center to sibling center
    const verticalSpacing = 30 // Vertical gap between stacked siblings

    // Split siblings: odd indices left, even indices right
    const leftSiblings = siblings.filter((_, i) => i % 2 === 0)
    const rightSiblings = siblings.filter((_, i) => i % 2 === 1)

    // Layout left siblings
    const leftTotalHeight = leftSiblings.reduce((sum, id) => {
      const n = store.getNode(id)
      return sum + (n?.height || 120) + verticalSpacing
    }, -verticalSpacing)
    let yOffset = viewCenterY - leftTotalHeight / 2

    leftSiblings.forEach(sibId => {
      const n = store.getNode(sibId)
      const nodeWidth = n?.width || 200
      const nodeHeight = n?.height || 120
      positions.set(sibId, {
        x: viewCenterX - horizontalDistance - nodeWidth / 2,
        y: yOffset,
      })
      yOffset += nodeHeight + verticalSpacing
    })

    // Layout right siblings
    const rightTotalHeight = rightSiblings.reduce((sum, id) => {
      const n = store.getNode(id)
      return sum + (n?.height || 120) + verticalSpacing
    }, -verticalSpacing)
    yOffset = viewCenterY - rightTotalHeight / 2

    rightSiblings.forEach(sibId => {
      const n = store.getNode(sibId)
      const nodeWidth = n?.width || 200
      const nodeHeight = n?.height || 120
      positions.set(sibId, {
        x: viewCenterX + horizontalDistance - nodeWidth / 2,
        y: yOffset,
      })
      yOffset += nodeHeight + verticalSpacing
    })
  }

  // Store positions locally (not in store)
  neighborhoodPositions.value = positions

  // Center view on the focus node
  const focusPos = positions.get(focusId)
  if (focusPos) {
    const nodeCenterX = focusPos.x + (focusNode.width || 200) / 2
    const nodeCenterY = focusPos.y + (focusNode.height || 120) / 2

    // Set offset so node center is at viewport center
    offsetX.value = rect.width / 2 - nodeCenterX * scale.value
    offsetY.value = rect.height / 2 - nodeCenterY * scale.value
  }
  return true
}

// Semantic zoom collapse - hide content for massive graphs when zoomed out
const isSemanticZoomCollapsed = computed(() => isMassiveGraph.value && scale.value < 0.6)

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
    const nodeRight = node.canvas_x + (node.width || 200)
    const nodeBottom = node.canvas_y + (node.height || 120)
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
    width: n.width || 200,
    height: n.height || 120,
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
const isPanning = ref(false)
const panStart = ref({ x: 0, y: 0, offsetX: 0, offsetY: 0 })
const selectedEdge = ref<string | null>(null)
const hoveredNodeId = ref<string | null>(null)

// Check if an edge is connected to a hovered or selected node
function isEdgeHighlighted(edge: { source_node_id: string, target_node_id: string }): boolean {
  const activeNodes = new Set<string>()
  if (hoveredNodeId.value) activeNodes.add(hoveredNodeId.value)
  for (const id of store.selectedNodeIds) activeNodes.add(id)
  if (activeNodes.size === 0) return false
  return activeNodes.has(edge.source_node_id) || activeNodes.has(edge.target_node_id)
}

// Edge creation
const isCreatingEdge = ref(false)
const edgeStartNode = ref<string | null>(null)
const edgePreviewEnd = ref({ x: 0, y: 0 })

// Prevent double-click node creation right after drag
let lastDragEndTime = 0

// Node resizing (supports multiple selected nodes)
const resizingNode = ref<string | null>(null)
const resizeStart = ref({ x: 0, y: 0, width: 0, height: 0 })
const resizePreview = ref({ width: 0, height: 0 })
const multiResizeInitial = ref<Map<string, { width: number, height: number }>>(new Map())

// Frame interaction
const draggingFrame = ref<string | null>(null)
const frameDragStart = ref({ x: 0, y: 0, frameX: 0, frameY: 0 })
const frameContainedNodes = ref<Map<string, { x: number, y: number }>>(new Map())
const resizingFrame = ref<string | null>(null)
const frameResizeStart = ref({ x: 0, y: 0, width: 0, height: 0 })
const editingFrameId = ref<string | null>(null)
const editFrameTitle = ref('')

// Gridlock (snap to grid)
const gridLockEnabled = ref(false)

// Lasso selection
const isLassoSelecting = ref(false)
const lassoPoints = ref<{ x: number; y: number }[]>([])

function startLasso(e: MouseEvent) {
  isLassoSelecting.value = true
  lassoPoints.value = [screenToCanvas(e.clientX, e.clientY)]
}

function updateLasso(e: MouseEvent) {
  if (!isLassoSelecting.value) return
  lassoPoints.value.push(screenToCanvas(e.clientX, e.clientY))
}

function endLasso() {
  if (!isLassoSelecting.value || lassoPoints.value.length < 3) {
    isLassoSelecting.value = false
    lassoPoints.value = []
    return
  }

  // Find nodes inside lasso polygon
  const selected: string[] = []
  for (const node of store.filteredNodes) {
    const cx = node.canvas_x + node.width / 2
    const cy = node.canvas_y + node.height / 2
    if (pointInPolygon(cx, cy, lassoPoints.value)) {
      selected.push(node.id)
    }
  }

  store.selectedNodeIds.splice(0, store.selectedNodeIds.length, ...selected)
  isLassoSelecting.value = false
  lassoPoints.value = []
}

function pointInPolygon(x: number, y: number, polygon: { x: number; y: number }[]): boolean {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x, yi = polygon[i].y
    const xj = polygon[j].x, yj = polygon[j].y
    if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) {
      inside = !inside
    }
  }
  return inside
}

const gridSize = 20 // Snap to 20px grid

function snapToGrid(value: number): number {
  if (!gridLockEnabled.value) return value
  return Math.round(value / gridSize) * gridSize
}

// Auto-fit is per-node (stored on node.auto_fit)

function fitNodeToContent(nodeId: string) {
  const node = store.getNode(nodeId)
  if (!node) return

  const cardEl = document.querySelector(`[data-node-id="${nodeId}"]`) as HTMLElement
  if (!cardEl) return

  const result = measureNodeContent(cardEl, node.width || 200)
  if (!result) return

  store.updateNodeSize(nodeId, result.width, result.height)

  // In neighborhood mode, re-layout to adapt to new sizes
  if (neighborhoodMode.value && focusNodeId.value) {
    setTimeout(() => layoutNeighborhood(focusNodeId.value!), 10)
  }
}

// Auto-fit after mermaid renders (only for nodes with auto_fit enabled)
function autoFitAllNodes() {
  setTimeout(() => {
    for (const node of store.filteredNodes) {
      if (node.auto_fit && node.markdown_content?.includes('```mermaid')) {
        fitNodeToContent(node.id)
      }
    }
  }, 100)
}

// Fit all visible nodes to their content (auto-expand to show all content)
function fitAllNodesToContent() {
  // Wait for DOM to render
  setTimeout(() => {
    for (const node of store.filteredNodes) {
      fitNodeToContent(node.id)
    }
    // Trigger edge re-routing after sizes change
    store.nodeLayoutVersion++
  }, 50)
}

// Reset all nodes to default size (200x120)
async function resetAllNodeSizes() {
  for (const node of store.filteredNodes) {
    await store.updateNodeSize(node.id, 200, 120)
  }
  store.nodeLayoutVersion++
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
          await store.updateNodeContent(node.id, query)
          results.push(`${node.title}: set`)
        } else if (args.action === 'append') {
          await store.updateNodeContent(node.id, (node.markdown_content || '') + '\n\n' + query)
          results.push(`${node.title}: appended`)
        } else if (args.action === 'llm') {
          try {
            const resp = await fetch('http://localhost:11434/api/chat', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                model: ollamaModel.value,
                messages: [{ role: 'system', content: 'Provide concise, factual information.' }, { role: 'user', content: query }],
                stream: false,
              }),
            })
            const data = await resp.json()
            if (data.message?.content) {
              await store.updateNodeContent(node.id, data.message.content.trim())
              results.push(`${node.title}: generated`)
            }
          } catch { results.push(`${node.title}: llm failed`) }
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
        const resp = await fetch('http://localhost:11434/api/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: ollamaModel.value,
            prompt: `Extract category names from: "${instruction}"\nList ONLY categories separated by comma:`,
            stream: false,
          }),
        })
        const data = await resp.json()
        categories = (data.response || '').toLowerCase().split(/[,\n]+/).map((c: string) => c.trim()).filter((c: string) => c.length > 1)
      } catch { /* ignore LLM errors, use fallback categories */ }
      if (categories.length < 2) categories = ['left', 'right']

      const groups: Map<string, typeof nodes> = new Map()
      for (const node of nodes) {
        try {
          const resp = await fetch('http://localhost:11434/api/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: ollamaModel.value,
              prompt: `Classify "${node.title}" into ONE of: ${categories.join(', ')}\nAnswer with ONLY the category:`,
              stream: false,
            }),
          })
          const data = await resp.json()
          const group = (data.response || 'other').toLowerCase().trim().split(/\s+/)[0]
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
          const resp = await fetch('http://localhost:11434/api/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: ollamaModel.value,
              prompt: `Classify "${node.title}" into ONE of: ${groupsArg}\nAnswer with ONLY the group name:`,
              stream: false,
            }),
          })
          const data = await resp.json()
          nodeGroups.set(node.id, (data.response || 'other').toLowerCase().trim().split(/\s+/)[0])
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
  try {
    // Get connected nodes for context
    const connectedNodes = store.filteredEdges
      .filter(e => e.source_node_id === nodeId || e.target_node_id === nodeId)
      .map(e => e.source_node_id === nodeId ? e.target_node_id : e.source_node_id)
      .map(id => store.getNode(id))
      .filter(Boolean)
      .map(n => `[${n!.title || 'Untitled'}]: ${(n!.markdown_content || '').slice(0, 200)}`)
      .join('\n')

    const neighborsContext = connectedNodes
      ? `\nCONNECTED NODES:\n${connectedNodes}\n`
      : ''

    const nodeSystemPrompt = `You are editing a single note. REWRITE the note content based on the user's request.

Return ONLY the new content. Do NOT wrap in code blocks unless the user asks for code or the content is code.
Unless the user explicitly asks for JSON, return plain markdown text.
${neighborsContext}
CURRENT NOTE CONTENT:
${currentContent || '(empty)'}`

    const response = await callOllama(nodePrompt.value, nodeSystemPrompt)
    nodePrompt.value = ''

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

  // Filter edges for neighborhood mode - only show edges between visible neighbors
  if (neighborhoodNodeIds.value) {
    const neighborIds = neighborhoodNodeIds.value
    edges = edges.filter(e => neighborIds.has(e.source_node_id) && neighborIds.has(e.target_node_id))
  }

  // MASSIVE GRAPH OPTIMIZATION: Skip all expensive routing, use simple center-to-center lines
  if (isMassiveGraph.value) {
    // Build simple node lookup
    const nodeMap = new Map(displayNodes.value.map(n => [n.id, n]))

    return edges.map(edge => {
      const source = nodeMap.get(edge.source_node_id)
      const target = nodeMap.get(edge.target_node_id)
      if (!source || !target) return null

      const sw = source.width || 200
      const sh = source.height || 120
      const tw = target.width || 200
      const th = target.height || 120

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
      width: node.width || 200,
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
    width: n.width || 200,
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
    const targetCx = target.canvas_x + (target.width || 200) / 2
    const targetCy = target.canvas_y + (target.height || 120) / 2
    const sourceCx = source.canvas_x + (source.width || 200) / 2
    const sourceCy = source.canvas_y + (source.height || 120) / 2

    const sourceSide = getSide(source, targetCx, targetCy)
    const targetSide = getSide(target, sourceCx, sourceCy)

    edgeInfos.push({ edge, source, target, sourceSide, targetSide })
  }

  const { sourceAssignments, targetAssignments } = assignPorts(edgeInfos)

  // Use batch routing for both diagonal and orthogonal styles
  // The routing modules handle grid tracking, obstacle avoidance, and path generation
  const effectiveStyle: EdgeStyle = style === 'curved' ? 'orthogonal' : style
  let routedEdges: Map<string, { svgPath: string; strokeWidth?: number; bundleSize?: number; path?: Array<{x: number; y: number}>; debugInfo?: { srcOffset: number; tgtOffset: number; srcSide: string; tgtSide: string } }> | null = null

  if (edgeBundling.value) {
    routedEdges = routeEdgesWithBundling(edgeDefs, nodeRects, nodeMap, effectiveStyle)
  } else {
    routedEdges = routeAllEdges(edgeDefs, nodeRects, nodeMap, effectiveStyle)
  }

  // Grid tracker for curved edges (which still need manual routing)
  const gridTracker = new GridTracker(PORT_SPACING)

  // Sort edges to minimize crossings
  // Edges are sorted by their midpoint position so parallel edges don't cross
  const sortedEdges = [...edges].sort((a, b) => {
    const sourceA = store.getNode(a.source_node_id)
    const targetA = store.getNode(a.target_node_id)
    const sourceB = store.getNode(b.source_node_id)
    const targetB = store.getNode(b.target_node_id)
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
    const source = store.getNode(edge.source_node_id)
    const target = store.getNode(edge.target_node_id)
    if (!source || !target) return null

    const sw = source.width || 200
    const sh = getNodeHeight(source)
    const tw = target.width || 200
    const th = getNodeHeight(target)

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
    const STANDOFF_DIST = 40
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

// Visible edges - filtered for large graphs (cheap filter, runs on pan/zoom)
const visibleEdgeLines = computed(() => {
  // Don't filter during zoom to prevent flickering
  if (!isLargeGraph.value || isZooming.value) return edgeLines.value

  // Don't filter when zoomed in - edges can extend far and user expects to see them
  if (scale.value > 0.8) return edgeLines.value

  // For large graphs when zoomed out, only render edges where at least one node is visible
  const visIds = visibleNodeIds.value
  return edgeLines.value.filter(e =>
    visIds.has(e.source_node_id) || visIds.has(e.target_node_id)
  )
})

// Transform for the canvas content
const transform = computed(() => {
  // Use translate3d for GPU acceleration
  return `translate3d(${offsetX.value}px, ${offsetY.value}px, 0) scale(${scale.value})`
})

// Screen to canvas coordinates
function screenToCanvas(screenX: number, screenY: number) {
  const rect = canvasRef.value?.getBoundingClientRect()
  if (!rect) return { x: 0, y: 0 }
  return {
    x: (screenX - rect.left - offsetX.value) / scale.value,
    y: (screenY - rect.top - offsetY.value) / scale.value,
  }
}

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

// Node dragging
function onNodeMouseDown(e: MouseEvent, nodeId: string) {
  e.stopPropagation()

  // Don't start drag if editing this node
  if (editingNodeId.value === nodeId) {
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
  store.selectNode(nodeId, e.shiftKey || e.metaKey)
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

  document.addEventListener('mousemove', onNodeDrag)
  document.addEventListener('mouseup', stopNodeDrag)
}

function onNodeDrag(e: MouseEvent) {
  if (!draggingNode.value) return
  const pos = screenToCanvas(e.clientX, e.clientY)
  const dx = pos.x - dragStart.value.x
  const dy = pos.y - dragStart.value.y
  const newX = snapToGrid(dragStart.value.nodeX + dx)
  const newY = snapToGrid(dragStart.value.nodeY + dy)
  store.updateNodePosition(draggingNode.value, newX, newY)
}

function stopNodeDrag() {
  // Push overlapping nodes away after drag
  if (draggingNode.value) {
    pushOverlappingNodesAway(draggingNode.value)
  }

  draggingNode.value = null
  lastDragEndTime = Date.now()
  document.removeEventListener('mousemove', onNodeDrag)
  document.removeEventListener('mouseup', stopNodeDrag)
}

// Frame interaction
function onFrameMouseDown(e: MouseEvent, frameId: string) {
  e.preventDefault()
  store.selectFrame(frameId)
  store.selectNode(null)

  const frame = store.frames.find(f => f.id === frameId)
  if (!frame) return

  draggingFrame.value = frameId
  const pos = screenToCanvas(e.clientX, e.clientY)
  frameDragStart.value = {
    x: pos.x,
    y: pos.y,
    frameX: frame.canvas_x,
    frameY: frame.canvas_y,
  }

  // Find nodes inside the frame and store their initial positions
  frameContainedNodes.value.clear()
  for (const node of store.filteredNodes) {
    const nodeRight = node.canvas_x + (node.width || 200)
    const nodeBottom = node.canvas_y + (node.height || 120)
    const frameRight = frame.canvas_x + frame.width
    const frameBottom = frame.canvas_y + frame.height

    // Check if node overlaps with frame (at least 50% inside)
    const overlapX = Math.max(0, Math.min(nodeRight, frameRight) - Math.max(node.canvas_x, frame.canvas_x))
    const overlapY = Math.max(0, Math.min(nodeBottom, frameBottom) - Math.max(node.canvas_y, frame.canvas_y))
    const nodeArea = (node.width || 200) * (node.height || 120)
    const overlapArea = overlapX * overlapY

    if (overlapArea > nodeArea * 0.5) {
      frameContainedNodes.value.set(node.id, { x: node.canvas_x, y: node.canvas_y })
    }
  }

  document.addEventListener('mousemove', onFrameDrag)
  document.addEventListener('mouseup', stopFrameDrag)
}

function onFrameDrag(e: MouseEvent) {
  if (!draggingFrame.value) return
  const pos = screenToCanvas(e.clientX, e.clientY)
  const dx = pos.x - frameDragStart.value.x
  const dy = pos.y - frameDragStart.value.y
  const newX = snapToGrid(frameDragStart.value.frameX + dx)
  const newY = snapToGrid(frameDragStart.value.frameY + dy)
  store.updateFramePosition(draggingFrame.value, newX, newY)

  // Move contained nodes with the frame
  for (const [nodeId, initialPos] of frameContainedNodes.value) {
    const newNodeX = snapToGrid(initialPos.x + dx)
    const newNodeY = snapToGrid(initialPos.y + dy)
    store.updateNodePosition(nodeId, newNodeX, newNodeY)
  }
}

function stopFrameDrag() {
  draggingFrame.value = null
  frameContainedNodes.value.clear()
  document.removeEventListener('mousemove', onFrameDrag)
  document.removeEventListener('mouseup', stopFrameDrag)
}

function startFrameResize(e: MouseEvent, frameId: string) {
  e.preventDefault()
  const frame = store.frames.find(f => f.id === frameId)
  if (!frame) return

  resizingFrame.value = frameId
  frameResizeStart.value = {
    x: e.clientX,
    y: e.clientY,
    width: frame.width,
    height: frame.height,
  }

  document.addEventListener('mousemove', onFrameResize)
  document.addEventListener('mouseup', stopFrameResize)
}

function onFrameResize(e: MouseEvent) {
  if (!resizingFrame.value) return
  const dx = (e.clientX - frameResizeStart.value.x) / scale.value
  const dy = (e.clientY - frameResizeStart.value.y) / scale.value
  const newWidth = Math.max(200, frameResizeStart.value.width + dx)
  const newHeight = Math.max(100, frameResizeStart.value.height + dy)
  store.updateFrameSize(resizingFrame.value, newWidth, newHeight)
}

function stopFrameResize() {
  resizingFrame.value = null
  document.removeEventListener('mousemove', onFrameResize)
  document.removeEventListener('mouseup', stopFrameResize)
}

function startEditingFrameTitle(frameId: string) {
  const frame = store.frames.find(f => f.id === frameId)
  if (!frame) return
  editingFrameId.value = frameId
  editFrameTitle.value = frame.title
  nextTick(() => {
    const input = document.querySelector('.frame-title-editor') as HTMLInputElement
    input?.focus()
    input?.select()
  })
}

function saveFrameTitleEditing() {
  if (editingFrameId.value && editFrameTitle.value.trim()) {
    store.updateFrameTitle(editingFrameId.value, editFrameTitle.value.trim())
  }
  editingFrameId.value = null
}

function cancelFrameTitleEditing() {
  editingFrameId.value = null
}

function createFrameAtCenter() {
  const rect = canvasRef.value?.getBoundingClientRect()
  if (!rect) {
    console.error('createFrameAtCenter: canvasRef not available')
    return
  }

  // If nodes are selected, create frame around them
  if (store.selectedNodeIds.length > 0) {
    const selectedNodes = store.filteredNodes.filter(n => store.selectedNodeIds.includes(n.id))
    const padding = 40

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const node of selectedNodes) {
      minX = Math.min(minX, node.canvas_x)
      minY = Math.min(minY, node.canvas_y)
      maxX = Math.max(maxX, node.canvas_x + (node.width || 200))
      maxY = Math.max(maxY, node.canvas_y + (node.height || 120))
    }

    const frameX = minX - padding
    const frameY = minY - padding
    const frameWidth = maxX - minX + padding * 2
    const frameHeight = maxY - minY + padding * 2

    const frame = store.createFrame(frameX, frameY, frameWidth, frameHeight, 'Frame')
    store.selectFrame(frame.id)
    store.selectNode(null)
    return
  }

  // No selection - create frame at viewport center
  const centerX = (rect.width / 2 - offsetX.value) / scale.value
  const centerY = (rect.height / 2 - offsetY.value) / scale.value
  const frame = store.createFrame(centerX - 200, centerY - 150, 400, 300, 'New Frame')
  store.selectFrame(frame.id)
}

function deleteSelectedFrame() {
  if (store.selectedFrameId) {
    store.deleteFrame(store.selectedFrameId)
    store.selectFrame(null)
  }
}

// Node resizing (supports multiple selected nodes)
function onResizeMouseDown(e: MouseEvent, nodeId: string) {
  e.stopPropagation()
  e.preventDefault()

  const node = store.getNode(nodeId)
  if (!node) return

  resizingNode.value = nodeId
  resizeStart.value = {
    x: e.clientX,
    y: e.clientY,
    width: node.width || 200,
    height: node.height || 120,
  }
  resizePreview.value = { width: node.width || 200, height: node.height || 120 }

  // Store initial sizes of all selected nodes for multi-resize
  multiResizeInitial.value.clear()
  if (store.selectedNodeIds.includes(nodeId) && store.selectedNodeIds.length > 1) {
    for (const id of store.selectedNodeIds) {
      const n = store.getNode(id)
      if (n) {
        multiResizeInitial.value.set(id, { width: n.width || 200, height: n.height || 120 })
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

  let width = Math.max(120, resizeStart.value.width + dx)
  let height = Math.max(60, resizeStart.value.height + dy)

  // Apply grid snap if enabled
  if (gridLockEnabled.value) {
    width = snapToGrid(width)
    height = snapToGrid(height)
  }

  resizePreview.value = { width, height }

  // Update all selected nodes in real-time during resize
  if (multiResizeInitial.value.size > 0) {
    for (const [id, initial] of multiResizeInitial.value) {
      if (id === resizingNode.value) continue // Primary node uses resizePreview
      const newWidth = Math.max(120, initial.width + dx)
      const newHeight = Math.max(60, initial.height + dy)
      const n = store.getNode(id)
      if (n) {
        n.width = gridLockEnabled.value ? snapToGrid(newWidth) : newWidth
        n.height = gridLockEnabled.value ? snapToGrid(newHeight) : newHeight
      }
    }
  }
}

function stopResize() {
  if (resizingNode.value) {
    const nodeId = resizingNode.value
    const width = resizePreview.value.width
    const height = resizePreview.value.height

    // Update primary node size
    store.updateNodeSize(nodeId, width, height)

    // Update all other selected nodes
    if (multiResizeInitial.value.size > 0) {
      for (const [id] of multiResizeInitial.value) {
        if (id === nodeId) continue
        const n = store.getNode(id)
        if (n) {
          store.updateNodeSize(id, n.width || 200, n.height || 120)
        }
      }
    }

    // In neighborhood mode, re-layout to adapt to new sizes
    if (neighborhoodMode.value && focusNodeId.value) {
      // Small delay to ensure store is updated
      setTimeout(() => layoutNeighborhood(focusNodeId.value!), 10)
    } else {
      // Push overlapping nodes away (only in normal mode)
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

  const sw = sourceNode.width || 200
  const sh = sourceNode.height || 120
  const sx = sourceNode.canvas_x
  const sy = sourceNode.canvas_y
  const scx = sx + sw / 2
  const scy = sy + sh / 2

  for (const node of store.filteredNodes) {
    if (node.id === sourceId) continue

    const nw = node.width || 200
    const nh = node.height || 120
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
    const nodeCenterX = targetNode.canvas_x + (targetNode.width || 200) / 2
    const nodeCenterY = targetNode.canvas_y + (targetNode.height || 120) / 2
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

// Animation state for layout
let layoutAnimationId: number | null = null

function stopLayoutAnimation() {
  if (layoutAnimationId) {
    cancelAnimationFrame(layoutAnimationId)
    layoutAnimationId = null
  }
}

// Animate nodes from current positions to target positions
function animateToPositions(targets: Map<string, { x: number, y: number }>, duration = 400) {
  stopLayoutAnimation()

  const startTime = performance.now()
  const startPositions = new Map<string, { x: number, y: number }>()

  for (const [id] of targets) {
    const node = store.nodes.find(n => n.id === id)
    if (node) {
      startPositions.set(id, { x: node.canvas_x, y: node.canvas_y })
    }
  }

  function easeOutCubic(t: number): number {
    return 1 - Math.pow(1 - t, 3)
  }

  function animate() {
    const elapsed = performance.now() - startTime
    const progress = Math.min(elapsed / duration, 1)
    const eased = easeOutCubic(progress)

    for (const [id, target] of targets) {
      const start = startPositions.get(id)
      if (start) {
        const x = start.x + (target.x - start.x) * eased
        const y = start.y + (target.y - start.y) * eased
        store.updateNodePosition(id, x, y)
      }
    }

    if (progress < 1) {
      layoutAnimationId = requestAnimationFrame(animate)
    } else {
      layoutAnimationId = null
    }
  }

  layoutAnimationId = requestAnimationFrame(animate)
}

/**
 * Tetris-style bin packing for grid layout using maximal rectangles algorithm
 * Places larger nodes first, then fills gaps with smaller nodes
 */
function tetrisGridLayout(
  nodes: typeof store.filteredNodes,
  startX: number,
  startY: number,
  gap: number
): Map<string, { x: number; y: number }> {
  const targets = new Map<string, { x: number; y: number }>()

  if (nodes.length === 0) return targets

  // Calculate total area to estimate ideal dimensions
  let totalArea = 0
  let maxNodeWidth = 0
  let maxNodeHeight = 0
  for (const node of nodes) {
    const w = node.width || 200
    const h = node.height || 120
    totalArea += (w + gap) * (h + gap)
    maxNodeWidth = Math.max(maxNodeWidth, w)
    maxNodeHeight = Math.max(maxNodeHeight, h)
  }

  // Target a roughly square layout
  const idealSide = Math.sqrt(totalArea) * 1.2
  const maxWidth = Math.max(idealSide, maxNodeWidth + gap)

  // Sort nodes by area (largest first) for better packing
  const sorted = [...nodes].sort((a, b) => {
    const areaA = (a.width || 200) * (a.height || 120)
    const areaB = (b.width || 200) * (b.height || 120)
    return areaB - areaA
  })

  // Track placed rectangles
  const placed: { x: number; y: number; w: number; h: number }[] = []

  // Check if rectangle overlaps with any placed node
  function overlaps(x: number, y: number, w: number, h: number): boolean {
    for (const rect of placed) {
      if (x < rect.x + rect.w + gap &&
          x + w + gap > rect.x &&
          y < rect.y + rect.h + gap &&
          y + h + gap > rect.y) {
        return true
      }
    }
    return false
  }

  // Find best position using bottom-left with maxWidth constraint
  function findBestPosition(w: number, h: number): { x: number; y: number } {
    // Generate candidate positions from corners of placed rectangles
    const candidates: { x: number; y: number; score: number }[] = []

    // Always try origin
    candidates.push({ x: startX, y: startY, score: 0 })

    // Add positions at corners of placed rectangles
    for (const rect of placed) {
      // Right of this rect
      const rightX = rect.x + rect.w + gap
      if (rightX + w <= startX + maxWidth) {
        candidates.push({ x: rightX, y: rect.y, score: rect.y * 10000 + rightX })
      }

      // Below this rect
      candidates.push({ x: rect.x, y: rect.y + rect.h + gap, score: (rect.y + rect.h + gap) * 10000 + rect.x })

      // Below this rect, at start
      candidates.push({ x: startX, y: rect.y + rect.h + gap, score: (rect.y + rect.h + gap) * 10000 })

      // Right of this rect, at top of layout
      if (rightX + w <= startX + maxWidth) {
        candidates.push({ x: rightX, y: startY, score: startY * 10000 + rightX })
      }

      // Try to fit in vertical gaps next to tall nodes
      for (const other of placed) {
        if (other === rect) continue
        // Gap between rect bottom and other top
        if (other.y > rect.y + rect.h + gap) {
          const gapTop = rect.y + rect.h + gap
          const gapHeight = other.y - gapTop - gap
          if (gapHeight >= h) {
            candidates.push({ x: rect.x, y: gapTop, score: gapTop * 10000 + rect.x })
          }
        }
      }
    }

    // Sort by score (prefer top-left: lower y first, then lower x)
    candidates.sort((a, b) => a.score - b.score)

    // Find first valid position
    for (const cand of candidates) {
      if (cand.x >= startX && cand.y >= startY &&
          cand.x + w <= startX + maxWidth &&
          !overlaps(cand.x, cand.y, w, h)) {
        return { x: cand.x, y: cand.y }
      }
    }

    // Fallback: place below everything
    let maxBottom = startY
    for (const rect of placed) {
      maxBottom = Math.max(maxBottom, rect.y + rect.h + gap)
    }
    return { x: startX, y: maxBottom }
  }

  // Place each node
  for (const node of sorted) {
    const w = node.width || 200
    const h = node.height || 120
    const pos = findBestPosition(w, h)
    targets.set(node.id, pos)
    placed.push({ x: pos.x, y: pos.y, w, h })
  }

  return targets
}

async function autoLayoutNodes(layout: 'grid' | 'horizontal' | 'vertical' | 'force' = 'grid') {
  // Use selected nodes if any, otherwise all filtered nodes
  const selectedIds = store.selectedNodeIds
  const allNodes = store.filteredNodes
  const nodes = selectedIds.length > 0
    ? allNodes.filter(n => selectedIds.includes(n.id))
    : allNodes

  if (nodes.length === 0) return

  // Push undo state before layout change
  pushUndo()

  // Stop any running animation
  stopLayoutAnimation()

  // Calculate current center of all nodes (this stays consistent across layouts)
  let sumX = 0, sumY = 0
  for (const node of nodes) {
    sumX += node.canvas_x + (node.width || 200) / 2
    sumY += node.canvas_y + (node.height || 120) / 2
  }
  const centerX = sumX / nodes.length
  const centerY = sumY / nodes.length

  // Gap between nodes - enough for edge routing (standoff + arrow + margin)
  // Needs ~50px standoff on each side + space for edge labels
  const gap = 150

  if (layout === 'force') {
    // Use centralized force layout from store
    const nodeIds = selectedIds.length > 0 ? selectedIds : undefined
    await store.layoutNodes(nodeIds, {
      centerX,
      centerY,
    })
    return
  }

  // For grid/horizontal/vertical layouts, calculate targets centered on current center
  const targets = new Map<string, { x: number, y: number }>()

  if (layout === 'grid') {
    // Use tetris-style bin packing
    // First, do a trial layout to get dimensions
    const trialTargets = tetrisGridLayout(nodes, 0, 0, gap)

    // Calculate bounding box of trial layout
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const node of nodes) {
      const pos = trialTargets.get(node.id)!
      const w = node.width || 200
      const h = node.height || 120
      minX = Math.min(minX, pos.x)
      minY = Math.min(minY, pos.y)
      maxX = Math.max(maxX, pos.x + w)
      maxY = Math.max(maxY, pos.y + h)
    }

    // Center the layout on current center
    const layoutCenterX = (minX + maxX) / 2
    const layoutCenterY = (minY + maxY) / 2
    const offsetX = centerX - layoutCenterX
    const offsetY = centerY - layoutCenterY

    // Apply offset to all positions
    for (const [id, pos] of trialTargets) {
      targets.set(id, { x: pos.x + offsetX, y: pos.y + offsetY })
    }
  } else {
    // Horizontal and vertical layouts - use actual node sizes
    if (layout === 'horizontal') {
      // Sort by height for better alignment
      const sorted = [...nodes].sort((a, b) => (b.height || 120) - (a.height || 120))
      let totalWidth = sorted.reduce((sum, n) => sum + (n.width || 200) + gap, -gap)
      let x = centerX - totalWidth / 2
      const maxHeight = Math.max(...sorted.map(n => n.height || 120))

      for (const node of sorted) {
        const h = node.height || 120
        targets.set(node.id, { x, y: centerY - maxHeight / 2 + (maxHeight - h) / 2 })
        x += (node.width || 200) + gap
      }
    } else if (layout === 'vertical') {
      // Sort by width for better alignment
      const sorted = [...nodes].sort((a, b) => (b.width || 200) - (a.width || 200))
      let totalHeight = sorted.reduce((sum, n) => sum + (n.height || 120) + gap, -gap)
      let y = centerY - totalHeight / 2
      const maxWidth = Math.max(...sorted.map(n => n.width || 200))

      for (const node of sorted) {
        const w = node.width || 200
        targets.set(node.id, { x: centerX - maxWidth / 2 + (maxWidth - w) / 2, y })
        y += (node.height || 120) + gap
      }
    }
  }

  animateToPositions(targets, 500)
}

function fitToContent() {
  if (store.filteredNodes.length === 0) return

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const node of store.filteredNodes) {
    minX = Math.min(minX, node.canvas_x)
    minY = Math.min(minY, node.canvas_y)
    maxX = Math.max(maxX, node.canvas_x + (node.width || 200))
    maxY = Math.max(maxY, node.canvas_y + (node.height || 120))
  }

  const rect = canvasRef.value?.getBoundingClientRect()
  if (!rect) return

  const padding = 50
  const contentWidth = maxX - minX + padding * 2
  const contentHeight = maxY - minY + padding * 2

  const scaleX = rect.width / contentWidth
  const scaleY = rect.height / contentHeight
  scale.value = Math.min(scaleX, scaleY, 1)

  offsetX.value = (rect.width - contentWidth * scale.value) / 2 - minX * scale.value + padding * scale.value
  offsetY.value = (rect.height - contentHeight * scale.value) / 2 - minY * scale.value + padding * scale.value
}

// Edge color palette
const edgeColorPalette = [
  { value: '#94a3b8' }, // gray (default)
  { value: '#3b82f6' }, // blue
  { value: '#22c55e' }, // green
  { value: '#f97316' }, // orange
  { value: '#ef4444' }, // red
  { value: '#8b5cf6' }, // purple
  { value: '#ec4899' }, // pink
]

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
      const { createTypstRenderer } = await import('@myriaddreamin/typst.ts')
      typstRenderer = await createTypstRenderer()
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
      const svg = await typstRenderer.runWithSession(async (session: any) => {
        return await session.svg({ mainContent: typstCode })
      })
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

// Update rendered content when node content changes
watch(
  () => store.filteredNodes.map(n => `${n.id}:${n.markdown_content}`).join('|'),
  () => {
    const result: Record<string, string> = {}
    for (const node of store.filteredNodes) {
      result[node.id] = renderMarkdown(node.markdown_content)
    }
    nodeRenderedContent.value = result
  },
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

// Node colors for the color picker
const nodeColors = [
  { value: null },
  { value: '#fee2e2' },
  { value: '#ffedd5' },
  { value: '#fef9c3' },
  { value: '#dcfce7' },
  { value: '#dbeafe' },
  { value: '#f3e8ff' },
  { value: '#fce7f3' },
]

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
  const node = store.nodes.find(n => n.id === nodeId)
  if (node) {
    node.color_theme = color
    node.updated_at = Date.now()
  }
}

// One-shot fit to content (does NOT enable auto_fit)
function fitNodeNow(nodeId: string) {
  setTimeout(() => fitNodeToContent(nodeId), 50)
}

async function deleteSelectedNodes() {
  const count = store.selectedNodeIds.length
  if (count === 0) return
  // Delete without confirm to avoid Tauri permission issues
  for (const id of [...store.selectedNodeIds]) {
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
    width: n.width || 200,
    height: n.height || 120,
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
          <label>Context</label>
          <div class="slider-row">
            <input v-model.number="ollamaContextLength" type="range" min="1024" max="32768" step="1024" class="settings-slider" />
            <span class="slider-value">{{ (ollamaContextLength / 1024).toFixed(0) }}k</span>
          </div>
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
          <marker v-for="color in edgeColorPalette" :id="getArrowMarkerId(color.value)" :key="color.value" viewBox="0 0 10 10" markerWidth="6" markerHeight="6" refX="10" refY="5" orient="auto">
            <path d="M0,0 L10,5 L0,10 z" :fill="color.value" />
          </marker>
          <marker id="arrow-selected" viewBox="0 0 10 10" markerWidth="6" markerHeight="6" refX="10" refY="5" orient="auto">
            <path d="M0,0 L10,5 L0,10 z" fill="#3b82f6" />
          </marker>
        </defs>

        <!-- Existing edges (simplified for large graphs) -->
        <template v-if="isLargeGraph">
          <!-- Fast rendering: paths without hit areas or markers -->
          <path
            v-for="edge in visibleEdgeLines"
            :key="edge.id"
            :d="edge.path"
            :stroke="isEdgeHighlighted(edge) ? '#3b82f6' : getEdgeColor(edge)"
            :stroke-width="isEdgeHighlighted(edge) ? 2.5 : 1"
            fill="none"
            class="edge-line-fast"
            :class="{ 'edge-highlighted': isEdgeHighlighted(edge) }"
          />
        </template>
        <template v-else>
          <g v-for="edge in visibleEdgeLines" :key="edge.id">
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
              :stroke="getEdgeColor(edge)"
              :stroke-width="edge.trunkStrokeWidth * edgeStrokeWidth"
              stroke-linecap="round"
              fill="none"
              class="edge-trunk"
              pointer-events="none"
            />
            <!-- Glow effect for selected edge -->
            <path
              v-if="selectedEdge === edge.id"
              :d="edge.path"
              :stroke="getEdgeColor(edge)"
              :stroke-width="(edgeBundling ? edge.strokeWidth * edgeStrokeWidth : edgeStrokeWidth) + 6"
              stroke-linecap="round"
              fill="none"
              class="edge-glow"
              opacity="0.3"
              pointer-events="none"
            />
            <!-- Visible edge path (branch for bundled, full path for unbundled) -->
            <path
              :d="edge.path"
              :stroke="isEdgeHighlighted(edge) ? '#3b82f6' : getEdgeColor(edge)"
              :stroke-width="selectedEdge === edge.id || isEdgeHighlighted(edge) ? (edgeBundling ? edge.strokeWidth * edgeStrokeWidth : edgeStrokeWidth) + 2 : (edgeBundling ? edge.strokeWidth * edgeStrokeWidth : edgeStrokeWidth)"
              :marker-end="edge.isBidirectional || edge.isShortEdge ? undefined : `url(#${isEdgeHighlighted(edge) ? 'arrow-selected' : getArrowMarkerId(getEdgeColor(edge))})`"
              stroke-linecap="round"
              fill="none"
              class="edge-line-visible"
              :class="{ 'edge-selected': selectedEdge === edge.id, 'edge-highlighted': isEdgeHighlighted(edge) }"
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
          fill="rgba(59, 130, 246, 0.1)"
          stroke="#3b82f6"
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
          stroke="#3b82f6"
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
          transform: `translate3d(${node.canvas_x}px, ${node.canvas_y}px, 0)`,
          width: (resizingNode === node.id ? resizePreview.width : (node.width || 200)) + 'px',
          height: (resizingNode === node.id ? resizePreview.height : (node.height || 120)) + 'px',
          ...(node.color_theme ? { background: getNodeBackground(node.color_theme) } : {}),
        }"
        @mousedown="onNodeMouseDown($event, node.id)"
        @mouseenter="hoveredNodeId = node.id"
        @mouseleave="hoveredNodeId = null"
        @dblclick.stop="startEditing(node.id)"
      >
        <!-- Node title header -->
        <div class="node-header" @dblclick.stop="startEditingTitle(node.id)">
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

        <div class="resize-handle" @mousedown.stop="onResizeMouseDown($event, node.id)"></div>
      </div>

      <!-- Empty state (positioned in viewport, not canvas) -->

      <!-- Floating Node LLM bar (above selected/editing node) -->
      <div
        v-if="(store.selectedNodeIds.length === 1 || editingNodeId) && getVisualNode(store.selectedNodeIds[0] || editingNodeId!)"
        class="node-llm-bar-floating"
        :style="{
          transform: `translate(${getVisualNode(store.selectedNodeIds[0] || editingNodeId!)!.canvas_x}px, ${getVisualNode(store.selectedNodeIds[0] || editingNodeId!)!.canvas_y - 40}px)`,
          width: (getVisualNode(store.selectedNodeIds[0] || editingNodeId!)!.width || 200) + 'px'
        }"
        @mousedown.stop
        @click.stop
      >
        <input
          v-model="nodePrompt"
          type="text"
          placeholder="Ask AI to update this note..."
          class="node-llm-input"
          tabindex="0"
          :disabled="isNodeLLMLoading"
          @mousedown.stop
          @keydown.enter.stop="sendNodePrompt"
          @keydown.stop
        />
        <button
          class="node-llm-send"
          tabindex="0"
          :disabled="isNodeLLMLoading || !nodePrompt.trim()"
          @mousedown.stop
          @click.stop="sendNodePrompt"
        >
          {{ isNodeLLMLoading ? '...' : 'AI' }}
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
    <div class="zoom-controls">
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
        data-tooltip="Neighborhood View - Show only selected node and direct neighbors (N)"
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
      <button data-tooltip="Add Frame - Group selected nodes" @click="createFrameAtCenter">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="3" x2="9" y2="21"/></svg>
      </button>
    </div>

    <div class="status-bar">
      <span v-if="isLargeGraph" class="perf-mode">PERF</span>
      <span>{{ visibleNodes.length }}/{{ store.filteredNodes.length }} nodes</span>
      <span class="sep">|</span>
      <span>{{ edgeLines.length }}/{{ store.filteredEdges.length }} edges</span>
      <span class="sep">|</span>
      <span class="hint">Scroll up/down: zoom | Scroll sideways: pan | Alt+drag: link | Dbl-click: new</span>
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
            width: ((node.width || 200) * MAGNIFIER_ZOOM) + 'px',
            height: ((node.height || 120) * MAGNIFIER_ZOOM) + 'px',
            background: node.color_theme || '#ffffff',
          }"
        >
          <span class="magnifier-node-title">{{ node.title || 'Untitled' }}</span>
        </div>
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

<style scoped>
.canvas-wrapper {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.graph-llm-bar {
  display: flex;
  flex-direction: column;
  gap: 0;
  padding: 12px 16px;
  background: var(--bg-surface);
  border-bottom: 1px solid var(--border-default);
  flex-shrink: 0;
}

.agent-tasks {
  margin-top: 8px;
  padding: 8px;
  background: var(--bg-surface-alt);
  border-radius: 6px;
  font-size: 12px;
  max-height: 150px;
  overflow-y: auto;
}

.agent-log {
  margin-top: 8px;
  padding: 8px;
  background: #1a1a2e;
  border-radius: 6px;
  font-family: monospace;
  font-size: 11px;
  max-height: 120px;
  overflow-y: auto;
  color: #4ade80;
}

.log-line {
  padding: 2px 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.agent-task {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 0;
  color: var(--text-secondary);
}

.agent-task.done {
  color: var(--success-color, #22c55e);
}

.agent-task.running {
  color: var(--primary-color);
}

.task-status {
  font-family: monospace;
  width: 16px;
}

.llm-toggle {
  padding: 6px 10px;
  border: 1px solid var(--border-default);
  border-radius: 6px;
  background: var(--bg-surface-alt);
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 12px;
  font-weight: 600;
}

.llm-toggle:hover {
  background: var(--bg-elevated);
  border-color: var(--primary-color);
  color: var(--primary-color);
}

.llm-input-row {
  flex: 1;
  display: flex;
  gap: 8px;
  align-items: center;
}

.llm-input {
  flex: 1;
  padding: 8px 12px;
  border: 1px solid var(--border-default);
  border-radius: 6px;
  font-size: 13px;
  background: var(--bg-surface);
  color: var(--text-main);
}

.llm-input:focus {
  outline: none;
  border-color: var(--primary-color);
}

.llm-input::placeholder {
  color: var(--text-muted);
}

.model-select {
  padding: 8px 10px;
  border: 1px solid var(--border-default);
  border-radius: 6px;
  font-size: 12px;
  background: var(--bg-surface);
  color: var(--text-secondary);
  cursor: pointer;
}

.llm-send {
  padding: 8px 16px;
  border: none;
  border-radius: 6px;
  background: var(--primary-color);
  color: white;
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
}

.llm-send:hover:not(:disabled) {
  opacity: 0.9;
}

.llm-send:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.llm-stop {
  padding: 8px 16px;
  border: none;
  border-radius: 6px;
  background: #dc2626;
  color: white;
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
}

.llm-stop:hover {
  background: #b91c1c;
}

.llm-settings-btn {
  padding: 8px 12px;
  border: 1px solid var(--border-default);
  border-radius: 6px;
  background: var(--bg-surface);
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 12px;
  font-weight: 600;
}

.llm-settings-btn:hover,
.llm-settings-btn.active {
  background: var(--bg-elevated);
  border-color: var(--primary-color);
}

.llm-clear-btn {
  padding: 8px 12px;
  border: 1px solid var(--border-default);
  border-radius: 6px;
  background: var(--bg-surface);
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 12px;
  font-weight: 600;
  min-width: 32px;
}

.llm-clear-btn:hover {
  background: var(--bg-elevated);
  border-color: var(--warning-color, #f59e0b);
}

.llm-clear-btn.active {
  background: var(--warning-color, #f59e0b);
  color: white;
  border-color: var(--warning-color, #f59e0b);
}

.llm-settings-panel {
  margin-top: 12px;
  padding: 16px;
  background: var(--bg-surface);
  border: 1px solid var(--border-default);
  border-radius: 8px;
  box-shadow: 0 2px 8px var(--shadow-sm);
}

.settings-grid {
  display: grid;
  grid-template-columns: 80px 1fr;
  gap: 12px 16px;
  align-items: center;
  margin-bottom: 16px;
}

.settings-grid label {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-secondary);
}

.settings-label {
  display: block;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-secondary);
  margin-bottom: 8px;
}

.settings-input {
  padding: 8px 12px;
  border: 1px solid var(--border-default);
  border-radius: 6px;
  font-size: 13px;
  background: var(--bg-surface-alt);
  color: var(--text-main);
}

.settings-input:focus {
  outline: none;
  border-color: var(--primary-color);
}

.settings-select {
  padding: 8px 12px;
  border: 1px solid var(--border-default);
  border-radius: 6px;
  font-size: 13px;
  background: var(--bg-surface-alt);
  color: var(--text-main);
  cursor: pointer;
}

.settings-select:focus {
  outline: none;
  border-color: var(--primary-color);
}

.slider-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.settings-slider {
  flex: 1;
  height: 4px;
  -webkit-appearance: none;
  appearance: none;
  background: var(--border-default);
  border-radius: 2px;
  cursor: pointer;
}

.settings-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 16px;
  height: 16px;
  background: var(--primary-color);
  border-radius: 50%;
  cursor: pointer;
}

.settings-slider::-moz-range-thumb {
  width: 16px;
  height: 16px;
  background: var(--primary-color);
  border: none;
  border-radius: 50%;
  cursor: pointer;
}

.slider-value {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-main);
  min-width: 32px;
  text-align: right;
}

.settings-textarea {
  width: 100%;
  padding: 12px;
  border: 1px solid var(--border-default);
  border-radius: 6px;
  font-size: 12px;
  line-height: 1.5;
  font-family: ui-monospace, 'SF Mono', Menlo, monospace;
  background: var(--bg-surface-alt);
  color: var(--text-main);
  resize: vertical;
}

.settings-textarea:focus {
  outline: none;
  border-color: var(--primary-color);
}

.canvas-viewport {
  flex: 1;
  width: 100%;
  height: 100%;
  position: relative;
  overflow: hidden;
  background: var(--bg-canvas);
  cursor: default;
}

.canvas-viewport.panning {
  cursor: grabbing;
}

.canvas-content {
  position: absolute;
  top: 0;
  left: 0;
  width: 1px;
  height: 1px;
  transform-origin: 0 0;
  /* GPU acceleration */
  will-change: transform;
  transform: translateZ(0);
  backface-visibility: hidden;
  -webkit-font-smoothing: antialiased;
  contain: layout style;
  /* Allow clicks to pass through to canvas-viewport */
  pointer-events: none;
}

.canvas-viewport {
  background-color: var(--bg-canvas);
  background-image: radial-gradient(circle, var(--dot-color) 1px, transparent 1px);
  background-size: 24px 24px;
}

.edges-layer {
  pointer-events: none;
  overflow: visible;
  background: none;
}

.edge-hit-area {
  cursor: pointer;
  pointer-events: stroke;
}

.edge-line-visible {
  stroke-linecap: round;
  stroke-linejoin: round;
  shape-rendering: geometricPrecision;
}

/* Fast edge rendering for large graphs */
.edge-line-fast {
  stroke-linecap: round;
  shape-rendering: optimizeSpeed;
  pointer-events: none;
}

.edge-hit-area:hover + .edge-line-visible {
  stroke-width: 4px !important;
}

.edge-label {
  font-size: 11px;
  font-weight: 500;
  fill: var(--text-main);
  text-anchor: middle;
  pointer-events: none;
  paint-order: stroke fill;
  stroke: var(--bg-canvas);
  stroke-width: 3px;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.edge-highlighted {
  filter: drop-shadow(0 0 4px rgba(59, 130, 246, 0.6));
}

.edge-line-visible:not(.edge-highlighted) {
  opacity: 1;
  transition: opacity 0.15s ease;
}

/* Dim non-highlighted edges when a node is hovered/selected */
.edges-layer:has(.edge-highlighted) .edge-line-visible:not(.edge-highlighted) {
  opacity: 0.25;
}

.node-card {
  position: absolute;
  background: var(--bg-surface);
  border: 2px solid var(--border-default);
  border-radius: 8px;
  cursor: grab;
  box-shadow: 0 2px 6px var(--shadow-sm), 0 1px 2px var(--shadow-md);
  user-select: none;
  display: flex;
  flex-direction: column;
  min-height: 60px;
  /* GPU acceleration */
  will-change: transform;
  contain: layout style paint;
  backface-visibility: hidden;
  -webkit-font-smoothing: antialiased;
  /* Re-enable pointer events (parent has none) */
  pointer-events: auto;
}

/* Neighborhood mode transitions */
.node-card.neighborhood-mode {
  transition: transform 0.3s ease-out, opacity 0.3s ease-out;
}

.node-card.neighborhood-focus {
  border-color: var(--primary-color);
  box-shadow: 0 0 0 3px var(--primary-color-alpha), 0 4px 12px var(--shadow-md);
}

/* Semantic zoom: collapsed state when zoomed out */
.node-card.collapsed {
  overflow: hidden;
  border-width: 3px;
  box-shadow: 0 3px 8px var(--shadow-md);
  /* Center content vertically */
  justify-content: center;
  align-items: center;
}

.node-card.collapsed .node-header {
  border-bottom: none;
  border-radius: 5px;
  font-size: 20px;
  font-weight: 800;
  padding: 12px 16px;
  color: var(--text-main);
  letter-spacing: -0.3px;
  text-shadow: 0 1px 2px var(--shadow-sm);
  /* Center text */
  text-align: center;
  width: 100%;
}

.node-card.collapsed .node-content,
.node-card.collapsed .inline-editor,
.node-card.collapsed .node-color-bar,
.node-card.collapsed .resize-handle,
.node-card.collapsed .delete-node-btn {
  display: none;
}

.node-header {
  padding: 8px 12px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  border-bottom: 1px solid var(--border-default);
  background: var(--bg-surface-alt);
  border-radius: 7px 7px 0 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  cursor: inherit;
}

.title-editor {
  width: 100%;
  border: none;
  background: transparent;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-main);
  outline: none;
  padding: 0;
  margin: 0;
}

.node-card:hover {
  border-color: var(--text-muted);
}

.node-card.selected {
  border-color: var(--primary-color);
  box-shadow: 0 0 0 2px rgba(59,130,246,0.2), 0 4px 12px var(--shadow-md);
  /* Override paint containment so color bar below is visible */
  contain: layout style;
  overflow: visible;
}

.node-card.dragging,
.node-card.resizing {
  cursor: grabbing;
  box-shadow: 0 8px 24px var(--shadow-md);
  z-index: 1000;
}

.resize-handle {
  position: absolute;
  bottom: 3px;
  right: 3px;
  width: 8px;
  height: 8px;
  cursor: nwse-resize;
  z-index: 9999;
  opacity: 0;
  transition: opacity 0.15s;
}

.resize-handle::before,
.resize-handle::after {
  content: '';
  position: absolute;
  background: var(--text-muted);
  border-radius: 1px;
}

.resize-handle::before {
  bottom: 0;
  right: 0;
  width: 8px;
  height: 2px;
}

.resize-handle::after {
  bottom: 0;
  right: 0;
  width: 2px;
  height: 8px;
}

.node-card:hover .resize-handle {
  opacity: 0.4;
}

.resize-handle:hover {
  opacity: 1 !important;
}

.node-card.editing {
  cursor: text;
  /* Override paint containment so color bar below is visible */
  contain: layout style;
  overflow: visible;
}

.node-llm-bar-floating {
  position: absolute;
  display: flex;
  gap: 4px;
  padding: 6px 8px;
  background: var(--bg-surface);
  border: 1px solid var(--border-default);
  border-radius: 6px;
  box-shadow: 0 2px 8px var(--shadow-sm);
  z-index: 1001;
  pointer-events: auto;
}

.node-llm-mode {
  padding: 4px 8px;
  border: 1px solid var(--border-default);
  border-radius: 4px;
  background: var(--bg-surface-alt);
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 12px;
  font-weight: 600;
  min-width: 24px;
}

.node-llm-mode:hover {
  background: var(--bg-elevated);
  border-color: var(--primary-color);
}

.node-llm-input {
  flex: 1;
  padding: 4px 8px;
  border: 1px solid var(--border-default);
  border-radius: 4px;
  font-size: 11px;
  background: var(--bg-surface);
  color: var(--text-main);
  min-width: 0;
}

.node-llm-input:focus {
  outline: none;
  border-color: var(--primary-color);
}

.node-llm-input::placeholder {
  color: var(--text-muted);
}

.node-llm-send {
  padding: 4px 8px;
  border: none;
  border-radius: 4px;
  background: var(--primary-color);
  color: white;
  cursor: pointer;
  font-size: 11px;
  font-weight: 500;
  white-space: nowrap;
}

.node-llm-send:hover:not(:disabled) {
  opacity: 0.9;
}

.node-llm-send:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.inline-editor {
  flex: 1;
  width: 100%;
  border: none;
  background: transparent;
  color: var(--text-main);
  font-family: ui-monospace, 'SF Mono', Menlo, monospace;
  font-size: 13px;
  line-height: 1.5;
  resize: none;
  outline: none;
  overflow-y: auto;
  padding: 12px;
  padding-bottom: 20px;
}

.inline-editor::placeholder {
  color: var(--text-muted);
}

.node-color-bar {
  position: absolute;
  bottom: -28px;
  left: 0;
  display: flex;
  gap: 4px;
  padding: 4px 6px;
  background: var(--bg-surface);
  border: 1px solid var(--border-default);
  border-radius: 6px;
  box-shadow: 0 2px 8px var(--shadow-sm);
  z-index: 10;
}

.color-dot {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: 1.5px solid var(--border-default);
  cursor: pointer;
  padding: 0;
}

.color-dot:hover {
  border-color: var(--text-muted);
  transform: scale(1.1);
}

.color-dot.active {
  border-color: var(--primary-color);
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.3);
}

.color-bar-sep {
  width: 1px;
  height: 12px;
  background: var(--border-default);
  margin: 0 4px;
}

.autofit-toggle {
  padding: 2px 6px;
  border: 1px solid var(--border-default);
  border-radius: 4px;
  background: var(--bg-surface);
  color: var(--text-muted);
  cursor: pointer;
  font-size: 10px;
  font-weight: 500;
}

.autofit-toggle:hover {
  border-color: var(--text-muted);
}

.autofit-toggle.active {
  background: var(--primary-color);
  color: white;
  border-color: var(--primary-color);
}

.delete-node-btn {
  position: absolute;
  top: -8px;
  right: -8px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  border: 1.5px solid var(--danger-border);
  background: var(--danger-bg);
  color: var(--danger-color);
  cursor: pointer;
  padding: 0;
  font-size: 11px;
  line-height: 1;
  box-shadow: 0 1px 3px var(--shadow-sm);
}

.delete-node-btn:hover {
  background: var(--danger-color);
  color: white;
}

.node-content {
  font-size: 13px;
  color: var(--text-main);
  line-height: 1.5;
  overflow-y: auto;
  overflow-x: hidden;
  flex: 1;
  padding: 8px 12px;
  padding-bottom: 8px;
  border-radius: 0 0 7px 7px;
  cursor: inherit;
  overscroll-behavior: contain;
}

.node-content-minimal {
  display: flex;
  align-items: center;
  justify-content: center;
}

.node-content-minimal .minimal-hint {
  color: var(--text-muted);
  font-size: 11px;
  margin: 0;
  opacity: 0.7;
}

.node-content :deep(p) {
  margin: 0 0 8px 0;
}

.node-content :deep(p:last-child) {
  margin-bottom: 0;
}

.node-content :deep(h1) {
  font-size: 16px;
  font-weight: 600;
  margin: 0 0 8px 0;
  color: var(--text-main);
}

.node-content :deep(h2) {
  font-size: 14px;
  font-weight: 600;
  margin: 0 0 6px 0;
  color: var(--text-main);
}

.node-content :deep(h3) {
  font-size: 13px;
  font-weight: 600;
  margin: 0 0 4px 0;
  color: var(--text-secondary);
}

.node-content :deep(ul),
.node-content :deep(ol) {
  margin: 0 0 8px 0;
  padding-left: 18px;
}

.node-content :deep(li) {
  margin-bottom: 2px;
}

.node-content :deep(code) {
  background: var(--bg-elevated);
  padding: 1px 4px;
  border-radius: 3px;
  font-size: 12px;
  font-family: ui-monospace, 'SF Mono', Menlo, monospace;
}

.node-content :deep(pre) {
  background: var(--bg-elevated);
  padding: 8px;
  border-radius: 4px;
  overflow-x: auto;
  margin: 0 0 8px 0;
}

.node-content :deep(pre code) {
  background: none;
  padding: 0;
}

.node-content :deep(strong) {
  font-weight: 600;
}

.node-content :deep(em) {
  font-style: italic;
}

.node-content :deep(img) {
  max-width: 100%;
  height: auto;
  border-radius: 4px;
  margin: 4px 0;
}

.node-content :deep(a) {
  color: var(--primary-color);
  text-decoration: none;
}

/* Wikilink styling */
.node-content :deep(.wikilink) {
  color: var(--primary-color);
  cursor: pointer;
  text-decoration: none;
  border-bottom: 1px dashed var(--primary-color);
}

.node-content :deep(.wikilink:hover) {
  border-bottom-style: solid;
}

/* Missing wikilink (target node doesn't exist) */
.node-content :deep(.wikilink.missing) {
  color: var(--text-muted);
  border-color: var(--text-muted);
}

.node-content :deep(blockquote) {
  border-left: 3px solid var(--border-default);
  margin: 0 0 8px 0;
  padding-left: 12px;
  color: var(--text-muted);
}

.node-content :deep(.mermaid-wrapper) {
  margin: 8px 0;
  overflow-x: auto;
}

.node-content :deep(.mermaid) {
  display: flex;
  justify-content: center;
}

.node-content :deep(.mermaid svg) {
  max-width: 100%;
  height: auto;
  /* Prevent blurry SVG in scaled containers */
  transform: translateZ(0);
  -webkit-transform: translateZ(0);
}

.node-content :deep(.mermaid svg text) {
  /* Keep text crisp */
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

/* Typst math rendering */
.node-content :deep(.typst-math) {
  font-family: 'Computer Modern', serif;
}

.node-content :deep(.typst-display) {
  display: block;
  text-align: center;
  margin: 12px 0;
  overflow-x: auto;
}

.node-content :deep(.typst-inline) {
  display: inline;
  vertical-align: middle;
}

.node-content :deep(.typst-pending) {
  color: var(--text-muted);
  font-style: italic;
  font-size: 0.9em;
}

.node-content :deep(.typst-error) {
  color: var(--error-text, #dc2626);
  font-family: monospace;
  font-size: 0.85em;
  background: var(--error-bg, #fef2f2);
  padding: 2px 4px;
  border-radius: 3px;
}

.node-content :deep(.typst-math svg) {
  max-width: 100%;
  height: auto;
  vertical-align: middle;
}

.empty-state-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
}

.empty-state-box {
  text-align: center;
  color: var(--text-muted);
  background: var(--bg-surface);
  padding: 24px 32px;
  border-radius: 12px;
  border: 1px solid var(--border-default);
  box-shadow: 0 4px 12px var(--shadow-sm);
}

.empty-state-box h3 {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-secondary);
  margin-bottom: 8px;
}

.empty-state-box p {
  font-size: 14px;
  margin: 0;
}

.edge-panel {
  position: absolute;
  top: 16px;
  right: 180px;
  width: 180px;
  background: var(--bg-surface-alt);
  border: 1px solid var(--border-default);
  border-radius: 6px;
  box-shadow: 0 2px 8px var(--shadow-sm);
  z-index: 100;
  animation: fadeIn 0.1s ease-out;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(-4px); }
  to { opacity: 1; transform: translateY(0); }
}

.edge-panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 10px;
  border-bottom: 1px solid var(--border-default);
  font-weight: 500;
  font-size: 12px;
  color: var(--text-muted);
}

.edge-panel-header button {
  background: none;
  border: none;
  cursor: pointer;
  color: var(--text-muted);
  font-size: 16px;
}

.edge-panel-content {
  padding: 10px;
}

.edge-panel-content label {
  display: block;
  font-size: 12px;
  color: var(--text-muted);
  margin-bottom: 4px;
}

.edge-panel-content select {
  width: 100%;
  padding: 6px 8px;
  border: 1px solid var(--border-default);
  border-radius: 4px;
  font-size: 13px;
  margin-bottom: 12px;
  background: var(--bg-surface);
  color: var(--text-main);
}

.edge-label-input {
  width: 100%;
  padding: 6px 8px;
  border: 1px solid var(--border-default);
  border-radius: 4px;
  font-size: 13px;
  margin-bottom: 12px;
  background: var(--bg-surface);
  color: var(--text-main);
}

.edge-label-input:focus {
  outline: none;
  border-color: var(--primary-color);
}

.edge-color-picker {
  display: flex;
  gap: 4px;
  margin-bottom: 12px;
}

.edge-color-dot {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  border: 2px solid var(--border-default);
  cursor: pointer;
  padding: 0;
}

.edge-color-dot:hover {
  border-color: var(--text-muted);
}

.edge-color-dot.active {
  border-color: var(--text-main);
  box-shadow: 0 0 0 2px var(--bg-surface);
}

.edge-style-picker {
  display: flex;
  gap: 4px;
  margin-bottom: 12px;
}

.edge-style-btn {
  flex: 1;
  padding: 6px;
  border: 1px solid var(--border-default);
  border-radius: 4px;
  background: var(--bg-surface);
  color: var(--text-main);
  cursor: pointer;
  font-size: 14px;
}

.edge-style-btn:hover {
  background: var(--bg-elevated);
}

.edge-style-btn.active {
  border-color: var(--primary-color);
  background: var(--bg-elevated);
}

.direction-btns {
  display: flex;
  gap: 6px;
  margin-bottom: 12px;
}

.direction-btns button {
  flex: 1;
  padding: 6px 8px;
  background: var(--bg-surface);
  border: 1px solid var(--border-default);
  color: var(--text-main);
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
}

.direction-btns button:hover {
  background: var(--bg-elevated);
}

.insert-node-btn {
  width: 100%;
  padding: 8px;
  background: var(--bg-surface);
  border: 1px solid var(--primary-color);
  border-radius: 4px;
  color: var(--primary-color);
  font-size: 12px;
  cursor: pointer;
  margin-bottom: 8px;
}

.insert-node-btn:hover {
  background: var(--bg-elevated);
}

.delete-edge-btn {
  width: 100%;
  padding: 8px;
  background: var(--danger-bg);
  border: 1px solid var(--danger-border);
  border-radius: 4px;
  color: var(--danger-color);
  font-size: 12px;
  cursor: pointer;
}

.delete-edge-btn:hover {
  opacity: 0.9;
}

.zoom-controls {
  position: absolute;
  bottom: 16px;
  right: 16px;
  display: flex;
  align-items: center;
  gap: 6px;
  background: var(--bg-surface);
  border: 1px solid var(--border-default);
  border-radius: 6px;
  padding: 4px 8px;
  box-shadow: 0 2px 8px var(--shadow-sm);
  z-index: 50;
}

.zoom-controls button {
  width: 26px;
  height: 26px;
  border: 1px solid var(--border-default);
  background: var(--bg-surface);
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  position: relative;
}

/* Tooltip styles */
.zoom-controls button[data-tooltip]:hover::after {
  content: attr(data-tooltip);
  position: absolute;
  bottom: 100%;
  left: 50%;
  transform: translateX(-50%);
  margin-bottom: 8px;
  padding: 6px 10px;
  background: var(--bg-elevated);
  color: var(--text-main);
  font-size: 11px;
  font-weight: 500;
  white-space: nowrap;
  border-radius: 4px;
  border: 1px solid var(--border-default);
  box-shadow: 0 2px 8px var(--shadow-md);
  z-index: 100;
  pointer-events: none;
}

.zoom-controls button svg {
  flex-shrink: 0;
}

.zoom-controls button:hover {
  background: var(--bg-elevated);
}

.zoom-controls button.active {
  background: var(--primary-color);
  color: white;
  border-color: var(--primary-color);
}

.zoom-controls span {
  font-size: 11px;
  color: var(--text-muted);
  min-width: 36px;
  text-align: center;
}

.status-bar {
  position: absolute;
  bottom: 16px;
  left: 16px;
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--bg-surface);
  border: 1px solid var(--border-default);
  border-radius: 6px;
  padding: 6px 12px;
  font-size: 11px;
  color: var(--text-muted);
  box-shadow: 0 2px 8px var(--shadow-sm);
  z-index: 50;
}

.status-bar .sep {
  color: #e2e8f0;
}

.status-bar .hint {
  color: #94a3b8;
}

.status-bar .ai-btn {
  margin-left: 8px;
  padding: 4px 10px;
  border: 1px solid var(--border-default);
  border-radius: 4px;
  background: var(--bg-surface-alt);
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 11px;
  font-weight: 600;
}

.status-bar .ai-btn:hover {
  background: var(--primary-color);
  color: white;
  border-color: var(--primary-color);
}

.status-bar .perf-mode {
  background: #f97316;
  color: white;
  padding: 2px 6px;
  border-radius: 3px;
  font-weight: 700;
  font-size: 10px;
}

/* Magnifying lens - water droplet effect (GPU accelerated) */
.magnifier {
  position: absolute;
  border-radius: 50%;
  overflow: visible;
  pointer-events: none;
  z-index: 100;
  border: 3px solid #3b82f6;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
  background: transparent;
}

@keyframes magnifier-appear {
  from {
    transform: scale(0.8);
    opacity: 0;
  }
  to {
    transform: scale(1);
    opacity: 1;
  }
}

/* Removed white highlight - was distracting */

/* Warp container - circular clip */
.magnifier-warp {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  overflow: hidden;
  background: var(--bg-canvas, #f4f4f5);
}

.magnifier-node {
  position: absolute;
  border: 3px solid #333;
  border-radius: 8px;
  padding: 8px 12px;
  box-sizing: border-box;
  background: #fff !important;
}

.magnifier-node-title {
  font-size: 18px;
  font-weight: 700;
  color: #000 !important;
  line-height: 1.3;
  display: block;
}

.minimap {
  position: absolute;
  top: 16px;
  right: 16px;
  background: var(--bg-surface);
  border: 1px solid var(--border-default);
  border-radius: 8px;
  box-shadow: 0 2px 8px var(--shadow-sm);
  z-index: 50;
  cursor: pointer;
  overflow: hidden;
}

.minimap:hover {
  border-color: var(--text-muted);
}

.minimap svg {
  display: block;
}

/* Frames */
.canvas-frame {
  position: absolute;
  top: 0;
  left: 0;
  border: 2px dashed var(--border-default);
  border-radius: 12px;
  background: transparent;
  pointer-events: auto;
  cursor: move;
  z-index: 0;
}

.canvas-frame.selected {
  border-style: solid;
  border-color: var(--primary-color);
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2);
}

.frame-header {
  position: absolute;
  top: -28px;
  left: 8px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.frame-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-secondary);
  background: var(--bg-surface);
  padding: 4px 10px;
  border-radius: 4px;
  border: 1px solid var(--border-subtle);
  white-space: nowrap;
}

.canvas-frame.selected .frame-title {
  color: var(--primary-color);
  border-color: var(--primary-color);
}

.frame-title-editor {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-main);
  background: var(--bg-surface);
  padding: 4px 10px;
  border-radius: 4px;
  border: 1px solid var(--primary-color);
  outline: none;
  min-width: 100px;
}

.frame-resize-handle {
  position: absolute;
  bottom: 0;
  right: 0;
  width: 16px;
  height: 16px;
  cursor: se-resize;
  background: linear-gradient(
    135deg,
    transparent 50%,
    var(--border-default) 50%,
    var(--border-default) 60%,
    transparent 60%,
    transparent 70%,
    var(--border-default) 70%,
    var(--border-default) 80%,
    transparent 80%
  );
  border-radius: 0 0 10px 0;
  opacity: 0;
  transition: opacity 0.15s;
}

.canvas-frame:hover .frame-resize-handle,
.canvas-frame.selected .frame-resize-handle {
  opacity: 1;
}

.frame-delete-btn {
  margin-left: 8px;
  width: 20px;
  height: 20px;
  border: none;
  border-radius: 4px;
  background: var(--danger-color);
  color: white;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0.8;
}

.frame-delete-btn:hover {
  opacity: 1;
}

.frame-color-picker {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-left: 8px;
  padding: 4px 6px;
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  border-radius: 4px;
}

.frame-color-dot {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  border: 2px solid transparent;
  cursor: pointer;
  transition: transform 0.1s;
}

.frame-color-dot:hover {
  transform: scale(1.2);
}

.frame-color-dot.active {
  border-color: var(--text-main);
}

</style>
