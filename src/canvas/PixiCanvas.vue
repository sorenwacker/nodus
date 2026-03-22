<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, nextTick, inject } from 'vue'
import { useI18n } from 'vue-i18n'
import { useNodesStore } from '../stores/nodes'
import { useThemesStore } from '../stores/themes'
// marked is imported in useContentRenderer composable
import { openExternal } from '../lib/tauri'
import { writeText as writeClipboard } from '@tauri-apps/plugin-clipboard-manager'
import { optimizeNodeEntrypoints } from './routing'
import { useLLM, executeTool, llmQueue, type ToolContext } from './llm'
import { llmStorage, memoryStorage } from '../lib/storage'
import { useMinimap } from './composables/useMinimap'
import { measureNodeContent } from './utils/nodeSizing'
import { useAgentRunner, type AgentContext } from './composables/useAgentRunner'
import { useNeighborhoodMode } from './composables/useNeighborhoodMode'
import { useLasso } from './composables/useLasso'
import { useFrames } from './composables/useFrames'
import { useLayout } from './composables/useLayout'
import { usePdfDrop } from './composables/usePdfDrop'
import { useNodeAgent, type NodeAgentContext } from './composables/useNodeAgent'
import { useViewState } from './composables/useViewState'
import { useNodeClipboard } from './composables/useNodeClipboard'
import { useNodeEditor } from './composables/useNodeEditor'
import { useEdgeManipulation } from './composables/useEdgeManipulation'
import { useContentRenderer } from './composables/useContentRenderer'
import ImportOptionsModal from '../components/ImportOptionsModal.vue'
import { useCanvasPan } from './composables/useCanvasPan'
import { useContextMenu } from './composables/useContextMenu'
import { NODE_DEFAULTS } from './constants'
import CanvasStatusBar from './components/CanvasStatusBar.vue'
import CanvasControls from './components/CanvasControls.vue'
import KeyboardShortcutsModal from '../components/KeyboardShortcutsModal.vue'
import NodePicker from '../components/NodePicker.vue'
import PlanApprovalModal from '../components/PlanApprovalModal.vue'
import AgentTaskPanel from '../components/AgentTaskPanel.vue'
import { usePlanState } from './llm/planState'
import { useAgentTasksStore } from '../stores/agentTasks'
import { useMarkerHandlers } from './composables/useMarkerHandlers'
import { useLLMTools } from './composables/useLLMTools'
import { usePlanHandlers } from './composables/usePlanHandlers'
import { useStorylines } from './composables/useStorylines'
import { useEdgeStyling } from './composables/useEdgeStyling'
import { useNodeResizing } from './composables/useNodeResizing'
import { useNodeDragging } from './composables/useNodeDragging'
import { useCanvasZoom } from './composables/useCanvasZoom'
import { useEdgeRouting } from './composables/useEdgeRouting'
import { useEdgeVisibility } from './composables/useEdgeVisibility'
import { useViewportCulling } from './composables/useViewportCulling'
import { useGraphMetrics } from './composables/useGraphMetrics'
import { useCanvasDisplay } from './composables/useCanvasDisplay'
import { useKeyboardShortcuts } from './composables/useKeyboardShortcuts'

// Undo injection for position, content, and deletion changes
import type { Node, Edge } from '../types'

const injectedPushUndo = inject<(() => void) | undefined>('pushUndo')
const injectedPushContentUndo = inject<((nodeId: string, oldContent: string | null, oldTitle: string) => void) | undefined>('pushContentUndo')
const injectedPushDeletionUndo = inject<((node: Node, edges: Edge[]) => void) | undefined>('pushDeletionUndo')
const injectedPushCreationUndo = inject<((nodeIds: string[]) => void) | undefined>('pushCreationUndo')

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

const pushCreationUndo = (nodeIds: string[]) => {
  if (injectedPushCreationUndo) {
    injectedPushCreationUndo(nodeIds)
  } else {
    console.warn('pushCreationUndo not provided - creation undo will not work')
  }
}

// Content renderer is configured via composable

const { t } = useI18n()
const store = useNodesStore()
const themesStore = useThemesStore()
const agentTasksStore = useAgentTasksStore()
const showToast = inject<(message: string, type: 'error' | 'success' | 'info') => void>('showToast')

// Plan state for interactive approval flow
const planState = usePlanState()
// Destructure refs for template auto-unwrapping
const { currentPlan: planCurrentPlan, showApprovalModal: planShowApprovalModal } = planState

// Reactive theme tracking
const isDarkMode = ref(false)

function updateTheme() {
  const theme = document.documentElement.getAttribute('data-theme') || 'light'
  currentTheme.value = theme
  isDarkMode.value = theme === 'dark' || theme === 'pitch-black' || theme === 'cyber'
}

// Track if we've centered the view initially
let hasInitiallyCentered = false

// Canvas element ref (needed early for view state and layout functions)
const canvasRef = ref<HTMLElement | null>(null)

// View state composable - handles scale, offset, persistence
const viewState = useViewState({
  getCanvasRect: () => canvasRef.value?.getBoundingClientRect() || null,
})
const { scale, offsetX, offsetY, isZooming, hasSavedView: savedView, scheduleSaveViewState, centerGrid, screenToCanvas, startZooming } = viewState

