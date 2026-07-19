<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, nextTick, inject, toRef } from 'vue'
import { storeToRefs } from 'pinia'
import { useNodesStore } from '../stores/nodes'
import { useThemesStore } from '../stores/themes'
import { useDisplayStore } from '../stores/display'
import type { Node } from '../types'
// marked is imported in useContentRenderer composable
import { openExternal } from '../lib/tauri'
import { optimizeNodeEntrypoints } from './routing'
import { useLLM, executeTool, llmQueue, type ToolContext } from '../llm'
import { memoryStorage, agentMemoryStorage } from '../lib/storage'
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
  useCanvasNodeStyle,
  useColorOperations,
} from './composables/nodes'
import {
  useEdgeManipulation,
  useEdgeRouting,
  useEdgeStyling,
  useEdgeVisibility,
} from './composables/edges'
import { useLasso, useContextMenu, useSelectionActions } from './composables/selection'
import {
  useAgentRunner,
  useLLMTools,
  useMarkerHandlers,
  usePlanHandlers,
  useCanvasLLMState,
  type AgentContext,
} from './composables/agent'
import { useContentRenderer, useViewportCulling, useGraphMetrics } from './composables/rendering'
import { useLayout, useNeighborhoodMode } from './composables/layout'
import { useFrames, useFrameFitting, useFrameOperations } from './composables/frames'
import {
  useCanvasKeyboardShortcuts,
  usePdfDrop,
  useStorylines,
  useUndoHandlers,
  useGraphExport,
  useCitationFetch,
  useCanvasSettings,
  useCanvasEventHandlers,
  useCanvasTheme,
  useCanvasZotero,
  useFullscreenModal,
} from './composables/util'
import { measureNodeContent } from './utils/nodeSizing'
import { findConnectedNodes } from './utils/graphTraversal'
import ImportOptionsModal from '../components/ImportOptionsModal.vue'
import { NODE_DEFAULTS } from './constants'
import CanvasStatusBar from './components/CanvasStatusBar.vue'
import CanvasControls from './components/CanvasControls.vue'
import CanvasContextMenu from './components/CanvasContextMenu.vue'
import CanvasEdgePanel from './components/CanvasEdgePanel.vue'
import CanvasLLMBar from './components/CanvasLLMBar.vue'
import CanvasHoverTooltip from './components/CanvasHoverTooltip.vue'
import CanvasMinimap from './components/CanvasMinimap.vue'
import CanvasFrames from './components/CanvasFrames.vue'
import CanvasEdgesSVG from './components/CanvasEdgesSVG.vue'
import CanvasNodeCard from './components/CanvasNodeCard.vue'
import CanvasPreviewPanel from './components/CanvasPreviewPanel.vue'
import CanvasLODCanvas from './components/CanvasLODCanvas.vue'
import CanvasAgentLogPanel from './components/CanvasAgentLogPanel.vue'
import { isErrorLog } from '../llm/agentLog'
import CanvasColorBar from './components/CanvasColorBar.vue'
import KeyboardShortcutsModal from '../components/KeyboardShortcutsModal.vue'
import PlanApprovalModal from '../components/PlanApprovalModal.vue'
import CanvasCitationProgress from './components/CanvasCitationProgress.vue'
import CanvasZoteroProgress from './components/CanvasZoteroProgress.vue'
import CanvasLinkPickerModal from './components/CanvasLinkPickerModal.vue'
import CanvasEmptyState from './components/CanvasEmptyState.vue'
import AgentTaskPanel from '../components/AgentTaskPanel.vue'
import FullscreenNodeModal from '../components/FullscreenNodeModal.vue'
import FileMoveCollisionDialog from '../components/FileMoveCollisionDialog.vue'
import { usePlanState } from '../llm/planState'
import { useAgentTasksStore } from '../stores/agentTasks'
import { useNodeService } from '../composables/useNodeService'
import { notifications$ } from '../composables/useNotifications'

// Undo handlers
const {
  pushUndo,
  pushContentUndo,
  pushDeletionUndo,
  pushCreationUndo,
  pushColorUndo,
  pushSizeUndo,
  pushFramePositionUndo,
  pushFrameAssignmentUndo,
} = useUndoHandlers()

