<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, nextTick, inject } from 'vue'
import { storeToRefs } from 'pinia'
import { useNodesStore } from '../stores/nodes'
import { useThemesStore } from '../stores/themes'
import { useDisplayStore } from '../stores/display'
import type { Node, Edge } from '../types'
// marked is imported in useContentRenderer composable
import { openExternal } from '../lib/tauri'
import { optimizeNodeEntrypoints } from './routing'
import { useLLM, executeTool, llmQueue, type ToolContext } from '../llm'
import { llmStorage, memoryStorage } from '../lib/storage'
import {
  useMinimap,
  useViewState,
  useCanvasPan,
  useCanvasZoom,
  useCanvasDisplay,
  usePreviewPanel,
} from './composables/viewport'
import {
  useNodeClipboard,
  useNodeEditor,
  useNodeResizing,
  useNodeDragging,
  useNodeHover,
  useLinkPicker,
  useNodeCollision,
  useNodeNavigation,
  useEntityOperations,
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
  useCanvasLLMState,
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
  useGraphExport,
  useCitationFetch,
  useCanvasSettings,
} from './composables/util'
import { measureNodeContent } from './utils/nodeSizing'
import { getNodeBackground as getNodeBackgroundUtil } from './utils/nodeColors'
import {
  findConnectedNodes,
  buildChainContext,
} from './utils/graphTraversal'
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
import NodeLLMBar from './components/NodeLLMBar.vue'
import CanvasFrames from './components/CanvasFrames.vue'
import CanvasEdgesSVG from './components/CanvasEdgesSVG.vue'
import CanvasNodeCard from './components/CanvasNodeCard.vue'
import CanvasPreviewPanel from './components/CanvasPreviewPanel.vue'
import CanvasLODCanvas from './components/CanvasLODCanvas.vue'
import CanvasAgentLogPanel from './components/CanvasAgentLogPanel.vue'
import CanvasColorBar from './components/CanvasColorBar.vue'
import KeyboardShortcutsModal from '../components/KeyboardShortcutsModal.vue'
import NodePicker from '../components/NodePicker.vue'
import PlanApprovalModal from '../components/PlanApprovalModal.vue'
import AgentTaskPanel from '../components/AgentTaskPanel.vue'
import { usePlanState } from '../llm/planState'
import { useAgentTasksStore } from '../stores/agentTasks'

// Undo handlers
const {
  pushUndo,
  pushContentUndo,
  pushDeletionUndo,
  pushCreationUndo,
  pushColorUndo,
  pushSizeUndo,
} = useUndoHandlers()

// Content renderer is configured via composable

const store = useNodesStore()
const themesStore = useThemesStore()
const agentTasksStore = useAgentTasksStore()
const displayStore = useDisplayStore()
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
const {
  scale,
  offsetX,
  offsetY,
  isZooming,
  hasSavedView: savedView,
  scheduleSaveViewState,
  centerGrid,
  screenToCanvas,
  startZooming,
} = viewState

onMounted(() => {
  // Setup display settings listener for reactive updates
  displayStore.setupListener()

  // Setup content renderer watchers for markdown/math/mermaid
  setupContentWatchers()

  // Initialize font scale CSS variable
  document.documentElement.style.setProperty('--font-scale', String(fontScale.value))

  updateTheme()
  // Watch for theme changes
  const observer = new MutationObserver(updateTheme)
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme'],
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
    if (nodeId) zoomToNode(nodeId, 1)
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
    displayStore.cleanupListener()
  })

  // Only center if no saved view state
  if (!savedView) {
    centerGrid()
  }

  // Render mermaid diagrams after mount (delayed to ensure DOM is ready)
  // Note: Mermaid diagrams are also rendered on-demand via renderMarkdown() when content changes
  setTimeout(() => renderMermaidDiagrams?.(), 500)
})

// centerGrid is provided by useViewState composable

// Center view when nodes are first loaded, or center grid when empty
// Always fit to content on initial load to ensure nodes are visible
watch(
  () => store.filteredNodes.length,
  (newLen, _oldLen) => {
    if (newLen > 0 && !hasInitiallyCentered) {
      hasInitiallyCentered = true
      // Always fit to content on initial load - saved view may be for different workspace
      setTimeout(fitToContent, 50)
      // Render mermaid diagrams after initial load (use arrow fn to defer lookup)
      setTimeout(() => renderMermaidDiagrams?.(), 500)
    } else if (newLen === 0 && !savedView) {
      // Empty workspace - center the grid
      hasInitiallyCentered = false
      setTimeout(centerGrid, 50)
    }
  },
  { immediate: true }
)

// Re-center when workspace changes - auto-fit so nodes are visible
watch(
  () => store.currentWorkspaceId,
  () => {
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
  }
)

// Neighborhood mode composable
const neighborhood = useNeighborhoodMode({
  store: {
    getFilteredNodes: () => [...store.filteredNodes],
    getFilteredEdges: () => [...store.filteredEdges],
    getNode: store.getNode,
    getSelectedNodeIds: () => [...store.selectedNodeIds],
    nodeLayoutVersion: computed(() => store.nodeLayoutVersion),
  },
  viewState: {
    scale,
    offsetX,
    offsetY,
    canvasRect: () => canvasRef.value?.getBoundingClientRect() || null,
  },
})

// Destructure for convenience
const {
  neighborhoodMode,
  focusNodeId,
  displayNodes,
  neighborhoodDepth,
  neighborhoodPositions,
  setDepth,
} = neighborhood

