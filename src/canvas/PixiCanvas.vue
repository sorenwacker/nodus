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
import {
  useMinimap,
  useViewState,
  useCanvasPan,
  useCanvasZoom,
  useCanvasDisplay,
} from './composables/viewport'
import {
  useNodeClipboard,
  useNodeEditor,
  useNodeResizing,
  useNodeDragging,
  useNodeHover,
} from './composables/nodes'
import {
  useEdgeManipulation,
  useEdgeRouting,
  useEdgeStyling,
  useEdgeVisibility,
} from './composables/edges'
import { useLasso, useContextMenu } from './composables/selection'
import {
  useAgentRunner,
  useNodeAgent,
  useLLMTools,
  useMarkerHandlers,
  usePlanHandlers,
  type AgentContext,
  type NodeAgentContext,
} from './composables/agent'
import { useContentRenderer, useViewportCulling, useGraphMetrics } from './composables/rendering'
import { useLayout, useNeighborhoodMode } from './composables/layout'
import { useFrames } from './composables/frames'
import {
  useCanvasKeyboardShortcuts,
  usePdfDrop,
  useStorylines,
  useUndoHandlers,
} from './composables/util'
import { measureNodeContent } from './utils/nodeSizing'
import { getNodeBackground as getNodeBackgroundUtil } from './utils/nodeColors'
import { findConnectedNodes, getImmediateNeighbors, buildChainContext } from './utils/graphTraversal'
import ImportOptionsModal from '../components/ImportOptionsModal.vue'
import { NODE_DEFAULTS } from './constants'
import CanvasStatusBar from './components/CanvasStatusBar.vue'
import CanvasControls from './components/CanvasControls.vue'
import CanvasContextMenu from './components/CanvasContextMenu.vue'
import CanvasEdgePanel from './components/CanvasEdgePanel.vue'
import CanvasLLMBar from './components/CanvasLLMBar.vue'
import CanvasMagnifier from './components/CanvasMagnifier.vue'
import CanvasHoverTooltip from './components/CanvasHoverTooltip.vue'
import CanvasMinimap from './components/CanvasMinimap.vue'
import NodeAgentLogPanel from './components/NodeAgentLogPanel.vue'
import NodeLLMBar from './components/NodeLLMBar.vue'
import CanvasFrames from './components/CanvasFrames.vue'
import CanvasEdgesSVG from './components/CanvasEdgesSVG.vue'
import KeyboardShortcutsModal from '../components/KeyboardShortcutsModal.vue'
import NodePicker from '../components/NodePicker.vue'
import PlanApprovalModal from '../components/PlanApprovalModal.vue'
import AgentTaskPanel from '../components/AgentTaskPanel.vue'
import { usePlanState } from './llm/planState'
import { useAgentTasksStore } from '../stores/agentTasks'

// Undo handlers
const { pushUndo, pushContentUndo, pushDeletionUndo, pushCreationUndo } = useUndoHandlers()

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

// Node hover composable - handles hover state, tooltips, and active node tracking
const nodeHover = useNodeHover({
  scale,
  isLODMode,
  selectedNodeIds: computed(() => store.selectedNodeIds),
  filteredEdges: computed(() => store.filteredEdges),
  getNode: store.getNode,
})
const {
  hoveredNodeId,
  hoverMousePos,
  showHoverTooltip,
  hoveredNode,
  tooltipContent,
  highlightedEdgeIds,
  onNodeMouseEnter,
  onNodeMouseMove,
  onNodeMouseLeave,
} = nodeHover

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
      const connectedNodes = getImmediateNeighbors(nodeId, store.filteredEdges, store.getNode)

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
    const chainNodes = findConnectedNodes(nodeId, store.filteredEdges, store.getNode)
    console.log(`BFS complete: found ${chainNodes.length} connected nodes`)

    // Build context with content from chain (respecting limit)
    const contextLimit = llmStorage.getChainContextLimit()
    const chainContext = buildChainContext(chainNodes, contextLimit)

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