// Content renderer is configured via composable

const store = useNodesStore()
const themesStore = useThemesStore()
const agentTasksStore = useAgentTasksStore()
const displayStore = useDisplayStore()
const showToast = inject<(message: string, type: 'error' | 'success' | 'info' | 'warning') => void>('showToast')
const nodeService = useNodeService()

// MCP status is now injected directly in CanvasStatusBar

// Plan state for interactive approval flow
const planState = usePlanState()
// Destructure refs for template auto-unwrapping
const { currentPlan: planCurrentPlan, showApprovalModal: planShowApprovalModal } = planState

// File move collision dialog state
const showCollisionDialog = ref(false)
const collisionDialogData = ref<{
  sourceFileName: string
  targetFolder: string
  existingFileName: string
  resolve: (result: { resolution: 'cancel' | 'rename' | 'replace'; newName?: string }) => void
} | null>(null)

function handleCollisionDialogResolve(resolution: 'cancel' | 'rename' | 'replace', newName?: string) {
  if (collisionDialogData.value) {
    collisionDialogData.value.resolve({ resolution, newName })
  }
  showCollisionDialog.value = false
  collisionDialogData.value = null
}

async function showFileMoveCollisionDialog(
  sourceFileName: string,
  targetFolder: string,
  existingFileName: string
): Promise<{ resolution: 'cancel' | 'rename' | 'replace'; newName?: string }> {
  return new Promise((resolve) => {
    collisionDialogData.value = {
      sourceFileName,
      targetFolder,
      existingFileName,
      resolve,
    }
    showCollisionDialog.value = true
  })
}

// Track if we've centered the view initially
let hasInitiallyCentered = false