// Viewport culling composable - filters nodes visible in viewport
// selectedNodeIds ensures selected nodes are always rendered (for fitting, etc.)
const viewportCulling = useViewportCulling({
  scale,
  offsetX,
  offsetY,
  displayNodes,
  selectedNodeIds: computed(() => store.selectedNodeIds),
  nodeLayoutVersion: computed(() => store.nodeLayoutVersion),
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
  isBubbleModeForced,
  getLODRadius,
  toggleBubbleMode,
} = graphMetrics

// Render mermaid diagrams when zooming in from collapsed view
watch(isSemanticZoomCollapsed, (collapsed, wasCollapsed) => {
  if (wasCollapsed && !collapsed) {
    // Transitioned from collapsed to expanded - render mermaid diagrams
    setTimeout(renderMermaidDiagrams, 100)
  }
})

// Pre-computed LOD node lists to avoid double filtering in template
const lodCircleNodes = computed(() => {
  if (!isLODMode.value) return []
  const selectedSet = new Set(store.selectedNodeIds)
  return visibleNodes.value.filter(n => !selectedSet.has(n.id) && n.id !== editingNodeId.value)
})
const lodCardNodes = computed(() => {
  if (!isLODMode.value) return visibleNodes.value
  const selectedSet = new Set(store.selectedNodeIds)
  return visibleNodes.value.filter(n => selectedSet.has(n.id) || n.id === editingNodeId.value)
})

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

// Node navigation composable
const nodeNavigation = useNodeNavigation({
  getFilteredNodes: () => store.filteredNodes,
  getNode: store.getNode,
  getVisualNode,
  selectNode: id => store.selectNode(id),
  canvasRef,
  scale,
  offsetX,
  offsetY,
  neighborhoodMode,
})
const { navigateToNode, zoomToNode } = nodeNavigation

// Context menu visible state - defined early for preview panel to reference
const contextMenuVisibleRef = ref(false)

// Preview panel composable - auto-shows when single node selected while zoomed out
const previewPanel = usePreviewPanel({
  selectedNodeIds: computed(() => store.selectedNodeIds),
  isSemanticZoomCollapsed,
  contextMenuVisible: contextMenuVisibleRef,
  getNode: store.getNode,
  zoomToNode,
})
const { showPreviewPanel, previewNode, closePreviewPanel, zoomToPreviewNode } = previewPanel

// Preview panel save handlers
async function savePreviewContent(nodeId: string, content: string) {
  await store.updateNodeContent(nodeId, content)
  setTimeout(renderMermaidDiagrams, 100)
}

async function savePreviewTitle(nodeId: string, title: string) {
  await store.updateNodeTitle(nodeId, title)
}

// Zoom to node with consistent scale (used by context menu)
function zoomToNodeDefault(nodeId: string) {
  zoomToNode(nodeId, 1)
}

// Lasso selection composable
const lasso = useLasso({
  store: {
    getFilteredNodes: () => [...store.filteredNodes],
    setSelectedNodeIds: (ids: string[]) => {
      store.selectedNodeIds = ids
    },
  },
  screenToCanvas,
  neighborhoodMode,
  neighborhoodPositions,
  getDisplayNodes: () => [...displayNodes.value],
})
const { isLassoSelecting, lassoPoints, start: startLasso, update: updateLasso, end: endLasso } = lasso

// Node clipboard composable
const clipboard = useNodeClipboard({
  store: {
    selectedNodeIds: store.selectedNodeIds,
    getNode: store.getNode,
    getFilteredEdges: () => store.filteredEdges,
    createNode: store.createNode,
    createEdge: store.createEdge,
    setSelectedNodeIds: (ids: string[]) => {
      store.selectedNodeIds.splice(0, store.selectedNodeIds.length, ...ids)
    },
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
const {
  nodeRenderedContent,
  renderMarkdown,
  renderTypstMath,
  renderMermaidDiagrams,
  setupWatchers: setupContentWatchers,
} = contentRenderer

// Preview content computed - renders on-demand if not cached
const previewContent = computed(() => {
  const node = previewNode.value
  if (!node) return ''
  // Return cached content or render on-demand
  return nodeRenderedContent.value[node.id] || renderMarkdown(node.markdown_content)
})

// Node editor composable - handles inline editing with autosave
const nodeEditor = useNodeEditor({
  store: {
    getNode: store.getNode,
    updateNodeContent: store.updateNodeContent,
    updateNodeTitle: store.updateNodeTitle,
  },
  pushContentUndo,
})
// Use composable for state and title editing; content editing functions are local for mermaid render + auto-fit
const {
  editingNodeId,
  editContent,
  editingTitleId,
  editTitle,
  startEditing,
  startEditingTitle,
  saveTitleEditing,
  cancelTitleEditing,
  // In-node search
  showNodeSearch,
  nodeSearchQuery,
  nodeSearchMatches,
  nodeSearchIndex,
  openNodeSearch,
  closeNodeSearch,
  updateNodeSearch,
  findNextMatch,
  findPrevMatch,
} = nodeEditor

// Edge manipulation composable - handles edge creation, selection, modification
const edgeManipulation = useEdgeManipulation({
  store: {
    getNode: store.getNode,
    getEdges: () => store.edges,
    getFilteredEdges: () => store.filteredEdges,
    getFilteredNodes: () => store.filteredNodes,
    createNode: store.createNode,
    createEdge: store.createEdge,
    deleteEdge: store.deleteEdge,
    updateEdgeDirected: store.updateEdgeDirected,
    selectNode: store.selectNode,
  },
  screenToCanvas,
})
const {
  isCreatingEdge,
  edgeStartNode,
  edgePreviewEnd,
  selectedEdge,
  onEdgePreviewMove,
  onEdgeCreate,
  onEdgeClick,
  deleteSelectedEdge,
  changeEdgeLabel,
  reverseEdge,
  isEdgeDirected,
  makeNonDirectional,
  makeDirectional,
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
})
const {
  showMagnifier,
  magnifierPos,
  onWheel,
  onCanvasPointerMove,
  onCanvasPointerEnter,
  onCanvasPointerLeave,
} = canvasZoom

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

// Only render nodes visible within magnifier viewport for performance
const magnifierVisibleNodes = computed(() => {
  if (!shouldShowMagnifier.value) return []

  // Calculate the canvas area visible in the magnifier
  const viewRadius = MAGNIFIER_SIZE / 2 / MAGNIFIER_ZOOM / scale.value
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
    return dx * dx + dy * dy < viewRadius * viewRadius * 4 // 2x radius for margin
  })
})

// Node border width - scale inversely to maintain constant visual width (2px on screen)
const nodeBorderWidth = computed(() => {
  return Math.max(1, 2 / scale.value)
})

// Frame border width - scale inversely to maintain constant visual width (2px on screen)
const frameBorderWidth = computed(() => {
  return Math.max(1, 2 / scale.value)
})

// Minimap - using composable
const minimap = useMinimap({
  nodes: computed(() =>
    store.filteredNodes.map(n => ({
      id: n.id,
      canvas_x: n.canvas_x,
      canvas_y: n.canvas_y,
      width: n.width || NODE_DEFAULTS.WIDTH,
      height: n.height || NODE_DEFAULTS.HEIGHT,
      color_theme: n.color_theme,
    }))
  ),
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

// Get reactive refs from store for the hover composable
const { selectedNodeIds: storeSelectedNodeIds, filteredEdges: storeFilteredEdges } =
  storeToRefs(store)

// Node hover composable - handles hover state, tooltips, and active node tracking
const nodeHover = useNodeHover({
  scale,
  isLODMode,
  selectedNodeIds: storeSelectedNodeIds,
  filteredEdges: storeFilteredEdges,
  getNode: store.getNode,
})
const {
  hoveredNodeId,
  hoverMousePos,
  showHoverTooltip,
  hoveredNode,
  tooltipContent,
  hoveredNodeEdgeStats,
  highlightedEdgeIds,
  highlightedNodeIds,
  onNodePointerEnter,
  onNodePointerMove,
  onNodePointerLeave,
} = nodeHover

// Context menu composable
const contextMenu = useContextMenu({
  getSelectedNodeIds: () => store.selectedNodeIds,
  addNodeToStoryline: (storylineId, nodeId) => store.addNodeToStoryline(storylineId, nodeId),
  createStoryline: title => store.createStoryline(title),
  moveNodesToWorkspace: (nodeIds, workspaceId) => store.moveNodesToWorkspace(nodeIds, workspaceId),
})
// Expose refs for template compatibility
const contextMenuVisible = contextMenu.visible

// Sync context menu visibility with preview panel ref
watch(contextMenuVisible, (visible) => {
  contextMenuVisibleRef.value = visible
}, { immediate: true })
const contextMenuPosition = contextMenu.position
const contextMenuNodeId = contextMenu.nodeId
const contextMenuStorylineSubmenu = contextMenu.storylineSubmenu
const contextMenuWorkspaceSubmenu = contextMenu.workspaceSubmenu
const contextMenuEntitySubmenu = contextMenu.entitySubmenu

// Citation fetch composable (for Semantic Scholar integration)
const citationFetch = useCitationFetch({
  store: {
    getFilteredNodes: () => store.filteredNodes,
    getFilteredEdges: () => store.filteredEdges,
    getCurrentWorkspaceId: () => store.currentWorkspaceId,
    getNode: store.getNode,
    createNode: store.createNode,
    createEdge: store.createEdge,
  },
  getAffectedNodeIds: () => contextMenu.affectedNodeIds.value,
  contextMenuNodeId,
  showToast,
})
const {
  isFetchingCitations,
  fetchProgress,
  queueSize,
  waitStatus,
  contextMenuNodeHasDOI,
  contextMenuDOICount,
  handleFetchCitations,
} = citationFetch

// Link picker composable
const linkPicker = useLinkPicker({
  contextMenuNodeId,
  closeContextMenu: () => contextMenu.close(),
  createEdge: (sourceId, targetId) =>
    store.createEdge({ source_node_id: sourceId, target_node_id: targetId, link_type: 'related' }),
})
const { showLinkPicker, linkPickerSourceNodeId, openLinkPicker, closeLinkPicker, linkToNode } =
  linkPicker

// Entity operations composable
const entityOperations = useEntityOperations({
  store: {
    filteredNodes: store.filteredNodes,
    selectedNodeIds: store.selectedNodeIds,
    getLinkedEntities: store.getLinkedEntities,
    selectNode: store.selectNode,
    createEntityNode: store.createEntityNode,
    linkToEntity: store.linkToEntity,
    getNode: store.getNode,
  },
  contextMenu: {
    affectedNodeIds: contextMenu.affectedNodeIds,
    close: () => contextMenu.close(),
  },
  showToast,
})
const { getLinkedEntities, handleEntityClick, linkToEntity, handleCreateEntity } = entityOperations

// Canvas settings composable
const canvasSettings = useCanvasSettings()
const {
  gridLockEnabled,
  highlightAllEdges,
  nodeAgentMode,
  showHelpModal,
  snapToGrid,
} = canvasSettings

const nodeAgent = useNodeAgent()

// Prevent double-click node creation right after drag
let lastDragEndTime = 0

// Frame operations composable
const frames = useFrames({
  store: {
    get frames() {
      return store.frames
    },
    get filteredNodes() {
      return store.filteredNodes
    },
    get selectedNodeIds() {
      return store.selectedNodeIds
    },
    get selectedFrameId() {
      return store.selectedFrameId
    },
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
const {
  editingFrameId,
  editFrameTitle,
  onPointerDown: onFramePointerDown,
  startResize: startFrameResize,
  startEditingTitle: startEditingFrameTitle,
  saveTitle: saveFrameTitleEditing,
  cancelTitleEditing: cancelFrameTitleEditing,
  createAtCenter: createFrameAtCenter,
  createAtPosition: createFrameAtPosition,
  cancelPlacement: cancelFramePlacement,
  deleteSelected: deleteSelectedFrame,
} = frames

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

async function autoLayoutNodes(
  type: 'grid' | 'horizontal' | 'vertical' | 'force' | 'hierarchical' = 'grid'
) {
  isLayouting.value = true
  const frameId = store.selectedFrameId
  try {
    // If force layout and a frame is selected, use the frame-aware layoutNodes
    if (type === 'force' && frameId) {
      await store.layoutNodes(undefined, { frameId, fitToFrame: false })
    } else {
      await layout.autoLayout(type, frameId ?? undefined)
    }
  } finally {
    isLayouting.value = false
  }
}
function fitToContent() {
  layout.fitToContent()
}

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

// Fit nodes to their content (selected nodes if any, otherwise all visible)
async function fitAllNodesToContent() {
  // Exit any active editing first
  if (editingNodeId.value) {
    saveEditing()
    await nextTick()
  }
  // Render Mermaid diagrams first, then wait for them to complete
  renderMermaidDiagrams()
  // Wait longer for Mermaid SVGs to render (they're async)
  setTimeout(() => {
    // Fit selected nodes if any, otherwise all visible nodes
    const nodesToFit =
      store.selectedNodeIds.length > 0 ? store.selectedNodeIds : store.filteredNodes.map(n => n.id)
    for (const nodeId of nodesToFit) {
      fitNodeToContent(nodeId)
    }
    // Trigger edge re-routing after sizes change
    store.nodeLayoutVersion++
  }, 500)
}

// Reset all nodes to default size (200x120)
async function resetAllNodeSizes() {
  for (const node of store.filteredNodes) {
    await store.updateNodeSize(node.id, 200, 120)
  }
  store.nodeLayoutVersion++
}

// Refresh all nodes from their source files
async function refreshFromFiles() {
  await store.refreshWorkspace()
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
  getActiveProviderId,
} = llm

// LLM state composable
const llmState = useCanvasLLMState()
const {
  graphPrompt,
  nodePrompt,
  isGraphLLMLoading,
  isNodeLLMLoading,
  showAgentLogPanel,
  llmEnabled,
  setNodeLLMAbortController,
  getNodeLLMAbortController,
} = llmState

function stopNodeLLM() {
  // Stop agent if in agent mode
  if (nodeAgentMode.value === 'agent') {
    nodeAgent.stop()
  }
  const controller = getNodeLLMAbortController()
  if (controller) {
    controller.abort()
    setNodeLLMAbortController(null)
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
    getFilteredNodes: () => store.filteredNodes,
    getFilteredEdges: () => store.filteredEdges,
    updateNodeContent: store.updateNodeContent,
    updateNodePosition: store.updateNodePosition,
    updateNodeColor: store.updateNodeColor,
    updateEdgeColor: store.updateEdgeColor,
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
    // Enable undo for AI content changes
    pushContentUndo,
  }

  // Try extracted executor (handles simple tools)
  const result = await executeTool(name, args, toolCtx)

  // Try marker handlers for async processing
  const markerResult = await markerHandlers.handleMarker(result)
  if (markerResult !== null) {
    return markerResult
  }

  // If not a marker and not unhandled, return result
  if (!result.startsWith('__UNHANDLED__:')) {
    return result
  }

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
  getProviderId: getActiveProviderId,
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
  const currentContent = isEditing ? editContent.value : node.markdown_content || ''

  // Save undo state before AI modifies content (use current content, not stored)
  pushContentUndo(nodeId, currentContent, node.title)

  isNodeLLMLoading.value = true
  const prompt = nodePrompt.value
  nodePrompt.value = ''
  savePromptToHistory(prompt)

  try {
    // Use agent mode if enabled
    if (nodeAgentMode.value === 'agent') {
      // Get ALL connected nodes via BFS traversal
      const allConnected = findConnectedNodes(nodeId, store.filteredEdges, store.getNode)
      const connectedNodes = allConnected.map(({ title, content }) => ({ title, content }))

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

      // Clear any leftover logs and run agent
      nodeAgent.log.value = []
      await nodeAgent.run(prompt, ctx)
      // Merge node agent logs to global log
      nodeAgent.log.value.forEach(msg => agentLog.value.push(msg))
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

    // Build context with content from chain (respecting limit)
    const contextLimit = llmStorage.getChainContextLimit()
    const chainContext = buildChainContext(chainNodes, contextLimit)

    const hasContext = chainContext.length > 0
    const nodeSystemPrompt = `You are editing a note in a knowledge graph. ${hasContext ? 'IMPORTANT: Consider the CONNECTED NODES context below - they provide relevant information that may disambiguate or enrich the current note.' : ''}

CRITICAL: Do NOT fabricate information. Do NOT invent citations, organizations, frameworks, dates, or facts. Only use information from:
1. The user's request
2. The current note content
3. The connected nodes context (if provided)
If you don't have information, say so or omit it - never make things up.

Output the updated note content directly. NO preamble ("Here is", "Sure", etc). NO code fences unless content IS code.
Format: Obsidian markdown with [[wikilinks]], #tags, **bold**, lists.
${chainContext}
CURRENT NOTE TO EDIT:
Title: ${node.title || 'Untitled'}
Content:
${currentContent || '(empty)'}`

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
function getNodeHeight(
  node: { height?: number; markdown_content: string | null },
  respectCollapse = true
): number {
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
// Use 2D transform to avoid z-axis issues when zooming in
const transform = computed(() => {
  return `translate(${offsetX.value}px, ${offsetY.value}px) scale(${scale.value})`
})

// Pan with pointer drag on empty canvas space (supports mouse, touch, pen)
function onCanvasPointerDown(e: PointerEvent) {
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

  // Left click/primary touch - start panning or lasso if not on a node
  if (e.button === 0) {
    const target = e.target as HTMLElement
    // Don't pan if clicking on a node, edge, panel, frame, or node AI toolbar
    if (
      target.closest('.node-card') ||
      target.closest('.edge-line') ||
      target.closest('.edge-panel') ||
      target.closest('.canvas-frame') ||
      target.closest('.node-llm-bar-floating')
    ) {
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
      document.addEventListener('pointermove', updateLasso)
      document.addEventListener(
        'pointerup',
        () => {
          endLasso()
          document.removeEventListener('pointermove', updateLasso)
        },
        { once: true }
      )
      return
    }

    // Track click position to detect click vs drag
    const startX = e.clientX
    const startY = e.clientY

    // Clear selection on click (not drag) - check on pointerup
    const onPointerUp = (upEvent: PointerEvent) => {
      const dx = Math.abs(upEvent.clientX - startX)
      const dy = Math.abs(upEvent.clientY - startY)
      // If barely moved, treat as click and clear selection
      if (dx < 5 && dy < 5) {
        store.selectNode(null)
        store.selectFrame(null)
        selectedEdge.value = null
      }
      document.removeEventListener('pointerup', onPointerUp)
    }
    document.addEventListener('pointerup', onPointerUp)

    startPan(e)
    return
  }
}

// Node collision composable
const nodeCollision = useNodeCollision({
  getNode: store.getNode,
  getFilteredNodes: () => store.filteredNodes,
  updateNodePosition: store.updateNodePosition,
})
const { pushOverlappingNodesAway, pushOverlappingNodesAwayExcept } = nodeCollision

// When node is selected, push non-neighbors away from neighbors
// Skip in dot mode (semantic zoom collapsed or LOD mode) - nodes are small dots, no need to push
// Skip in neighborhood mode - layout is controlled by the neighborhood system
watch(
  () => store.selectedNodeIds,
  selectedIds => {
    if (selectedIds.length === 0) return
    if (isSemanticZoomCollapsed.value || isLODMode.value || neighborhoodMode.value) return // Skip in dot/neighborhood mode

    // Get all neighbor IDs for selected nodes
    const protectedIds = new Set<string>(selectedIds)
    for (const edge of store.filteredEdges) {
      if (selectedIds.includes(edge.source_node_id)) {
        protectedIds.add(edge.target_node_id)
      }
      if (selectedIds.includes(edge.target_node_id)) {
        protectedIds.add(edge.source_node_id)
      }
    }

    // For each neighbor, push away overlapping non-neighbors
    for (const neighborId of protectedIds) {
      if (!selectedIds.includes(neighborId)) {
        pushOverlappingNodesAwayExcept(neighborId, protectedIds)
      }
    }
  },
  { deep: true }
)

// Node resizing composable
const nodeResizing = useNodeResizing({
  store: {
    getNode: store.getNode,
    updateNodeSize: store.updateNodeSize,
    updateNodePosition: store.updateNodePosition,
    get selectedNodeIds() {
      return store.selectedNodeIds
    },
  },
  scale,
  gridLockEnabled,
  snapToGrid,
  neighborhoodMode,
  focusNodeId,
  layoutNeighborhood,
  pushOverlappingNodesAway,
  setLastDragEndTime: (time: number) => {
    lastDragEndTime = time
  },
  pushSizeUndo,
  isSemanticZoomCollapsed,
  isLODMode,
  getVisualNode,
})
const { resizingNode, resizePreview, onResizePointerDown } = nodeResizing

// Node dragging composable
const nodeDragging = useNodeDragging({
  store: {
    getNode: store.getNode,
    updateNodePosition: store.updateNodePosition,
    selectNode: store.selectNode,
    get selectedNodeIds() {
      return store.selectedNodeIds
    },
    get filteredNodes() {
      return store.filteredNodes
    },
    get filteredEdges() {
      return store.filteredEdges
    },
    get frames() {
      return store.frames
    },
    assignNodesToFrame: store.assignNodesToFrame,
    refreshNodeFromFile: store.refreshNodeFromFile,
    get nodeLayoutVersion() {
      return store.nodeLayoutVersion
    },
    set nodeLayoutVersion(v: number) {
      store.nodeLayoutVersion = v
    },
  },
  scale,
  offset: computed(() => ({ x: offsetX.value, y: offsetY.value })),
  canvasRef,
  gridLockEnabled,
  snapToGrid,
  neighborhoodMode,
  focusNodeId,
  isLODMode,
  isSemanticZoomCollapsed,
  editingNodeId,
  editingTitleId,
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
  setLastDragEndTime: (time: number) => {
    lastDragEndTime = time
  },
})
const { draggingNode, onNodePointerDown } = nodeDragging

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
  // If this is a blur event (e defined) and search is active, don't close
  // (focus is moving within the node, e.g., to search bar)
  // Direct calls without event (e.g., from canvas click or Cmd+Enter) should still close
  if (e && showNodeSearch.value) {
    return
  }
  // Don't close if focus moved to LLM inputs, buttons, color bar, search bar, or title header
  if (e?.relatedTarget) {
    const related = e.relatedTarget as HTMLElement
    if (
      related.closest('.node-llm-bar-floating') ||
      related.closest('.collapsed-color-bar') ||
      related.closest('.graph-llm-bar') ||
      related.closest('.node-search-bar') ||
      related.closest('.node-header')
    ) {
      return
    }
  }
  // Close search if it was open
  if (showNodeSearch.value) {
    closeNodeSearch()
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
  // Cmd/Ctrl+F opens in-node search
  if ((e.metaKey || e.ctrlKey) && (e.key === 'f' || e.key === 'F')) {
    e.preventDefault()
    openNodeSearch()
    return
  }
  if (e.key === 'Escape') {
    if (showNodeSearch.value) {
      closeNodeSearch()
    } else {
      saveEditing()
    }
    return
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
  if (
    target.closest('.node-card') ||
    target.closest('.edge-panel') ||
    target.closest('.zoom-controls') ||
    target.closest('.status-bar')
  ) {
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

// Edge styling composable - handles colors, styles, stroke width, and theme-aware highlighting
const edgeStyling = useEdgeStyling({
  store: {
    updateEdgeLinkType: store.updateEdgeLinkType,
    updateEdgeColor: store.updateEdgeColor,
  },
  selectedEdgeId: selectedEdge,
  currentTheme,
  scale,
  workspaceId: computed(() => store.currentWorkspaceId),
})
const {
  edgeStyleMap,
  globalEdgeStyle,
  edgeStrokeWidth,
  edgeColorPalette,
  highlightColor,
  selectedColor,
  nodeColors,
  cycleEdgeStyle,
  getEdgeColor,
  getEdgeHighlightColor,
  changeEdgeColor,
} = edgeStyling

// Edge routing composable - computes edge paths with routing, port assignments, and optimization
// Note: Pass store directly so computed properties remain reactive
// isDragging skips complex routing during drag for performance
const isDraggingRef = computed(() => draggingNode.value !== null)
const { edgeLines } = useEdgeRouting({
  store,
  displayNodes,
  neighborhoodMode,
  focusNodeId,
  isMassiveGraph,
  isHugeGraph,
  isLODMode,
  globalEdgeStyle,
  edgeStyleMap,
  getNodeHeight,
  isDragging: isDraggingRef,
  isZooming,
})

// Edge visibility composable - filters edges and pre-computes rendering properties
const { visibleEdgeLines } = useEdgeVisibility({
  edgeLines,
  visibleNodeIds,
  hoveredNodeId,
  selectedNodeIds: computed(() => store.selectedNodeIds),
  selectedEdge,
  highlightedEdgeIds,
  highlightAllEdges,
  edgeStrokeWidth,
  highlightColor,
  selectedColor,
  getEdgeColor,
  getEdgeHighlightColor,
  getNode: store.getNode,
})

function updateSelectedNodesColor(color: string | null) {
  // Capture old colors for undo
  const oldColors = new Map<string, string | null>()
  for (const nodeId of store.selectedNodeIds) {
    const node = store.getNode(nodeId)
    if (node) {
      oldColors.set(nodeId, node.color_theme ?? null)
    }
  }
  pushColorUndo(oldColors)

  // Apply color to all selected nodes
  for (const nodeId of store.selectedNodeIds) {
    store.updateNodeColor(nodeId, color)
  }
}

function updateSelectedFrameColor(color: string | null) {
  if (store.selectedFrameId) {
    store.updateFrameColor(store.selectedFrameId, color)
  }
}

async function fitSelectedNodes() {
  // Selected nodes are always included in visibleNodes via viewport culling,
  // so they're guaranteed to be in the DOM when zoomed in
  if (store.selectedNodeIds.length === 0) return

  // Capture old sizes for undo
  const oldSizes = new Map<string, { width: number; height: number; x: number; y: number }>()
  for (const nodeId of store.selectedNodeIds) {
    const node = store.getNode(nodeId)
    if (node) {
      oldSizes.set(nodeId, {
        width: node.width || NODE_DEFAULTS.WIDTH,
        height: node.height || NODE_DEFAULTS.HEIGHT,
        x: node.canvas_x,
        y: node.canvas_y,
      })
    }
  }

  // Fit all selected nodes to their content sequentially
  for (const nodeId of store.selectedNodeIds) {
    await fitNodeNow(nodeId)
  }

  // Push undo if any sizes were captured
  if (oldSizes.size > 0) {
    pushSizeUndo(oldSizes)
  }
}

// One-shot fit to content (does NOT enable auto_fit)
async function fitNodeNow(nodeId: string): Promise<void> {
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
      [nodeId]: renderMarkdown(node.markdown_content),
    }
  }

  // Wait for Vue to render the view mode content and render math
  await nextTick()
  await renderTypstMath()
  await nextTick()

  // Poll until .node-content exists (max 500ms)
  const cardEl = document.querySelector(`[data-node-id="${nodeId}"]`)
  if (!cardEl) return

  return new Promise<void>(resolve => {
    let attempts = 0
    const waitForContent = () => {
      const contentEl = cardEl.querySelector('.node-content')
      const editorEl = cardEl.querySelector('.inline-editor')

      if (contentEl && !editorEl) {
        // Content element exists, editor gone - safe to measure
        renderMermaidDiagrams()
        setTimeout(() => {
          fitNodeToContent(nodeId)
          resolve()
        }, 100)
      } else if (attempts < 10) {
        attempts++
        setTimeout(waitForContent, 50)
      } else {
        // Timeout - resolve anyway
        resolve()
      }
    }
    waitForContent()
  })
}

function selectAllNodes() {
  // Select all visible nodes (respects neighborhood mode)
  const nodeIds = displayNodes.value.map(n => n.id)
  store.selectedNodeIds.splice(0, store.selectedNodeIds.length, ...nodeIds)
}

async function deleteSelectedNodes() {
  const ids = [...store.selectedNodeIds]
  if (ids.length === 0) return

  // Collect all nodes and edges for undo before deletion
  const undoData: Array<{ node: Node; edges: Edge[] }> = []
  for (const id of ids) {
    const node = store.getNode(id)
    if (node) {
      const connectedEdges = store.filteredEdges.filter(
        e => e.source_node_id === id || e.target_node_id === id
      )
      undoData.push({ node, edges: connectedEdges })
    }
  }

  // Push all to undo stack
  for (const { node, edges } of undoData) {
    pushDeletionUndo(node, edges)
  }

  // Batch delete all nodes at once
  await store.deleteNodes(ids)
}

// Get node background - wrapper for utility function with current theme
function getNodeBackground(colorTheme: string | null): string | undefined {
  return getNodeBackgroundUtil(colorTheme, currentTheme.value)
}

// Get computed style for a node card (simplifies template binding)
function getNodeStyle(node: {
  id: string
  canvas_x: number
  canvas_y: number
  width?: number
  height?: number
  color_theme?: string | null
}) {
  const isResizing = resizingNode.value === node.id
  const x = isResizing ? resizePreview.value.x : node.canvas_x
  const y = isResizing ? resizePreview.value.y : node.canvas_y
  const width = isResizing ? resizePreview.value.width : node.width || NODE_DEFAULTS.WIDTH
  const height = isResizing ? resizePreview.value.height : node.height || NODE_DEFAULTS.HEIGHT

  // Calculate screen position (node layer is outside canvas-content scale transform)
  const screenX = x * scale.value + offsetX.value
  const screenY = y * scale.value + offsetY.value
  const screenWidth = width * scale.value
  const screenHeight = height * scale.value

  const style: Record<string, string> = {
    '--zoom-scale': String(scale.value),
    transform: `translate(${screenX}px, ${screenY}px)`,
    width: screenWidth + 'px',
    height: screenHeight + 'px',
    borderWidth: (nodeBorderWidth.value * scale.value) + 'px',
  }

  // Apply color theme background if set
  if (node.color_theme) {
    const bg = getNodeBackground(node.color_theme)
    if (bg) style.background = bg
  } else if (isSemanticZoomCollapsed.value && !store.selectedNodeIds.includes(node.id)) {
    // Collapsed non-selected nodes get canvas background
    style.background = 'var(--bg-canvas)'
    style.borderColor = 'var(--text-muted)'
  }

  return style
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

// LOD canvas context menu handlers
function onLODNodeContextMenu(e: MouseEvent, nodeId: string) {
  contextMenu.open(e, nodeId)
  if (!store.selectedNodeIds.includes(nodeId)) {
    store.selectNode(nodeId)
  }
}

function onLODCanvasContextMenu(_e: MouseEvent) {
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

// Graph export composable
const graphExport = useGraphExport({
  getSelectedNodeIds: () => store.selectedNodeIds,
  displayNodes,
  edgeLines,
  neighborhoodMode,
  showToast,
})
const { exportGraphAsYaml } = graphExport

// Expose export function globally for debugging
// eslint-disable-next-line @typescript-eslint/no-explicit-any
;(window as any).exportGraphAsYaml = exportGraphAsYaml

// Helper to start editing a node and immediately open search
function startEditingAndSearch(nodeId: string) {
  startEditing(nodeId)
  // Wait for DOM to update, then open search
  setTimeout(() => openNodeSearch(), 50)
}

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
  startEditingAndSearch,
  layoutNodes: () => store.layoutNodes(undefined, { frameId: store.selectedFrameId ?? undefined }),
  fitToContent,
  toggleNeighborhoodMode,
  fontScale,
  increaseFontScale,
  decreaseFontScale,
  refreshFromFiles,
  exportGraphAsYaml,
  showHelp: () => {
    showHelpModal.value = true
  },
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
      :show-log="showAgentLogPanel"
      @update:graph-prompt="graphPrompt = $event"
      @send="sendGraphPrompt"
      @stop="stopAgent"
      @clear-conversation="clearConversation"
      @prompt-keydown="onPromptKeydown"
      @clear-log="agentLog.length = 0"
    />

    <!-- Standalone agent log panel (when LLM bar is hidden) -->
    <CanvasAgentLogPanel
      v-if="!llmEnabled && showAgentLogPanel && agentLog.length > 0"
      :log="agentLog"
      @clear="agentLog.length = 0"
      @close="showAgentLogPanel = false"
    />

    <div
      ref="canvasRef"
      class="canvas-viewport"
      :class="{ panning: isPanning, 'frame-placement': frames.pendingFramePlacement.value }"
      :style="{ backgroundPosition: offsetX + 'px ' + offsetY + 'px' }"
      @wheel="onWheel"
      @pointerdown="onCanvasPointerDown"
      @pointermove="onCanvasPointerMove"
      @pointerenter="onCanvasPointerEnter"
      @pointerleave="onCanvasPointerLeave"
      @dblclick="onCanvasDoubleClick"
      @contextmenu="onContextMenu"
    >
      <!-- Floating color bar (shown when nodes or frame is selected) -->
      <CanvasColorBar
        v-if="store.selectedNodeIds.length > 0 || store.selectedFrameId"
        :colors="nodeColors"
        :selected-node-ids="store.selectedNodeIds"
        :selected-frame-id="store.selectedFrameId"
        :is-collapsed="isSemanticZoomCollapsed"
        :get-node-color="(id: string) => store.filteredNodes.find(n => n.id === id)?.color_theme"
        :get-frame-color="() => store.filteredFrames.find(f => f.id === store.selectedFrameId)?.color"
        @update-node-color="updateSelectedNodesColor"
        @update-frame-color="updateSelectedFrameColor"
        @fit-nodes="fitSelectedNodes"
      />

      <!-- Canvas 2D LOD layer for GPU-accelerated circle rendering -->
      <CanvasLODCanvas
        v-if="isLODMode"
        :nodes="lodCircleNodes"
        :scale="scale"
        :offset-x="offsetX"
        :offset-y="offsetY"
        :selected-node-ids="store.selectedNodeIds"
        :highlighted-node-ids="highlightedNodeIds"
        :dragging-node-id="draggingNode"
        :hovered-node-id="hoveredNodeId"
        :get-l-o-d-radius="getLODRadius"
        @node-pointerdown="onNodePointerDown"
        @node-pointerenter="onNodePointerEnter"
        @node-pointerleave="onNodePointerLeave"
        @node-dblclick="startEditing"
        @node-contextmenu="onLODNodeContextMenu"
        @canvas-contextmenu="onLODCanvasContextMenu"
      />

      <div class="canvas-content" :style="{ transform }">
        <!-- Frames (rendered first, below edges) -->
        <CanvasFrames
          :frames="store.filteredFrames"
          :selected-frame-id="store.selectedFrameId"
          :editing-frame-id="editingFrameId"
          :edit-frame-title="editFrameTitle"
          :frame-border-width="frameBorderWidth"
          :scale="scale"
          @update:edit-frame-title="editFrameTitle = $event"
          @pointerdown="onFramePointerDown"
          @dblclick="startEditingFrameTitle"
          @save-title="saveFrameTitleEditing"
          @cancel-title="cancelFrameTitleEditing"
          @delete="deleteSelectedFrame"
          @start-resize="startFrameResize"
        />

        <!-- SVG for edges (above frames) -->
        <CanvasEdgesSVG
          :edges="visibleEdgeLines"
          :is-large-graph="isLargeGraph"
          :edge-stroke-width="edgeStrokeWidth"
          :lasso-points="lassoPoints"
          :is-lasso-selecting="isLassoSelecting"
          :current-theme="currentTheme"
          :highlight-color="highlightColor"
          :is-creating-edge="isCreatingEdge"
          :edge-preview-start="
            edgeStartNode
              ? {
                  x: (store.getNode(edgeStartNode)?.canvas_x || 0) + 100,
                  y: (store.getNode(edgeStartNode)?.canvas_y || 0) + 40,
                }
              : null
          "
          :edge-preview-end="edgePreviewEnd"
          @edge-click="onEdgeClick"
        />

        <!-- LOD Mode circles are rendered via Canvas 2D in CanvasLODCanvas above -->
      </div>

      <!-- Node cards layer - outside canvas-content for crisp text rendering -->
      <!-- Nodes are positioned in screen coordinates directly -->
      <div class="nodes-layer">
        <CanvasNodeCard
          v-for="node in lodCardNodes"
          :key="node.id"
          :node="node"
          :style="getNodeStyle(node)"
          :is-selected="store.selectedNodeIds.includes(node.id)"
          :is-dragging="draggingNode === node.id"
          :is-resizing="resizingNode === node.id"
          :is-editing="editingNodeId === node.id"
          :is-collapsed="isSemanticZoomCollapsed"
          :is-neighborhood-mode="neighborhoodMode"
          :is-neighborhood-focus="neighborhoodMode && node.id === focusNodeId"
          :is-neighbor-highlighted="highlightedNodeIds.has(node.id)"
          :show-thumbnail="showImageThumbnail"
          :thumbnail-src="nodeFirstImage[node.id]"
          :rendered-content="nodeRenderedContent[node.id] || ''"
          :editing-title-id="editingTitleId"
          :edit-title="editTitle"
          :edit-content="editContent"
          :scale="scale"
          :show-node-search="showNodeSearch && editingNodeId === node.id"
          :node-search-query="nodeSearchQuery"
          :node-search-match-count="nodeSearchMatches.length"
          :node-search-index="nodeSearchIndex"
          :linked-entities="getLinkedEntities(node.id)"
          :spellcheck-enabled="displayStore.spellcheckEnabled"
          @pointerdown="onNodePointerDown($event, node.id)"
          @pointerenter="onNodePointerEnter($event, node.id)"
          @pointermove="onNodePointerMove($event)"
          @pointerleave="onNodePointerLeave"
          @dblclick="startEditing(node.id)"
          @start-editing-title="startEditingTitle(node.id)"
          @save-title="saveTitleEditing"
          @cancel-title="cancelTitleEditing"
          @update:edit-title="editTitle = $event"
          @update:edit-content="editContent = $event"
          @save-editing="saveEditing($event)"
          @editor-keydown="onEditorKeydown"
          @content-click="handleContentClick"
          @delete="deleteSelectedNodes"
          @resize-start="(e, dir) => onResizePointerDown(e, node.id, dir)"
          @update:node-search-query="updateNodeSearch"
          @find-next="findNextMatch"
          @find-prev="findPrevMatch"
          @close-search="closeNodeSearch"
          @entity-click="handleEntityClick"
        />
      </div>

      <!-- Floating Node LLM bar (positioned in screen coordinates, outside canvas transform) -->
      <!-- Hidden when zoomed out (semantic zoom collapsed) since node content isn't editable -->
      <NodeLLMBar
        v-if="getVisualNode(store.selectedNodeIds[0] || editingNodeId!)"
        :visible="
          llmEnabled &&
          !isSemanticZoomCollapsed &&
          (store.selectedNodeIds.length === 1 || !!editingNodeId)
        "
        :node-prompt="nodePrompt"
        :is-loading="isNodeLLMLoading"
        :node-x="
          getVisualNode(store.selectedNodeIds[0] || editingNodeId!)!.canvas_x * scale + offsetX
        "
        :node-y="
          getVisualNode(store.selectedNodeIds[0] || editingNodeId!)!.canvas_y * scale + offsetY
        "
        :node-width="
          (getVisualNode(store.selectedNodeIds[0] || editingNodeId!)!.width ||
            NODE_DEFAULTS.WIDTH) * scale
        "
        :scale="1"
        @update:node-prompt="nodePrompt = $event"
        @send="sendNodePrompt"
        @stop="stopNodeLLM"
        @keydown="onNodePromptKeydown"
      />

      <!-- Edge edit panel -->
      <CanvasEdgePanel
        :selected-edge="selectedEdge"
        :edges="store.filteredEdges"
        :edge-color-palette="edgeColorPalette"
        :get-edge-color="getEdgeColor"
        :is-edge-directed="isEdgeDirected"
        @close="selectedEdge = null"
        @change-label="changeEdgeLabel"
        @change-color="changeEdgeColor"
        @reverse="reverseEdge"
        @make-non-directional="makeNonDirectional"
        @make-directional="makeDirectional"
        @insert-node="insertNodeOnEdge"
        @delete="deleteSelectedEdge"
      />

      <!-- Node Preview Panel (shown when zoomed out and node selected) -->
      <CanvasPreviewPanel
        :visible="showPreviewPanel && !!previewNode"
        :title="previewNode?.title || ''"
        :content="previewContent"
        :raw-content="previewNode?.markdown_content || ''"
        :node-id="previewNode?.id || ''"
        @close="closePreviewPanel"
        @zoom-to-node="zoomToPreviewNode"
        @save="savePreviewContent"
        @save-title="savePreviewTitle"
        @render-mermaid="renderMermaidDiagrams"
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
        :highlight-all-edges="highlightAllEdges"
        :bubble-mode-active="isBubbleModeForced"
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
        @toggle-highlight-edges="highlightAllEdges = !highlightAllEdges"
        @toggle-bubble-mode="toggleBubbleMode"
      />

      <!-- Help Modal -->
      <KeyboardShortcutsModal :show="showHelpModal" @close="showHelpModal = false" />

      <!-- Status Bar -->
      <CanvasStatusBar
        :visible-node-count="visibleNodes.length"
        :total-node-count="store.filteredNodes.length"
        :visible-edge-count="visibleEdgeLines.length"
        :total-edge-count="store.filteredEdges.length"
        :is-layouting="isLayouting"
        :is-large-graph="isLargeGraph"
        :is-pdf-processing="pdfDrop.isProcessing.value"
        :pdf-status="pdfDrop.processingStatus.value"
        :agent-log="agentLog"
        :show-agent-log="showAgentLogPanel"
        @stop-pdf="pdfDrop.stop()"
        @toggle-agent-log="showAgentLogPanel = !showAgentLogPanel"
      />

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
        :rendered-content="hoveredNode ? nodeRenderedContent[hoveredNode.id] || '' : ''"
        :edge-stats="hoveredNodeEdgeStats"
      />

      <!-- Minimap -->
      <CanvasMinimap
        v-if="minimap.viewport.value"
        :visible="store.filteredNodes.length > 0"
        :nodes="store.filteredNodes"
        :minimap-size="minimap.MINIMAP_SIZE"
        :get-node-position="minimap.getNodePosition"
        :is-selected="minimap.isSelected"
        :viewport-x="minimap.viewport.value.x || 0"
        :viewport-y="minimap.viewport.value.y || 0"
        :viewport-width="minimap.viewport.value.width || 50"
        :viewport-height="minimap.viewport.value.height || 40"
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
        :entity-submenu="contextMenuEntitySubmenu"
        :storylines="store.filteredStorylines"
        :workspaces="store.workspaces"
        :entities="store.getEntities()"
        :current-workspace-id="store.currentWorkspaceId"
        :has-d-o-i="contextMenuNodeHasDOI"
        :doi-count="contextMenuDOICount"
        @close="closeContextMenu"
        @fit-to-content="fitNodeNow"
        @zoom-to-node="zoomToNodeDefault"
        @open-link-picker="openLinkPicker"
        @delete-nodes="deleteSelectedNodes"
        @add-to-storyline="addNodeToStoryline"
        @create-storyline="createStorylineFromNode"
        @move-to-workspace="moveNodesToWorkspace"
        @link-to-entity="linkToEntity"
        @create-entity="handleCreateEntity"
        @fetch-citations="handleFetchCitations()"
        @update:storyline-submenu="contextMenuStorylineSubmenu = $event"
        @update:workspace-submenu="contextMenuWorkspaceSubmenu = $event"
        @update:entity-submenu="contextMenuEntitySubmenu = $event"
      />

      <!-- Citation fetch progress indicator -->
      <div v-if="isFetchingCitations" class="citation-fetch-progress">
        <div class="citation-fetch-content">
          <div class="citation-fetch-header">
            <span class="citation-fetch-title">Fetching Citations</span>
            <span v-if="queueSize > 0" class="citation-fetch-queue">({{ queueSize }} queued)</span>
            <button class="citation-fetch-cancel" @click="citationFetch.cancelFetch()">
              Cancel
            </button>
          </div>
          <div v-if="fetchProgress" class="citation-fetch-info">
            <div v-if="fetchProgress.paperCount && fetchProgress.paperCount > 1" class="citation-fetch-papers">
              Paper {{ fetchProgress.paperIndex }} / {{ fetchProgress.paperCount }}
            </div>
            <div class="citation-fetch-count">
              Citation {{ fetchProgress.current }} / {{ fetchProgress.total }}
            </div>
            <div class="citation-fetch-paper">{{ fetchProgress.paperTitle }}</div>
            <div class="citation-fetch-bar">
              <div
                class="citation-fetch-bar-fill"
                :style="{ width: `${(fetchProgress.current / Math.max(fetchProgress.total, 1)) * 100}%` }"
              ></div>
            </div>
          </div>
          <!-- Wait countdown display -->
          <div v-if="waitStatus?.isWaiting" class="citation-fetch-wait">
            <span class="citation-fetch-wait-icon">&#8987;</span>
            <span class="citation-fetch-wait-text">
              {{ waitStatus.reason === 'backoff' ? 'Rate limited, retrying in' : 'Next request in' }}
              {{ waitStatus.remainingSeconds }}s
            </span>
          </div>
        </div>
      </div>

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

<style src="./styles/index.css"></style>