onMounted(() => {
  // Setup content renderer watchers for markdown/math/mermaid
  setupContentWatchers()

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

  // Listen for LLM enabled setting changes
  const handleLLMEnabledChange = (e: Event) => {
    llmEnabled.value = (e as CustomEvent).detail
  }
  window.addEventListener('nodus-llm-enabled-change', handleLLMEnabledChange)

  // Setup PDF drop listener
  pdfDrop.setup()

  onUnmounted(() => {
    observer.disconnect()
    window.removeEventListener('resize', updateViewportSize)
    window.removeEventListener('zoom-to-node', handleZoomToNode)
    window.removeEventListener('nodus-llm-enabled-change', handleLLMEnabledChange)
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

// centerGrid is provided by useViewState composable

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

// Re-center when workspace changes - auto-fit so nodes are visible
watch(() => store.currentWorkspaceId, () => {
  // Exit neighborhood mode when workspace changes
  neighborhood.exit()
  // Auto-fit to content when switching workspaces (so nodes are visible)
  hasInitiallyCentered = false
  // Use nextTick + timeout to ensure Vue reactivity has updated filteredNodes
  setTimeout(() => {
    if (store.filteredNodes.length > 0) {
      fitToContent()
      hasInitiallyCentered = true
    }
  }, 200)
})

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

// Viewport culling composable - filters nodes visible in viewport
const viewportCulling = useViewportCulling({
  scale,
  offsetX,
  offsetY,
  displayNodes,
})
const { viewportWidth, viewportHeight, visibleNodes, visibleNodeIds } = viewportCulling

// Graph metrics composable - computes graph size thresholds and LOD mode
const graphMetrics = useGraphMetrics({
  displayNodes,
  visibleNodes,
  filteredNodes: computed(() => store.filteredNodes),
  filteredEdges: computed(() => store.filteredEdges),
  neighborhoodMode,
  scale,
})
const {
  isLargeGraph,
  isHugeGraph,
  isMassiveGraph,
  isSemanticZoomCollapsed,
  isLODMode,
  nodeDegree,
  getLODRadius,
} = graphMetrics

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

// Node clipboard composable
const clipboard = useNodeClipboard({
  store: {
    selectedNodeIds: store.selectedNodeIds,
    getNode: store.getNode,
    getFilteredEdges: () => store.filteredEdges,
    createNode: store.createNode,
    createEdge: store.createEdge,
    setSelectedNodeIds: (ids: string[]) => { store.selectedNodeIds.splice(0, store.selectedNodeIds.length, ...ids) },
  },
  screenToCanvas,
  getViewportSize: () => ({ width: viewportWidth.value, height: viewportHeight.value }),
  showToast,
})
const { copySelectedNodes, pasteNodes } = clipboard

// Content renderer composable - handles markdown, math, mermaid rendering with caching
const contentRenderer = useContentRenderer({
  getFilteredNodes: () => store.filteredNodes,
  isDarkMode: () => isDarkMode.value,
})
const { nodeRenderedContent, renderMarkdown, renderTypstMath, renderMermaidDiagrams, setupWatchers: setupContentWatchers } = contentRenderer

// Node editor composable - handles inline editing with autosave
const nodeEditor = useNodeEditor({
  store: {
    getNode: store.getNode,
    updateNodeContent: store.updateNodeContent,
    updateNodeTitle: store.updateNodeTitle,
  },
})
// Use composable for state and title editing; content editing functions are local for mermaid render + auto-fit
const { editingNodeId, editContent, editingTitleId, editTitle, startEditing, startEditingTitle, saveTitleEditing, cancelTitleEditing } = nodeEditor

// Edge manipulation composable - handles edge creation, selection, modification
const edgeManipulation = useEdgeManipulation({
  store: {
    getNode: store.getNode,
    edges: store.edges,
    filteredEdges: store.filteredEdges,
    filteredNodes: store.filteredNodes,
    createNode: store.createNode,
    createEdge: store.createEdge,
    deleteEdge: store.deleteEdge,
    selectNode: store.selectNode,
  },
  screenToCanvas,
})
const {
  isCreatingEdge, edgeStartNode, edgePreviewEnd, selectedEdge,
  onEdgePreviewMove, onEdgeCreate, onEdgeClick, deleteSelectedEdge, changeEdgeLabel,
  reverseEdge, isEdgeBidirectional, makeUnidirectional, makeBidirectional,
  insertNodeOnEdge,
} = edgeManipulation

// Canvas zoom composable - handles wheel zoom/pan and magnifier
const canvasZoom = useCanvasZoom({
  canvasRef,
  scale,
  offsetX,
  offsetY,
  isZooming,
  startZooming,
  scheduleSaveViewState,
  magnifierThreshold: 0.4, // MAGNIFIER_THRESHOLD
})
const { showMagnifier, magnifierPos, onWheel, onCanvasMouseMove, onCanvasMouseEnter, onCanvasMouseLeave } = canvasZoom

// Canvas display composable - handles magnifier, thumbnails, font scale
const canvasDisplay = useCanvasDisplay({
  scale,
  filteredNodes: computed(() => store.filteredNodes),
  isLargeGraph,
  showMagnifier,
})
const {
  magnifierEnabled,
  shouldShowMagnifier,
  toggleMagnifier,
  MAGNIFIER_SIZE,
  MAGNIFIER_ZOOM,
  nodeFirstImage,
  showImageThumbnail,
  fontScale,
  increaseFontScale,
  decreaseFontScale,
} = canvasDisplay

// Initialize font scale on mount
onMounted(() => {
  document.documentElement.style.setProperty('--font-scale', String(fontScale.value))
})

// Help modal
const showHelpModal = ref(false)

// Link picker from context menu
const showLinkPicker = ref(false)
const linkPickerSourceNodeId = ref<string | null>(null)

function openLinkPicker() {
  linkPickerSourceNodeId.value = contextMenuNodeId.value
  showLinkPicker.value = true
  closeContextMenu()
}

function closeLinkPicker() {
  showLinkPicker.value = false
  linkPickerSourceNodeId.value = null
}

async function linkToNode(targetNodeId: string) {
  if (!linkPickerSourceNodeId.value) return
  await store.addEdge(linkPickerSourceNodeId.value, targetNodeId)
  closeLinkPicker()
}

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

// Edge stroke width - scale inversely to maintain constant visual width
// Minimum 0.5px to keep edges visible at high zoom
const edgeStrokeWidth = computed(() => {
  return Math.max(0.5, 1 / scale.value)
})

// Node border width - scale inversely to maintain constant visual width
const nodeBorderWidth = computed(() => {
  return 1 / scale.value
})

// Frame border width - scale inversely to maintain constant visual width
const frameBorderWidth = computed(() => {
  return 1 / scale.value
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

// Canvas panning composable
const canvasPan = useCanvasPan({
  getOffset: () => ({ x: offsetX.value, y: offsetY.value }),
  setOffset: (x, y) => {
    offsetX.value = x
    offsetY.value = y
  },
  onPanEnd: () => {
    lastDragEndTime = Date.now()
  },
})
const { isPanning, startPan } = canvasPan
const hoveredNodeId = ref<string | null>(null)
const hoverMousePos = ref({ x: 0, y: 0 })

// Context menu composable
const contextMenu = useContextMenu({
  getSelectedNodeIds: () => store.selectedNodeIds,
  addNodeToStoryline: (storylineId, nodeId) => store.addNodeToStoryline(storylineId, nodeId),
  createStoryline: (title) => store.createStoryline(title),
  moveNodesToWorkspace: (nodeIds, workspaceId) => store.moveNodesToWorkspace(nodeIds, workspaceId),
})
// Expose refs for template compatibility
const contextMenuVisible = contextMenu.visible
const contextMenuPosition = contextMenu.position
const contextMenuNodeId = contextMenu.nodeId
const contextMenuStorylineSubmenu = contextMenu.storylineSubmenu
const contextMenuWorkspaceSubmenu = contextMenu.workspaceSubmenu

// Node agent mode - always agent (tools enabled)
const nodeAgentMode = ref<'simple' | 'agent'>('agent')
const showNodeAgentLog = ref(false)
const nodeAgent = useNodeAgent()
// Computed for proper reactivity tracking of agent log
const nodeAgentLog = computed(() => nodeAgent.log.value)

// Tooltip for zoomed-out hover - shows node info when scale is low or in LOD mode
const showHoverTooltip = computed(() => {
  return hoveredNodeId.value && (scale.value < 0.5 || isLODMode.value)
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

// Prevent double-click node creation right after drag
let lastDragEndTime = 0

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
    get frames() { return store.frames },
    get filteredNodes() { return store.filteredNodes },
    get selectedNodeIds() { return store.selectedNodeIds },
    get selectedFrameId() { return store.selectedFrameId },
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
function createFrameAtPosition(x: number, y: number) { frames.createAtPosition(x, y) }
function cancelFramePlacement() { frames.cancelPlacement() }
function deleteSelectedFrame() { frames.deleteSelected() }

// Layout composable
const layout = useLayout({
  store: {
    getNodes: () => [...store.nodes],
    getFilteredNodes: () => [...store.filteredNodes],
    getFilteredEdges: () => [...store.filteredEdges],
    getFilteredFrames: () => [...store.filteredFrames],
    getSelectedNodeIds: () => [...store.selectedNodeIds],
    updateNodePosition: store.updateNodePosition,
    updateFramePosition: store.updateFramePosition,
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
const isLayouting = ref(false)

async function autoLayoutNodes(type: 'grid' | 'horizontal' | 'vertical' | 'force' | 'hierarchical' = 'grid') {
  isLayouting.value = true
  console.log(`[LAYOUT] Starting ${type} layout...`)
  try {
    await layout.autoLayout(type)
    console.log(`[LAYOUT] ${type} layout complete`)
  } finally {
    isLayouting.value = false
  }
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

// LLM interface - using composable
const llm = useLLM()
const {
  model: ollamaModel,
  contextLength: ollamaContextLength,
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
const lastContextSize = ref(0) // Track context size of last request
const llmEnabled = ref(llmStorage.getLLMEnabled())
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
    deleteNode: store.deleteNode,
    createEdge: store.createEdge,
    createFrame: store.createFrame,
    importOntology: store.importOntology,
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
    screenToCanvas: (screenX: number, screenY: number) => {
      const rect = canvasRef.value?.getBoundingClientRect()
      if (!rect) return { x: 0, y: 0 }
      return {
        x: (screenX - rect.left - offsetX.value) / scale.value,
        y: (screenY - rect.top - offsetY.value) / scale.value,
      }
    },
  },
  llm: {
    simpleGenerate: callOllama,
  },
  pushCreationUndo,
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

function onNodePromptKeydown(e: KeyboardEvent) {
  if (e.key === 'ArrowUp') {
    e.preventDefault()
    const prev = navigateHistory('up')
    if (prev !== null) nodePrompt.value = prev
  } else if (e.key === 'ArrowDown') {
    e.preventDefault()
    const next = navigateHistory('down')
    if (next !== null) nodePrompt.value = next
  }
}

// Marker handlers composable for processing tool result markers
const markerHandlers = useMarkerHandlers({
  planState,
  nodes: computed(() => store.filteredNodes),
  log: (msg: string) => agentLog.value.push(msg),
})

// LLM tools composable for handling LLM-dependent tools
const llmTools = useLLMTools({
  llmQueue,
  callOllama,
  store: {
    filteredNodes: store.filteredNodes,
    updateNodeContent: store.updateNodeContent,
    updateNodePosition: store.updateNodePosition,
    updateNodeColor: store.updateNodeColor,
    createEdge: store.createEdge,
    currentWorkspaceId: store.currentWorkspaceId,
  },
  themesStore,
  planState,
  tasks: agentTasks,
  memoryStorage,
  log: (msg: string) => agentLog.value.push(msg),
  pushContentUndo,
})

async function executeAgentTool(name: string, args: Record<string, unknown>): Promise<string> {
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
      updateEdgeLabel: store.updateEdgeLabel,
      updateEdgeColor: store.updateEdgeColor,
    },
    log: (msg: string) => agentLog.value.push(msg),
    screenToCanvas,
    snapToGrid,
    ollamaModel: ollamaModel.value,
    ollamaContextLength: ollamaContextLength.value,
  }

  // Try extracted executor (handles simple tools)
  const result = await executeTool(name, args, toolCtx)
  console.log(`[Tool] ${name} -> executeTool returned:`, result.slice(0, 100))

  // Try marker handlers for async processing
  const markerResult = await markerHandlers.handleMarker(result)
  if (markerResult !== null) {
    return markerResult
  }

  // If not a marker and not unhandled, return result
  if (!result.startsWith('__UNHANDLED__:')) {
    return result
  }

  console.log(`[Tool] ${name} falling through to LLM tools`)

  // Try LLM-dependent tools
  const llmResult = await llmTools.executeLLMTool(name, args)
  if (llmResult !== null) {
    return llmResult
  }

  return `Unknown tool: ${name}`
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
  filteredEdges: () => store.filteredEdges,
  cleanupOrphanEdges: () => store.cleanupOrphanEdges(),
  workspaceId: () => store.currentWorkspaceId || 'default',
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

// Plan approval handlers (via composable)
const planHandlers = usePlanHandlers({
  planState,
  agentRunner,
  agentLog,
  agentTasksStore,
})
const {
  handlePlanApprove,
  handlePlanReject,
  handlePlanModify,
  handlePlanAddStep,
  handlePlanRemoveStep,
  closePlanModal,
} = planHandlers

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
  savePromptToHistory(prompt)

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
  } catch (e) {
    alert(e instanceof Error ? e.message : String(e))
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

// Transform for the canvas content
const transform = computed(() => {
  // Use translate3d for GPU acceleration
  return `translate3d(${offsetX.value}px, ${offsetY.value}px, 0) scale(${scale.value})`
})

// Pan with left mouse drag on empty canvas space
function onCanvasMouseDown(e: MouseEvent) {
  // Handle frame placement mode
  if (frames.pendingFramePlacement.value && e.button === 0) {
    e.preventDefault()
    const rect = canvasRef.value?.getBoundingClientRect()
    if (rect) {
      const canvasX = (e.clientX - rect.left - offsetX.value) / scale.value
      const canvasY = (e.clientY - rect.top - offsetY.value) / scale.value
      createFrameAtPosition(canvasX, canvasY)
    }
    return
  }

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

// Node hover handlers for tooltip
function onNodeMouseEnter(e: MouseEvent, nodeId: string) {
  hoveredNodeId.value = nodeId
  hoverMousePos.value = { x: e.clientX, y: e.clientY }
}

function onNodeMouseMove(e: MouseEvent) {
  hoverMousePos.value = { x: e.clientX, y: e.clientY }
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

// Node resizing composable
const nodeResizing = useNodeResizing({
  store: {
    getNode: store.getNode,
    updateNodeSize: store.updateNodeSize,
    updateNodePosition: store.updateNodePosition,
    get selectedNodeIds() { return store.selectedNodeIds },
  },
  scale,
  gridLockEnabled,
  snapToGrid,
  neighborhoodMode,
  focusNodeId,
  layoutNeighborhood,
  pushOverlappingNodesAway,
  setLastDragEndTime: (time: number) => { lastDragEndTime = time },
})
const { resizingNode, resizePreview, onResizeMouseDown } = nodeResizing

// Node dragging composable
const nodeDragging = useNodeDragging({
  store: {
    getNode: store.getNode,
    updateNodePosition: store.updateNodePosition,
    selectNode: store.selectNode,
    get selectedNodeIds() { return store.selectedNodeIds },
    get filteredNodes() { return store.filteredNodes },
    get filteredEdges() { return store.filteredEdges },
    get frames() { return store.frames },
    assignNodesToFrame: store.assignNodesToFrame,
    refreshNodeFromFile: store.refreshNodeFromFile,
    get nodeLayoutVersion() { return store.nodeLayoutVersion },
    set nodeLayoutVersion(v: number) { store.nodeLayoutVersion = v },
  },
  scale,
  offset: computed(() => ({ x: offsetX.value, y: offsetY.value })),
  canvasRef,
  gridLockEnabled,
  snapToGrid,
  neighborhoodMode,
  focusNodeId,
  isLODMode,
  editingNodeId,
  selectedEdge,
  isCreatingEdge,
  edgeStartNode,
  edgePreviewEnd,
  layoutNeighborhood,
  pushOverlappingNodesAway,
  pushUndo,
  screenToCanvas,
  zoomToNode,
  optimizeNodeEntrypoints,
  onEdgePreviewMove,
  onEdgeCreate,
  setLastDragEndTime: (time: number) => { lastDragEndTime = time },
})
const { draggingNode, onNodeMouseDown } = nodeDragging

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

// Custom saveEditing with mermaid render and auto-fit
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

// Track current theme name for reactive palette switching
const currentTheme = ref(document.documentElement.getAttribute('data-theme') || 'light')

// Edge styling composable - handles colors, styles, and theme-aware highlighting
const edgeStyling = useEdgeStyling({
  store: {
    updateEdgeLinkType: store.updateEdgeLinkType,
  },
  selectedEdgeId: selectedEdge,
  currentTheme,
})
const {
  edgeStyles,
  edgeStyleMap,
  globalEdgeStyle,
  edgeColorPalette,
  defaultEdgeColor,
  highlightColor,
  selectedColor,
  nodeColors,
  allMarkerColors,
  frameColors,
  cycleEdgeStyle,
  getEdgeStyle,
  setEdgeStyle,
  getEdgeColor,
  getEdgeHighlightColor,
  getArrowMarkerId,
  changeEdgeColor,
} = edgeStyling

// Edge routing composable - computes edge paths with routing, port assignments, and optimization
const { edgeLines } = useEdgeRouting({
  store: {
    nodeLayoutVersion: store.nodeLayoutVersion,
    nodes: store.nodes,
    edges: store.edges,
    filteredEdges: store.filteredEdges,
  },
  displayNodes,
  neighborhoodMode,
  focusNodeId,
  isMassiveGraph,
  isHugeGraph,
  globalEdgeStyle,
  edgeStyleMap,
  getNodeHeight,
})

// Edge visibility composable - filters edges and pre-computes rendering properties
const { visibleEdgeLines } = useEdgeVisibility({
  edgeLines,
  visibleNodeIds,
  hoveredNodeId,
  selectedNodeIds: computed(() => store.selectedNodeIds),
  selectedEdge,
  highlightedEdgeIds,
  edgeStrokeWidth,
  highlightColor,
  selectedColor,
  defaultEdgeColor,
  getEdgeHighlightColor,
  getNode: store.getNode,
})

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

  // Wait for Vue to render the view mode content and render math
  await nextTick()
  await renderTypstMath()
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

// Map legacy color values to current colors
const legacyColorMap: Record<string, string> = {
  // Old solid pastels
  '#fecaca': 'rgba(239, 68, 68, 0.08)',
  '#fed7aa': 'rgba(249, 115, 22, 0.08)',
  '#fef08a': 'rgba(234, 179, 8, 0.08)',
  '#bbf7d0': 'rgba(34, 197, 94, 0.08)',
  '#bfdbfe': 'rgba(59, 130, 246, 0.08)',
  '#e9d5ff': 'rgba(168, 85, 247, 0.08)',
  '#fbcfe8': 'rgba(236, 72, 153, 0.08)',
  // Old very light pastels
  '#fef2f2': 'rgba(239, 68, 68, 0.08)',
  '#fff7ed': 'rgba(249, 115, 22, 0.08)',
  '#fefce8': 'rgba(234, 179, 8, 0.08)',
  '#f0fdf4': 'rgba(34, 197, 94, 0.08)',
  '#eff6ff': 'rgba(59, 130, 246, 0.08)',
  '#faf5ff': 'rgba(168, 85, 247, 0.08)',
  '#fdf2f8': 'rgba(236, 72, 153, 0.08)',
  // Old rgba values with different alphas
  'rgba(239, 68, 68, 0.15)': 'rgba(239, 68, 68, 0.08)',
  'rgba(249, 115, 22, 0.15)': 'rgba(249, 115, 22, 0.08)',
  'rgba(234, 179, 8, 0.15)': 'rgba(234, 179, 8, 0.08)',
  'rgba(34, 197, 94, 0.15)': 'rgba(34, 197, 94, 0.08)',
  'rgba(59, 130, 246, 0.15)': 'rgba(59, 130, 246, 0.08)',
  'rgba(168, 85, 247, 0.15)': 'rgba(168, 85, 247, 0.08)',
  'rgba(236, 72, 153, 0.15)': 'rgba(236, 72, 153, 0.08)',
}

// Get node background - layers transparent color over solid base
function getNodeBackground(colorTheme: string | null): string | undefined {
  if (!colorTheme) return undefined
  // Normalize legacy colors to current format
  const normalizedColor = legacyColorMap[colorTheme] || colorTheme

  // Check if color is problematic for current theme
  // In dark mode, don't use very light colors; in light mode, don't use very dark colors
  if (normalizedColor.startsWith('#')) {
    const hex = normalizedColor.replace('#', '')
    const r = parseInt(hex.substr(0, 2), 16)
    const g = parseInt(hex.substr(2, 2), 16)
    const b = parseInt(hex.substr(4, 2), 16)
    const brightness = (r * 299 + g * 587 + b * 114) / 1000

    const isDarkTheme = currentTheme.value === 'dark' || currentTheme.value === 'pitch-black' || currentTheme.value === 'cyber'

    // If color is too bright for dark mode (>200) or too dark for light mode (<50), skip it
    if ((isDarkTheme && brightness > 200) || (!isDarkTheme && brightness < 50)) {
      return undefined
    }
  }

  // Use linear-gradient to layer transparent color over solid background
  return `linear-gradient(${normalizedColor}, ${normalizedColor}), var(--bg-surface)`
}

// Context menu handler
function onContextMenu(e: MouseEvent) {
  e.preventDefault()

  // Check if clicking on a node
  const target = e.target as HTMLElement
  const nodeCard = target.closest('.node-card') as HTMLElement | null

  if (nodeCard) {
    const nodeId = nodeCard.dataset.nodeId
    if (nodeId) {
      contextMenu.open(e, nodeId)

      // Select the node if not already selected
      if (!store.selectedNodeIds.includes(nodeId)) {
        store.selectNode(nodeId)
      }
      return
    }
  }

  // Hide context menu if clicking elsewhere
  contextMenu.close()
}

function closeContextMenu() {
  contextMenu.close()
}

// Storylines composable for storyline and workspace operations
const storylines = useStorylines({
  store: {
    selectedNodeIds: store.selectedNodeIds,
    getNode: store.getNode,
    addNodeToStoryline: store.addNodeToStoryline,
    createStoryline: store.createStoryline,
    moveNodesToWorkspace: store.moveNodesToWorkspace,
    workspaces: store.workspaces,
  },
  contextMenuNodeId,
  closeContextMenu,
  showToast,
})
const { addNodeToStoryline, createStorylineFromNode, moveNodesToWorkspace } = storylines

/// Computed: number of selected nodes for context menu display
const contextMenuNodeCount = computed(() => contextMenu.nodeCount.value)

// Computed: workspaces other than the current one (for "Send to Workspace" menu)
const otherWorkspaces = computed(() => {
  return store.workspaces.filter(w => w.id !== store.currentWorkspaceId)
})

// Export current graph/subgraph as YAML for debugging
function exportGraphAsYaml() {
  const selectedIds = store.selectedNodeIds
  const selectedSet = new Set(selectedIds)
  const hasSelection = selectedIds.length > 0

  // Export selected nodes only, or all if no selection
  const nodesToExport = hasSelection
    ? displayNodes.value.filter(n => selectedSet.has(n.id))
    : displayNodes.value

  const nodes = nodesToExport.map(n => ({
    id: n.id,
    title: n.title,
    x: n.canvas_x,
    y: n.canvas_y,
    width: n.width || NODE_DEFAULTS.WIDTH,
    height: n.height || NODE_DEFAULTS.HEIGHT,
  }))

  // Export edges where both endpoints are in the export set
  const nodeIdSet = new Set(nodesToExport.map(n => n.id))
  const edges = edgeLines.value
    .filter(e => nodeIdSet.has(e.source_node_id) && nodeIdSet.has(e.target_node_id))
    .map(e => ({
      id: e.id,
      source: e.source_node_id,
      target: e.target_node_id,
      path: e.path,
      style: e.style,
    }))

  const yaml = `# Graph Export - ${new Date().toISOString()}
# Nodes: ${nodes.length}, Edges: ${edges.length}
# Selection: ${hasSelection ? 'subgraph' : 'all'}
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
  writeClipboard(yaml).then(() => {
    showToast?.(`Copied ${nodes.length} nodes, ${edges.length} edges as YAML`, 'success')
  }).catch(err => {
    console.error('[EXPORT] Clipboard failed:', err)
    showToast?.('Failed to copy to clipboard', 'error')
  })
}

// Expose export function globally for debugging
// eslint-disable-next-line @typescript-eslint/no-explicit-any
;(window as any).exportGraphAsYaml = exportGraphAsYaml

// Keyboard shortcuts composable - handles global canvas shortcuts
useKeyboardShortcuts({
  pendingFramePlacement: frames.pendingFramePlacement,
  cancelFramePlacement,
  selectedNodeIds: computed(() => store.selectedNodeIds),
  selectedEdge,
  selectedFrameId: computed(() => store.selectedFrameId),
  deleteSelectedNodes,
  deleteSelectedEdge,
  deleteSelectedFrame,
  selectAllNodes,
  copySelectedNodes,
  pasteNodes,
  resetAllNodeSizes,
  layoutNodes: () => store.layoutNodes(),
  fitToContent,
  toggleNeighborhoodMode,
  fontScale,
  increaseFontScale,
  decreaseFontScale,
  refreshFromFiles,
  exportGraphAsYaml,
})
</script>

<template>
  <div class="canvas-wrapper">
    <!-- Graph-level LLM prompt bar -->
    <div v-if="llmEnabled" class="graph-llm-bar">
      <div class="llm-input-row">
        <input
          v-model="graphPrompt"
          type="text"
          :placeholder="t('canvas.agent.placeholder')"
          class="llm-input"
          :disabled="isGraphLLMLoading"
          @keydown.enter="sendGraphPrompt"
          @keydown.up="onPromptKeydown"
          @keydown.down="onPromptKeydown"
        />
        <button class="llm-clear-btn" :data-tooltip="t('canvas.agent.clearMemory')" :class="{ active: conversationHistory.length > 0 }" @click="clearConversation">
          {{ conversationHistory.length || 'C' }}
        </button>
        <button v-if="!agentRunning" class="llm-send" data-tooltip="Send prompt" :disabled="isGraphLLMLoading || !graphPrompt.trim()" @click="sendGraphPrompt">
          {{ isGraphLLMLoading ? '...' : 'Go' }}
        </button>
        <button v-else class="llm-stop" data-tooltip="Stop agent" @click="stopAgent">Stop</button>
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
        <div class="log-buttons">
          <button class="log-btn" title="Copy log" @click="navigator.clipboard.writeText(agentLog.join('\n'))">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
            </svg>
          </button>
          <button class="log-btn" title="Clear log" @click="agentLog.length = 0">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div v-for="(line, i) in agentLog" :key="i" class="log-line">{{ line }}</div>
      </div>
    </div>

    <div
      ref="canvasRef"
      class="canvas-viewport"
      :class="{ panning: isPanning, 'frame-placement': frames.pendingFramePlacement.value }"
      :style="{ backgroundPosition: offsetX + 'px ' + offsetY + 'px' }"
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
            :stroke-width="edge.isHighlighted ? edgeStrokeWidth * 2 : edgeStrokeWidth"
            :stroke-opacity="edge.opacity"
            :marker-end="edge.isHighlighted && !edge.isBidirectional && !edge.isShortEdge ? `url(#${edge.arrowMarkerId})` : undefined"
            fill="none"
            class="edge-line-fast"
            :class="{ 'edge-highlighted': edge.isHighlighted, 'edge-tagged': edge.link_type === 'tagged', 'edge-neighbor': edge.isNeighborEdge }"
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
              :stroke-opacity="edge.opacity"
              :marker-end="edge.isBidirectional || edge.isShortEdge ? undefined : `url(#${edge.arrowMarkerId})`"
              stroke-linecap="round"
              fill="none"
              class="edge-line-visible"
              :class="{ 'edge-selected': edge.isSelected, 'edge-highlighted': edge.isHighlighted, 'edge-tagged': edge.link_type === 'tagged', 'edge-neighbor': edge.isNeighborEdge }"
              pointer-events="none"
            />
            <text
              v-if="edge.label"
              :x="edge.labelX || (edge.x1 + edge.x2) / 2"
              :y="(edge.labelY || (edge.y1 + edge.y2) / 2) - 8"
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
          style="pointer-events: none"
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
          borderWidth: frameBorderWidth + 'px',
        }"
        @mousedown.stop="onFrameMouseDown($event, frame.id)"
        @dblclick.stop="startEditingFrameTitle(frame.id)"
      >
        <div class="frame-header" :style="{ transform: `scale(${1/scale})`, transformOrigin: 'left center' }">
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
            :title="t('canvas.frame.delete')"
            @click.stop="deleteSelectedFrame"
          >x</button>
        </div>
        <div class="frame-resize-handle" @mousedown.stop="startFrameResize($event, frame.id)"></div>
      </div>

      <!-- LOD Mode: Render non-selected nodes as circles -->
      <template v-if="isLODMode">
        <div
          v-for="node in visibleNodes.filter(n => !store.selectedNodeIds.includes(n.id) && n.id !== editingNodeId)"
          :key="node.id"
          :data-node-id="node.id"
          class="node-circle"
          :class="{ dragging: draggingNode === node.id }"
          :style="{
            transform: `translate3d(${node.canvas_x + (node.width || NODE_DEFAULTS.WIDTH) / 2 - getLODRadius(node.id)}px, ${node.canvas_y + (node.height || NODE_DEFAULTS.HEIGHT) / 2 - getLODRadius(node.id)}px, 0)`,
            width: getLODRadius(node.id) * 2 + 'px',
            height: getLODRadius(node.id) * 2 + 'px',
            background: node.color_theme || 'var(--primary-color)',
          }"
          :title="node.title + ' (' + (nodeDegree[node.id] || 0) + ' ' + t('canvas.node.connections') + ')'"
          @mousedown="onNodeMouseDown($event, node.id)"
          @mouseenter="hoveredNodeId = node.id"
          @mouseleave="hoveredNodeId = null"
          @dblclick.stop="startEditing(node.id)"
        ></div>
      </template>

      <!-- Node cards - shown for all nodes in normal mode, or selected/editing nodes in LOD mode -->
      <div
        v-for="node in isLODMode ? visibleNodes.filter(n => store.selectedNodeIds.includes(n.id) || n.id === editingNodeId) : visibleNodes"
        :key="node.id"
        :data-node-id="node.id"
        :data-node-type="node.node_type"
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
          borderWidth: nodeBorderWidth + 'px',
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
            @mouseup.stop
          />
          <span v-else>{{ node.title || t('canvas.node.untitled') }}</span>
        </div>
        <!-- Editing mode (disabled when collapsed) -->
        <textarea
          v-if="editingNodeId === node.id && !isSemanticZoomCollapsed"
          v-model="editContent"
          class="inline-editor"
          :placeholder="t('canvas.node.writePlaceholder')"
          spellcheck="false"
          autocorrect="off"
          autocapitalize="off"
          @mousedown.stop
          @mouseup.stop
          @blur="saveEditing($event)"
          @keydown="onEditorKeydown"
        ></textarea>
        <!-- View mode - hidden when collapsed for performance, v-html required for markdown -->
        <!-- eslint-disable vue/no-v-html -->
        <div
          v-else-if="!isSemanticZoomCollapsed"
          class="node-content"
          @click="handleContentClick"
          v-html="nodeRenderedContent[node.id] || ''"
        ></div>
        <!-- eslint-enable vue/no-v-html -->

        <!-- Color palette and options (shown when selected or editing) -->
        <div v-if="store.selectedNodeIds.includes(node.id) || editingNodeId === node.id" class="node-color-bar" @mousedown.prevent>
          <button
            v-for="color in nodeColors"
            :key="color.value || 'default'"
            class="color-dot"
            :class="{ active: node.color_theme === color.value }"
            :style="{ background: color.display || 'var(--bg-surface)' }"
            @click.stop="updateNodeColor(node.id, color.value)"
          ></button>
          <span class="color-bar-sep"></span>
          <button
            class="autofit-toggle"
            :title="t('canvas.node.fitContent')"
            @click.stop="fitNodeNow(node.id)"
          >Fit</button>
        </div>

        <!-- Delete button (shown when selected but not editing) -->
        <button
          v-if="store.selectedNodeIds.includes(node.id) && editingNodeId !== node.id"
          class="delete-node-btn"
          @mousedown.stop="deleteSelectedNodes"
        ></button>

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
        v-if="llmEnabled && (store.selectedNodeIds.length === 1 || editingNodeId) && getVisualNode(store.selectedNodeIds[0] || editingNodeId!)"
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
          :placeholder="isNodeLLMLoading ? t('canvas.node.processing') : t('canvas.node.askPlaceholder')"
          class="node-llm-input"
          :class="{ loading: isNodeLLMLoading }"
          tabindex="0"
          :disabled="isNodeLLMLoading"
          @mousedown.stop
          @keydown.enter.stop="sendNodePrompt"
          @keydown.up.prevent="onNodePromptKeydown($event)"
          @keydown.down.prevent="onNodePromptKeydown($event)"
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
          :placeholder="t('canvas.edge.labelPlaceholder')"
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
          <button :data-tooltip="t('canvas.edge.reverseDirection')" @click.stop="reverseEdge">{{ t('canvas.edge.flip') }}</button>
          <button
            v-if="isEdgeBidirectional(selectedEdge || '')"
            :data-tooltip="t('canvas.edge.makeDirectional')"
            @click.stop="makeUnidirectional"
          >Directional</button>
          <button
            v-else
            :data-tooltip="t('canvas.edge.makeNonDirectional')"
            @click.stop="makeBidirectional"
          >Non-directional</button>
        </div>
        <button class="insert-node-btn" data-tooltip="Insert a node on this edge" @click="insertNodeOnEdge">Insert Node</button>
        <button class="delete-edge-btn" data-tooltip="Delete this edge" @click="deleteSelectedEdge">Delete Edge</button>
      </div>
    </div>

    <!-- Controls -->
    <CanvasControls
      :scale="scale"
      :grid-lock-enabled="gridLockEnabled"
      :is-large-graph="isLargeGraph"
      :global-edge-style="globalEdgeStyle"
      :magnifier-enabled="magnifierEnabled"
      :neighborhood-mode="neighborhoodMode"
      :neighborhood-depth="neighborhoodDepth"
      :pending-frame-placement="frames.pendingFramePlacement.value"
      @zoom-in="scale = Math.min(scale * 1.25, 3)"
      @zoom-out="scale = Math.max(scale * 0.8, 0.01)"
      @fit-to-content="fitToContent"
      @toggle-grid-lock="gridLockEnabled = !gridLockEnabled"
      @layout="autoLayoutNodes"
      @fit-nodes-to-content="fitAllNodesToContent"
      @cycle-edge-style="cycleEdgeStyle"
      @toggle-magnifier="toggleMagnifier"
      @toggle-neighborhood-mode="toggleNeighborhoodMode()"
      @set-neighborhood-depth="setDepth"
      @create-frame="createFrameAtCenter"
      @show-help="showHelpModal = true"
    />

    <!-- Help Modal -->
    <KeyboardShortcutsModal :show="showHelpModal" @close="showHelpModal = false" />

    <!-- Status Bar -->
    <CanvasStatusBar
      :visible-node-count="visibleNodes.length"
      :total-node-count="store.filteredNodes.length"
      :visible-edge-count="edgeLines.length"
      :total-edge-count="store.filteredEdges.length"
      :is-layouting="isLayouting"
      :is-large-graph="isLargeGraph"
      :is-pdf-processing="pdfDrop.isProcessing.value"
      :pdf-status="pdfDrop.processingStatus.value"
      :agent-log="nodeAgentLog"
      :show-agent-log="showNodeAgentLog"
      @stop-pdf="pdfDrop.stop()"
      @toggle-agent-log="showNodeAgentLog = !showNodeAgentLog"
    />

    <!-- Node agent log panel (fixed position) -->
    <div
      v-if="showNodeAgentLog && nodeAgentLog.length > 0"
      class="node-agent-log-panel"
      @mousedown.stop
    >
      <div class="log-header">
        <span>Agent Log</span>
        <button @click="showNodeAgentLog = false">x</button>
      </div>
      <div class="log-content">
        <div v-for="(line, i) in nodeAgentLog" :key="i" class="log-line">{{ line }}</div>
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
          :style="[
            {
              left: ((node.canvas_x - (magnifierPos.x - offsetX) / scale) * MAGNIFIER_ZOOM + MAGNIFIER_SIZE / 2) + 'px',
              top: ((node.canvas_y - (magnifierPos.y - offsetY) / scale) * MAGNIFIER_ZOOM + MAGNIFIER_SIZE / 2) + 'px',
              width: ((node.width || NODE_DEFAULTS.WIDTH) * MAGNIFIER_ZOOM) + 'px',
              height: ((node.height || NODE_DEFAULTS.HEIGHT) * MAGNIFIER_ZOOM) + 'px',
            },
            node.color_theme ? { background: getNodeBackground(node.color_theme) } : {}
          ]"
        >
          <span class="magnifier-node-title">{{ node.title || 'Untitled' }}</span>
          <span v-if="node.markdown_content" class="magnifier-node-body">{{ node.markdown_content }}</span>
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
      <div class="hover-tooltip-title">{{ hoveredNode.title || t('canvas.node.untitled') }}</div>
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

    <!-- Context Menu -->
    <div
      v-if="contextMenuVisible"
      class="context-menu"
      :style="{ left: contextMenuPosition.x + 'px', top: contextMenuPosition.y + 'px' }"
      @click.stop
    >
      <div class="context-menu-item" @click="fitNodeNow(contextMenuNodeId!); closeContextMenu()">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>
        </svg>
        <span>Fit to Content</span>
      </div>

      <div class="context-menu-item" @click="zoomToNode(contextMenuNodeId!); closeContextMenu()">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="11" cy="11" r="8"/>
          <path d="M21 21l-4.35-4.35"/>
        </svg>
        <span>Find on Canvas</span>
      </div>

      <div class="context-menu-item" @click="openLinkPicker">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
        </svg>
        <span>Link to...</span>
      </div>

      <div class="context-menu-divider"></div>

      <div
        class="context-menu-item has-submenu"
        @mouseenter="contextMenuStorylineSubmenu = true"
        @mouseleave="contextMenuStorylineSubmenu = false"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
          <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
        </svg>
        <span>Add to Storyline{{ contextMenuNodeCount > 1 ? ` (${contextMenuNodeCount})` : '' }}</span>
        <svg class="submenu-arrow" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="9 18 15 12 9 6"/>
        </svg>

        <!-- Storyline submenu -->
        <div v-if="contextMenuStorylineSubmenu" class="context-submenu">
          <div
            v-for="storyline in store.filteredStorylines"
            :key="storyline.id"
            class="context-menu-item"
            @click="addNodeToStoryline(storyline.id)"
          >
            <span>{{ storyline.title }}</span>
          </div>
          <div v-if="store.filteredStorylines.length > 0" class="context-menu-divider"></div>
          <div class="context-menu-item" @click="createStorylineFromNode">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="12" y1="5" x2="12" y2="19"/>
              <line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            <span>New Storyline...</span>
          </div>
        </div>
      </div>

      <!-- Send to Workspace submenu -->
      <div
        class="context-menu-item has-submenu"
        @mouseenter="contextMenuWorkspaceSubmenu = true"
        @mouseleave="contextMenuWorkspaceSubmenu = false"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
        </svg>
        <span>Send to Workspace{{ contextMenuNodeCount > 1 ? ` (${contextMenuNodeCount})` : '' }}</span>
        <svg class="submenu-arrow" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="9 18 15 12 9 6"/>
        </svg>

        <!-- Workspace submenu -->
        <div v-if="contextMenuWorkspaceSubmenu" class="context-submenu">
          <div
            v-if="store.currentWorkspaceId !== null"
            class="context-menu-item"
            @click="moveNodesToWorkspace(null)"
          >
            <span>Default Workspace</span>
          </div>
          <div
            v-for="workspace in otherWorkspaces"
            :key="workspace.id"
            class="context-menu-item"
            @click="moveNodesToWorkspace(workspace.id)"
          >
            <span>{{ workspace.name }}</span>
          </div>
          <div v-if="otherWorkspaces.length === 0 && store.currentWorkspaceId === null" class="context-menu-item disabled">
            <span>No other workspaces</span>
          </div>
        </div>
      </div>

      <div class="context-menu-divider"></div>

      <div class="context-menu-item danger" @click="deleteSelectedNodes(); closeContextMenu()">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="3 6 5 6 21 6"/>
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
        </svg>
        <span>Delete</span>
      </div>
    </div>

    <!-- Click outside to close context menu -->
    <div
      v-if="contextMenuVisible"
      class="context-menu-backdrop"
      @click="closeContextMenu"
      @contextmenu.prevent="closeContextMenu"
    ></div>

    <!-- Link to picker modal -->
    <Teleport to="body">
      <div v-if="showLinkPicker" class="link-picker-overlay" @click="closeLinkPicker">
        <div class="link-picker-modal" @click.stop>
          <NodePicker
            :exclude-node-ids="linkPickerSourceNodeId ? [linkPickerSourceNodeId] : []"
            :show-search="true"
            :allow-create="false"
            :max-items="20"
            @select="linkToNode"
            @close="closeLinkPicker"
          />
        </div>
      </div>
    </Teleport>

    <!-- Empty state overlay -->
    <div v-if="store.filteredNodes.length === 0" class="empty-state-overlay">
      <div class="empty-state-box">
        <h3>No nodes yet</h3>
        <p>Double-click anywhere to create a node</p>
      </div>
    </div>

    <!-- Import options modal for Zotero/BibTeX files -->
    <ImportOptionsModal
      v-if="pdfDrop.showImportOptions.value && pdfDrop.pendingBibImport.value"
      :filename="pdfDrop.pendingBibImport.value.filename"
      :entry-count="pdfDrop.pendingBibImport.value.entries.length"
      :collection-name="pdfDrop.pendingBibImport.value.collectionName"
      :has-attachments="pdfDrop.pendingBibImport.value.hasAttachments"
      @import="pdfDrop.confirmBibImport($event)"
      @cancel="pdfDrop.cancelBibImport()"
    />

    <!-- Plan approval modal for agent planning -->
    <PlanApprovalModal
      :plan="planCurrentPlan"
      :visible="planShowApprovalModal"
      @approve="handlePlanApprove"
      @reject="handlePlanReject"
      @modify="handlePlanModify"
      @add-step="handlePlanAddStep"
      @remove-step="handlePlanRemoveStep"
      @close="closePlanModal"
    />

    <!-- Agent task panel for progress display -->
    <Teleport to="body">
      <div v-if="agentTasksStore.totalTasks > 0" class="agent-task-panel-container">
        <AgentTaskPanel />
      </div>
    </Teleport>
    </div>
  </div>
</template>

<style src="./PixiCanvas.css" scoped></style>