// Z-order map for radial layout (angle-based stacking)
const nodeZOrder = ref<Map<string, number>>(new Map())

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

  // Listen for LLM config changes (provider or API key)
  const handleLLMConfigChange = () => {
    refreshLLMConfigured()
  }
  window.addEventListener('nodus-llm-config-change', handleLLMConfigChange)

  // Listen for radial layout z-order updates (angle-based stacking)
  const handleRadialZOrder = (e: Event) => {
    const order = (e as CustomEvent<string[]>).detail
    const zMap = new Map<string, number>()
    order.forEach((id, idx) => zMap.set(id, idx))
    nodeZOrder.value = zMap
  }
  window.addEventListener('nodus-radial-z-order', handleRadialZOrder)

  // Listen for storyline panel hover events
  const handleStorylineNodeHover = (e: Event) => {
    const node = (e as CustomEvent<{ node: Node }>).detail?.node
    if (node) setExternalHover(node)
  }
  const handleStorylineNodeHoverEnd = () => {
    setExternalHover(null)
  }
  window.addEventListener('storyline-node-hover', handleStorylineNodeHover)
  window.addEventListener('storyline-node-hover-end', handleStorylineNodeHoverEnd)

  // Listen for open-node-detail events (from references sidebar)
  const handleOpenNodeDetail = (e: Event) => {
    const nodeId = (e as CustomEvent<{ nodeId: string }>).detail?.nodeId
    if (nodeId) openFullscreenNode(nodeId)
  }
  window.addEventListener('open-node-detail', handleOpenNodeDetail)

  // Setup PDF drop listener
  pdfDrop.setup()

  onUnmounted(() => {
    window.removeEventListener('resize', updateViewportSize)
    window.removeEventListener('zoom-to-node', handleZoomToNode)
    window.removeEventListener('nodus-llm-enabled-change', handleLLMEnabledChange)
    window.removeEventListener('nodus-llm-config-change', handleLLMConfigChange)
    window.removeEventListener('nodus-radial-z-order', handleRadialZOrder)
    window.removeEventListener('storyline-node-hover', handleStorylineNodeHover)
    window.removeEventListener('storyline-node-hover-end', handleStorylineNodeHoverEnd)
    window.removeEventListener('open-node-detail', handleOpenNodeDetail)
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
  async () => {
    // Exit neighborhood mode when workspace changes
    neighborhood.exit()
    // Auto-fit to content when switching workspaces (so nodes are visible)
    hasInitiallyCentered = false
    // Use nextTick to wait for Vue's reactivity to update filteredNodes
    await nextTick()
    // Short delay to ensure computed values have propagated
    setTimeout(() => {
      if (store.filteredNodes.length > 0) {
        fitToContent()
        hasInitiallyCentered = true
      } else {
        // Empty workspace - center the grid
        centerGrid()
      }
    }, 50)
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
  workspaceId: computed(() => store.currentWorkspaceId),
})
const {
  isLargeGraph,
  isHugeGraph,
  isMassiveGraph,
  isSemanticZoomCollapsed,
  isTextHidden,
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

// Render mermaid diagrams when visible nodes change (e.g., panning/zooming brings nodes into view)
let lastVisibleNodeIds = new Set<string>()
watch(
  () => visibleNodes.value.map(n => n.id).join(','),
  () => {
    const currentIds = new Set(visibleNodes.value.map(n => n.id))
    // Check if any new nodes came into view
    let hasNewNodes = false
    for (const id of currentIds) {
      if (!lastVisibleNodeIds.has(id)) {
        hasNewNodes = true
        break
      }
    }
    lastVisibleNodeIds = currentIds
    // If new nodes came into view and we're not collapsed, render mermaid
    if (hasNewNodes && !isSemanticZoomCollapsed.value) {
      setTimeout(renderMermaidDiagrams, 150)
    }
  }
)

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

// Handle double-click on node: navigate in neighborhood mode, zoom when zoomed out, otherwise edit
function handleNodeDoubleClick(nodeId: string) {
  // In neighborhood mode, double-click navigates to clicked node's neighborhood
  if (neighborhoodMode.value && nodeId !== focusNodeId.value) {
    focusNodeId.value = nodeId
    layoutNeighborhood(nodeId)
    return
  }
  // When zoomed out (LOD mode or semantic zoom collapsed), zoom to the node instead of editing
  if (isLODMode.value || isSemanticZoomCollapsed.value) {
    zoomToNode(nodeId, 1)
    return
  }
  // Otherwise, start editing
  startEditing(nodeId)
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
const { showPreviewPanel, previewNode, closePreviewPanel, zoomToPreviewNode, suppressPreviewPanel } = previewPanel

// Preview panel save handlers
async function savePreviewContent(nodeId: string, content: string) {
  await store.updateNodeContent(nodeId, content)
  setTimeout(renderMermaidDiagrams, 100)
}

async function savePreviewTitle(nodeId: string, title: string) {
  await store.updateNodeTitle(nodeId, title)
}

function handlePreviewNavigateToNode(nodeId: string) {
  // Select the linked node - this will update the preview panel
  store.selectNode(nodeId)
  // Optionally zoom to the node
  zoomToNode(nodeId, 1)
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
  getFilteredFrames: () => store.filteredFrames,
})
const {
  nodeRenderedContent,
  renderMarkdown,
  renderTypstMath,
  renderMermaidDiagrams,
  setupWatchers: setupContentWatchers,
  reinitializeMermaid,
} = contentRenderer

// Theme composable - tracks dark mode and theme changes
const { currentTheme } = useCanvasTheme({
  onThemeChange: () => reinitializeMermaid(),
})

// Preview content computed - renders on-demand if not cached
const previewContent = computed(() => {
  const node = previewNode.value
  if (!node) return ''
  // Return cached content or render on-demand
  return nodeRenderedContent.value[node.id] || renderMarkdown(node.markdown_content)
})

// Connected nodes for preview panel AI context
const previewConnectedNodes = computed(() => {
  const node = previewNode.value
  if (!node) return []
  return findConnectedNodes(node.id, store.filteredEdges, store.getNode)
    .map(({ title, content }) => ({ title, content }))
})

// Colors currently in use in nodes and frames (for color bar)
// Returns objects with value (stored) and display (shown in dot)
const colorsInUse = computed(() => {
  const colorValues = new Set<string>()

  // Collect colors from nodes
  for (const node of store.filteredNodes) {
    if (node.color_theme) {
      colorValues.add(node.color_theme)
    }
  }

  // Collect colors from frames
  for (const frame of store.filteredFrames) {
    if (frame.color) {
      colorValues.add(frame.color)
    }
  }

  // Map stored values to display colors using nodeColors palette
  return Array.from(colorValues).map(value => {
    // Find matching preset color to get display value
    const preset = nodeColors.value.find(c => c.value === value)
    return {
      value,
      display: preset?.display || value // fallback to stored value if no match
    }
  })
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
  searchNodeId,
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
    updateEdgeLabel: store.updateEdgeLabel,
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

// Handler for edge label save confirmation
function onEdgeLabelSave() {
  notifications$.success('Edge label saved')
}

// Canvas zoom composable - handles wheel zoom/pan
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
  onWheel,
  onCanvasPointerMove,
  onCanvasPointerEnter,
  onCanvasPointerLeave,
} = canvasZoom

// Canvas display composable - handles thumbnails, font scale
const canvasDisplay = useCanvasDisplay({
  scale,
  filteredNodes: computed(() => store.filteredNodes),
  isLargeGraph,
})
const {
  nodeFirstImage,
  showImageThumbnail,
  fontScale,
  increaseFontScale,
  decreaseFontScale,
} = canvasDisplay

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
  hoverTooltipEnabled: toRef(displayStore, 'hoverTooltipEnabled'),
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
  setExternalHover,
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
  handleFetchReferences,
  handleFetchBoth,
} = citationFetch

// Zotero integration composable
const { zotero, handleAddToZotero } = useCanvasZotero({
  store: {
    getNode: store.getNode,
  },
  getAffectedNodeIds: () => contextMenu.affectedNodeIds.value,
  showToast,
})

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
const canvasSettings = useCanvasSettings(store.currentWorkspaceId || undefined)
const {
  gridLockEnabled,
  highlightAllEdges,
  edgeHideThreshold,
  edgeLabelSize,
  hideWikilinkEdges,
  hideStorylineEdges,
  showHelpModal,
  snapToGrid,
} = canvasSettings

// Prevent double-click node creation right after drag
let lastDragEndTime = 0

// Frame operations composable - collision resolution and node organization
const { resolveFrameCollisions, organizeFrame } = useFrameOperations({
  store: {
    get filteredFrames() { return store.filteredFrames },
    get filteredNodes() { return store.filteredNodes },
    getNode: store.getNode,
    updateFramePosition: store.updateFramePosition,
    updateNodePosition: store.updateNodePosition,
  },
})

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
    persistFramePosition: store.persistFramePosition,
    updateFrameSize: store.updateFrameSize,
    updateFrameTitle: store.updateFrameTitle,
    updateNodePosition: store.updateNodePosition,
    persistNodePosition: store.persistNodePosition,
    assignNodesToFrame: store.assignNodesToFrame,
  },
  viewState: {
    scale,
    offsetX,
    offsetY,
    canvasRect: () => canvasRef.value?.getBoundingClientRect() || null,
  },
  screenToCanvas,
  snapToGrid,
  resolveFrameCollisions,
  pushFramePositionUndo,
  organizeFrameNodes: (frameId: string) => organizeFrame(frameId),
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
    getNode: store.getNode,
    updateNodePosition: store.updateNodePosition,
    updateFramePosition: store.updateFramePosition,
    updateFrameSize: store.updateFrameSize,
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
  type: 'grid' | 'horizontal' | 'vertical' | 'force' | 'hierarchical' | 'radial' = 'grid'
) {
  isLayouting.value = true
  const frameId = store.selectedFrameId
  try {
    // Use autoLayout for all layout types - it handles frame-scoped layouts correctly
    await layout.autoLayout(type, frameId ?? undefined)
  } finally {
    isLayouting.value = false
  }
}
function fitToContent() {
  layout.fitToContent()
}