// Get node background - wrapper for utility function with current theme
function getNodeBackground(colorTheme: string | null): string | undefined {
  return getNodeBackgroundUtil(colorTheme, currentTheme.value)
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
useCanvasKeyboardShortcuts({
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
    <CanvasLLMBar
      v-if="llmEnabled"
      :graph-prompt="graphPrompt"
      :is-loading="isGraphLLMLoading"
      :is-running="agentRunning"
      :conversation-history="conversationHistory"
      :agent-tasks="agentTasks"
      :agent-log="agentLog"
      @update:graph-prompt="graphPrompt = $event"
      @send="sendGraphPrompt"
      @stop="stopAgent"
      @clear-conversation="clearConversation"
      @prompt-keydown="onPromptKeydown"
      @clear-log="agentLog.length = 0"
    />

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
      <CanvasEdgesSVG
        :edges="visibleEdgeLines"
        :marker-colors="allMarkerColors"
        :is-large-graph="isLargeGraph"
        :edge-stroke-width="edgeStrokeWidth"
        :lasso-points="lassoPoints"
        :is-lasso-selecting="isLassoSelecting"
        :current-theme="currentTheme"
        :highlight-color="highlightColor"
        :is-creating-edge="isCreatingEdge"
        :edge-preview-start="edgeStartNode ? { x: (store.getNode(edgeStartNode)?.canvas_x || 0) + 100, y: (store.getNode(edgeStartNode)?.canvas_y || 0) + 40 } : null"
        :edge-preview-end="edgePreviewEnd"
        :get-arrow-marker-id="getArrowMarkerId"
        @edge-click="onEdgeClick"
      />

      <!-- Frames -->
      <CanvasFrames
        :frames="store.filteredFrames"
        :selected-frame-id="store.selectedFrameId"
        :editing-frame-id="editingFrameId"
        :edit-frame-title="editFrameTitle"
        :frame-border-width="frameBorderWidth"
        :scale="scale"
        :frame-colors="frameColors"
        @update:edit-frame-title="editFrameTitle = $event"
        @mousedown="onFrameMouseDown"
        @dblclick="startEditingFrameTitle"
        @save-title="saveFrameTitleEditing"
        @cancel-title="cancelFrameTitleEditing"
        @update-color="store.updateFrameColor"
        @delete="deleteSelectedFrame"
        @start-resize="startFrameResize"
      />

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
          @mouseenter="onNodeMouseEnter($event, node.id)"
          @mouseleave="onNodeMouseLeave"
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
        @mouseleave="onNodeMouseLeave"
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
      <NodeLLMBar
        v-if="getVisualNode(store.selectedNodeIds[0] || editingNodeId!)"
        :visible="llmEnabled && (store.selectedNodeIds.length === 1 || !!editingNodeId)"
        :node-prompt="nodePrompt"
        :is-loading="isNodeLLMLoading"
        :node-x="getVisualNode(store.selectedNodeIds[0] || editingNodeId!)!.canvas_x"
        :node-y="getVisualNode(store.selectedNodeIds[0] || editingNodeId!)!.canvas_y"
        :node-width="getVisualNode(store.selectedNodeIds[0] || editingNodeId!)!.width || NODE_DEFAULTS.WIDTH"
        @update:node-prompt="nodePrompt = $event"
        @send="sendNodePrompt"
        @stop="stopNodeLLM"
        @keydown="onNodePromptKeydown"
      />
    </div>

    <!-- Edge edit panel -->
    <CanvasEdgePanel
      :selected-edge="selectedEdge"
      :edges="store.filteredEdges"
      :edge-color-palette="edgeColorPalette"
      :edge-styles="edgeStyles"
      :get-edge-color="getEdgeColor"
      :get-edge-style="getEdgeStyle"
      :is-edge-bidirectional="isEdgeBidirectional"
      @close="selectedEdge = null"
      @change-label="changeEdgeLabel"
      @change-color="changeEdgeColor"
      @set-style="setEdgeStyle"
      @reverse="reverseEdge"
      @make-unidirectional="makeUnidirectional"
      @make-bidirectional="makeBidirectional"
      @insert-node="insertNodeOnEdge"
      @delete="deleteSelectedEdge"
    />

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
    <NodeAgentLogPanel
      :visible="showNodeAgentLog"
      :log="nodeAgentLog"
      @close="showNodeAgentLog = false"
    />

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
    <CanvasMagnifier
      :visible="shouldShowMagnifier"
      :position="magnifierPos"
      :nodes="magnifierVisibleNodes"
      :magnifier-size="MAGNIFIER_SIZE"
      :magnifier-zoom="MAGNIFIER_ZOOM"
      :offset-x="offsetX"
      :offset-y="offsetY"
      :scale="scale"
      :node-defaults="NODE_DEFAULTS"
      :get-node-background="getNodeBackground"
    />

    <!-- Hover tooltip (when zoomed out) -->
    <CanvasHoverTooltip
      :visible="showHoverTooltip"
      :position="hoverMousePos"
      :node="hoveredNode"
      :content="tooltipContent"
    />

    <!-- Minimap -->
    <CanvasMinimap
      :visible="store.filteredNodes.length > 0"
      :nodes="store.filteredNodes"
      :minimap-size="minimap.MINIMAP_SIZE"
      :get-node-position="minimap.getNodePosition"
      :is-selected="minimap.isSelected"
      :viewport-x="minimap.viewport.x"
      :viewport-y="minimap.viewport.y"
      :viewport-width="minimap.viewport.width"
      :viewport-height="minimap.viewport.height"
      @click="onMinimapClick"
    />

    <!-- Context Menu -->
    <CanvasContextMenu
      :visible="contextMenuVisible"
      :position="contextMenuPosition"
      :node-id="contextMenuNodeId"
      :node-count="contextMenuNodeCount"
      :storyline-submenu="contextMenuStorylineSubmenu"
      :workspace-submenu="contextMenuWorkspaceSubmenu"
      :storylines="store.filteredStorylines"
      :workspaces="store.workspaces"
      :current-workspace-id="store.currentWorkspaceId"
      @close="closeContextMenu"
      @fit-to-content="fitNodeNow"
      @zoom-to-node="zoomToNode"
      @open-link-picker="openLinkPicker"
      @delete-nodes="deleteSelectedNodes"
      @add-to-storyline="addNodeToStoryline"
      @create-storyline="createStorylineFromNode"
      @move-to-workspace="moveNodesToWorkspace"
      @update:storyline-submenu="contextMenuStorylineSubmenu = $event"
      @update:workspace-submenu="contextMenuWorkspaceSubmenu = $event"
    />

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