// Frame fitting composable
const { fitSelectedFrameToContents } = useFrameFitting({
  store: {
    get frames() { return store.frames },
    get filteredNodes() { return store.filteredNodes },
    get selectedFrameId() { return store.selectedFrameId },
    updateFramePosition: store.updateFramePosition,
    updateFrameSize: store.updateFrameSize,
  },
})

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
  isGraphLLMLoading,
  showAgentLogPanel,
  llmEnabled,
  showLLMBar,
  refreshLLMConfigured,
} = llmState

// Auto-open log panel on error (only on error, not on regular log messages)
watch(
  () => agentLog.value.length,
  (newLen, oldLen) => {
    if (newLen > oldLen) {
      // Auto-open only on genuine failures, not tool results that merely
      // contain the word "Error" (see llm/agentLog.ts).
      const lastMessage = agentLog.value[newLen - 1]
      if (lastMessage && isErrorLog(lastMessage)) {
        showAgentLogPanel.value = true
      }
    }
  }
)

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

// Marker handlers composable for processing tool result markers
const markerHandlers = useMarkerHandlers({
  planState,
  nodes: computed(() => store.filteredNodes),
  log: (msg: string) => agentLog.value.push(msg),
  store: {
    updateNodeContent: store.updateNodeContent,
    updateNodeTitle: store.updateNodeTitle,
    updateNodeColor: store.updateNodeColor,
    deleteNode: store.deleteNode,
    getNode: store.getNode,
  },
  nodeService,
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
  agentMemoryStorage,
  log: (msg: string) => agentLog.value.push(msg),
  pushContentUndo,
  isRunning: agentRunning,
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
    // NodeService for guaranteed undo on deletions and moves
    service: nodeService ?? undefined,
    // Selection state for selection-aware tools
    selectedNodeIds: store.selectedNodeIds,
    editingNodeId: editingNodeId.value,
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
  selectedNodeIds: () => [...store.selectedNodeIds],
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

// Collapsed height constant for semantic zoom
// Height to accommodate 2 lines of title text + padding
const COLLAPSED_NODE_HEIGHT = 140

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
    // Don't pan if clicking on a node, edge, panel, or frame
    if (
      target.closest('.node-card') ||
      target.closest('.edge-line') ||
      target.closest('.edge-panel') ||
      target.closest('.canvas-frame')
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

// Auto-expand frame when node inside it grows beyond boundaries
function expandFrameToFitNode(nodeId: string, nodeWidth: number, nodeHeight: number, nodeX: number, nodeY: number) {
  const node = store.getNode(nodeId)
  if (!node) return

  // Only expand if node has explicit frame_id - don't use spatial check during resize
  // This prevents accidentally switching frames when frames overlap
  if (!node.frame_id) return

  const containingFrame = store.filteredFrames.find(f => f.id === node.frame_id)
  if (!containingFrame) return

  const nodeRight = nodeX + nodeWidth
  const nodeBottom = nodeY + nodeHeight
  const padding = 30

  // Calculate new frame bounds to contain the node
  let newX = containingFrame.canvas_x
  let newY = containingFrame.canvas_y
  let newWidth = containingFrame.width
  let newHeight = containingFrame.height

  // Expand left edge if node extends past it
  if (nodeX - padding < containingFrame.canvas_x) {
    const expandBy = containingFrame.canvas_x - (nodeX - padding)
    newX = nodeX - padding
    newWidth += expandBy
  }

  // Expand top edge if node extends past it
  if (nodeY - padding < containingFrame.canvas_y) {
    const expandBy = containingFrame.canvas_y - (nodeY - padding)
    newY = nodeY - padding
    newHeight += expandBy
  }

  // Expand right edge if node extends past it
  const frameRight = newX + newWidth
  if (nodeRight + padding > frameRight) {
    newWidth = nodeRight + padding - newX
  }

  // Expand bottom edge if node extends past it
  const frameBottom = newY + newHeight
  if (nodeBottom + padding > frameBottom) {
    newHeight = nodeBottom + padding - newY
  }

  // Update frame if changed
  const posChanged = newX !== containingFrame.canvas_x || newY !== containingFrame.canvas_y
  const sizeChanged = newWidth !== containingFrame.width || newHeight !== containingFrame.height

  if (posChanged) {
    store.updateFramePosition(containingFrame.id, newX, newY)
  }
  if (sizeChanged) {
    store.updateFrameSize(containingFrame.id, newWidth, newHeight)
  }
}

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
  expandFrameToFitNode,
})
const { resizingNode, resizePreview, onResizePointerDown } = nodeResizing

// Fullscreen node modal composable
const {
  showFullscreenModal,
  fullscreenNodeId,
  openFullscreenNode,
  closeFullscreenNode,
  handleNavigateToNode,
} = useFullscreenModal({
  getFilteredNodes: () => store.filteredNodes,
  getFilteredFrames: () => store.filteredFrames,
})

// Node dragging composable
const nodeDragging = useNodeDragging({
  store: {
    getNode: store.getNode,
    updateNodePosition: store.updateNodePosition,
    persistNodePosition: store.persistNodePosition,
    triggerLayoutUpdate: store.triggerLayoutUpdate,
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
    updateNodeFilePath: store.updateNodeFilePath,
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
  pushFrameAssignmentUndo,
  screenToCanvas,
  zoomToNode,
  optimizeNodeEntrypoints,
  onEdgePreviewMove,
  onEdgeCreate,
  setLastDragEndTime: (time: number) => {
    lastDragEndTime = time
  },
  onFullscreenOpen: openFullscreenNode,
  // File-folder sync
  checkFileCollision: store.checkFileCollision,
  moveNodeFile: store.moveNodeFile,
  markProgrammaticMove: store.markProgrammaticMove,
  getVaultPath: store.getVaultPath,
  showCollisionDialog: showFileMoveCollisionDialog,
})
const { draggingNode, onNodePointerDown } = nodeDragging

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
  totalEdgeCount: computed(() => store.filteredEdges.length),
  visibleNodeIds,
  hoveredNodeId,
  selectedNodeIds: computed(() => store.selectedNodeIds),
  selectedEdge,
  highlightedEdgeIds,
  highlightAllEdges,
  edgeHideThreshold,
  hideWikilinkEdges,
  hideStorylineEdges,
  edgeStrokeWidth,
  highlightColor,
  selectedColor,
  getEdgeColor,
  getEdgeHighlightColor,
  getNode: store.getNode,
})

// Color operations composable - node and frame color updates
const { updateSelectedNodesColor, updateSelectedFrameColor } = useColorOperations({
  store: {
    getNode: store.getNode,
    get selectedNodeIds() { return store.selectedNodeIds },
    get selectedFrameId() { return store.selectedFrameId },
    updateNodeColor: store.updateNodeColor,
    updateFrameColor: store.updateFrameColor,
  },
  pushColorUndo,
})

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

// Selection actions composable - select all and delete
const { selectAllNodes, deleteSelectedNodes } = useSelectionActions({
  store: {
    getNode: store.getNode,
    get selectedNodeIds() { return store.selectedNodeIds },
    set selectedNodeIds(ids) { store.selectedNodeIds.splice(0, store.selectedNodeIds.length, ...ids) },
    get filteredEdges() { return store.filteredEdges },
    deleteNodes: store.deleteNodes,
  },
  displayNodes,
  pushDeletionUndo,
})

// Node styling composable - handles node background and style computation
const nodeStyle = useCanvasNodeStyle({
  scale,
  offsetX,
  offsetY,
  resizingNode,
  resizePreview,
  nodeZOrder,
  nodeBorderWidth,
  isSemanticZoomCollapsed,
  selectedNodeIds: computed(() => store.selectedNodeIds),
  currentTheme,
})
const { getNodeStyle } = nodeStyle

// Canvas event handlers composable - handles content clicks, editing, context menus
const eventHandlers = useCanvasEventHandlers({
  editingNodeId,
  editContent,
  showNodeSearch,
  closeNodeSearch,
  openNodeSearch,
  updateNodeContent: store.updateNodeContent,
  getNode: store.getNode,
  renderMermaidDiagrams,
  fitNodeToContent,
  navigateToNode,
  openExternal,
  screenToCanvas,
  snapToGrid,
  createNode: store.createNode,
  lastDragEndTime: () => lastDragEndTime,
  contextMenu: {
    open: contextMenu.open,
    close: contextMenu.close,
  },
  suppressPreviewPanel,
  getSelectedNodeIds: () => store.selectedNodeIds,
  selectNode: store.selectNode,
})
const {
  handleContentClick,
  saveEditing,
  onEditorKeydown,
  onCanvasDoubleClick,
  onContextMenu,
  closeContextMenu,
  onLODNodeContextMenu,
  onLODCanvasContextMenu,
} = eventHandlers

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
  getAffectedNodeIds: () => contextMenu.affectedNodeIds.value,
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

// Helper to open search on a node (works in both view and edit modes)
function startEditingAndSearch(nodeId: string) {
  // If not already editing this node, open search in view mode
  // (no need to switch to edit mode first)
  openNodeSearch(nodeId)
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
  fitSelectedFrameToContents,
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

// MCP Viewport interface methods
function focusNode(nodeId: string) {
  const node = store.getNode(nodeId)
  if (!node) return

  const rect = canvasRef.value?.getBoundingClientRect()
  if (!rect) return

  // Calculate center of viewport in canvas coordinates
  const nodeWidth = node.width || NODE_DEFAULTS.WIDTH
  const nodeHeight = node.height || NODE_DEFAULTS.HEIGHT
  const nodeCenterX = node.canvas_x + nodeWidth / 2
  const nodeCenterY = node.canvas_y + nodeHeight / 2

  // Set offset to center the node in the viewport
  offsetX.value = rect.width / 2 - nodeCenterX * scale.value
  offsetY.value = rect.height / 2 - nodeCenterY * scale.value

  // Select the node
  store.selectNode(nodeId)
}

function getViewport() {
  return {
    x: -offsetX.value / scale.value,
    y: -offsetY.value / scale.value,
    zoom: scale.value,
  }
}

// Expose methods for parent component (MCP integration)
defineExpose({
  focusNode,
  getViewport,
})
</script>

<template>
  <div class="canvas-wrapper">
    <!-- Graph-level LLM prompt bar -->
    <CanvasLLMBar
      v-if="showLLMBar"
      :graph-prompt="graphPrompt"
      :is-loading="isGraphLLMLoading"
      :is-running="agentRunning"
      :conversation-history="conversationHistory"
      :agent-tasks="agentTasks"
      :agent-log="agentLog"
      :show-log="showAgentLogPanel"
      :selected-count="store.selectedNodeIds.length"
      @update:graph-prompt="graphPrompt = $event"
      @send="sendGraphPrompt"
      @stop="stopAgent"
      @clear-conversation="clearConversation"
      @prompt-keydown="onPromptKeydown"
      @clear-log="agentLog.length = 0"
    />

    <!-- Standalone agent log panel (when LLM bar is hidden) -->
    <CanvasAgentLogPanel
      v-if="!showLLMBar && showAgentLogPanel && agentLog.length > 0"
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
        :colors-in-use="colorsInUse"
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
        @node-dblclick="handleNodeDoubleClick"
        @node-contextmenu="onLODNodeContextMenu"
        @canvas-contextmenu="onLODCanvasContextMenu"
        @canvas-dblclick="onCanvasDoubleClick"
      />

      <div class="canvas-content" :style="{ transform }">
        <!-- Frames (rendered first, below edges) - hidden in neighborhood mode -->
        <CanvasFrames
          v-if="!neighborhoodMode"
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
          :edge-label-size="edgeLabelSize"
          :zoom="scale"
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
          :is-text-hidden="isTextHidden"
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
          :show-node-search="showNodeSearch && searchNodeId === node.id"
          :node-search-query="nodeSearchQuery"
          :node-search-match-count="nodeSearchMatches.length"
          :node-search-index="nodeSearchIndex"
          :linked-entities="getLinkedEntities(node.id)"
          :spellcheck-enabled="displayStore.spellcheckEnabled"
          @pointerdown="onNodePointerDown($event, node.id)"
          @pointerenter="onNodePointerEnter($event, node.id)"
          @pointermove="onNodePointerMove($event)"
          @pointerleave="onNodePointerLeave"
          @dblclick="handleNodeDoubleClick(node.id)"
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

      <!-- Edge edit panel -->
      <CanvasEdgePanel
        :selected-edge="selectedEdge"
        :edges="store.filteredEdges"
        :edge-color-palette="edgeColorPalette"
        :get-edge-color="getEdgeColor"
        :is-edge-directed="isEdgeDirected"
        @close="selectedEdge = null"
        @change-label="changeEdgeLabel"
        @save-label="onEdgeLabelSave"
        @change-color="changeEdgeColor"
        @reverse="reverseEdge"
        @make-non-directional="makeNonDirectional"
        @make-directional="makeDirectional"
        @insert-node="insertNodeOnEdge"
        @delete="deleteSelectedEdge"
      />

      <!-- Node Preview Panel (shown when zoomed out and node selected, hide during drag) -->
      <CanvasPreviewPanel
        :visible="showPreviewPanel && !!previewNode && !isDraggingRef"
        :title="previewNode?.title || ''"
        :content="previewContent"
        :raw-content="previewNode?.markdown_content || ''"
        :node-id="previewNode?.id || ''"
        :connected-nodes="previewConnectedNodes"
        @close="closePreviewPanel"
        @zoom-to-node="zoomToPreviewNode"
        @open-fullscreen="previewNode && openFullscreenNode(previewNode.id)"
        @save="savePreviewContent"
        @save-title="savePreviewTitle"
        @render-mermaid="renderMermaidDiagrams"
        @content-updated="savePreviewContent"
        @navigate-to-node="handlePreviewNavigateToNode"
      />

      <!-- Controls -->
      <CanvasControls
        :scale="scale"
        :grid-lock-enabled="gridLockEnabled"
        :is-large-graph="isLargeGraph"
        :global-edge-style="globalEdgeStyle"
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
        @toggle-neighborhood-mode="toggleNeighborhoodMode()"
        @set-neighborhood-depth="setDepth"
        @create-frame="createFrameAtCenter"
        @show-help="showHelpModal = true"
        @toggle-highlight-edges="highlightAllEdges = !highlightAllEdges"
        @toggle-bubble-mode="toggleBubbleMode"
      />

      <!-- Help Modal -->
      <KeyboardShortcutsModal :show="showHelpModal" @close="showHelpModal = false" />

      <!-- Fullscreen Node Modal -->
      <FullscreenNodeModal
        :node-id="fullscreenNodeId"
        :visible="showFullscreenModal"
        @close="closeFullscreenNode"
        @zoom-to-node="(id) => { closeFullscreenNode(); zoomToNode(id, 1) }"
        @render-mermaid="renderMermaidDiagrams"
        @navigate-to-node="handleNavigateToNode"
      />

      <!-- File Move Collision Dialog -->
      <FileMoveCollisionDialog
        v-if="showCollisionDialog && collisionDialogData"
        :source-file-name="collisionDialogData.sourceFileName"
        :target-folder="collisionDialogData.targetFolder"
        :existing-file-name="collisionDialogData.existingFileName"
        @resolve="handleCollisionDialogResolve"
      />

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

      <!-- Hover tooltip (when zoomed out, hide during drag) -->
      <CanvasHoverTooltip
        :visible="showHoverTooltip && !isDraggingRef"
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
        @delete-nodes="deleteSelectedNodes(contextMenu.affectedNodeIds.value)"
        @add-to-storyline="addNodeToStoryline"
        @create-storyline="createStorylineFromNode"
        @move-to-workspace="moveNodesToWorkspace"
        @link-to-entity="linkToEntity"
        @create-entity="handleCreateEntity"
        @fetch-citations="handleFetchCitations()"
        @fetch-references="handleFetchReferences()"
        @fetch-both="handleFetchBoth()"
        @add-to-zotero="handleAddToZotero()"
        @update:storyline-submenu="contextMenuStorylineSubmenu = $event"
        @update:workspace-submenu="contextMenuWorkspaceSubmenu = $event"
        @update:entity-submenu="contextMenuEntitySubmenu = $event"
      />

      <!-- Citation fetch progress indicator -->
      <CanvasCitationProgress
        :visible="isFetchingCitations"
        :fetch-progress="fetchProgress"
        :queue-size="queueSize"
        :wait-status="waitStatus"
        @cancel="citationFetch.cancelFetch()"
      />

      <!-- Zotero add progress indicator -->
      <CanvasZoteroProgress
        :visible="!!zotero.addToZoteroProgress.value"
        :progress="zotero.addToZoteroProgress.value"
        @cancel="zotero.cancelAddToZotero()"
      />

      <!-- Link to picker modal -->
      <CanvasLinkPickerModal
        :visible="showLinkPicker"
        :exclude-node-ids="linkPickerSourceNodeId ? [linkPickerSourceNodeId] : []"
        @select="linkToNode"
        @close="closeLinkPicker"
      />

      <!-- Empty state overlay -->
      <CanvasEmptyState :visible="store.filteredNodes.length === 0" />

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
