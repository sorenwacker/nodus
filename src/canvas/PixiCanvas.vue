<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, nextTick, inject } from 'vue'
import { useI18n } from 'vue-i18n'
import { useNodesStore } from '../stores/nodes'
import { useThemesStore } from '../stores/themes'
// marked is imported in useContentRenderer composable
import { openExternal } from '../lib/tauri'
import { writeText as writeClipboard } from '@tauri-apps/plugin-clipboard-manager'
import {
  routeAllEdges,
  optimizeNodeEntrypoints,
  assignPorts,
  calculatePortOffset,
  getSide,
  getPortPoint,
  getStandoff,
  getAngledStandoff,
  SpatialIndex,
  setRoutingSpatialIndex,
  type NodeRect,
  type EdgeStyle,
} from './edgeRouting'
import { useLLM, executeTool, llmQueue, type ToolContext } from './llm'
import { uiStorage, llmStorage, canvasStorage, memoryStorage } from '../lib/storage'
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
const showToast = inject<(message: string, type: 'error' | 'success' | 'info') => void>('showToast')

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

  // Keyboard handler for Delete/Backspace
  const handleKeydown = (e: KeyboardEvent) => {
    // Escape cancels frame placement mode
    if (e.key === 'Escape' && frames.pendingFramePlacement.value) {
      e.preventDefault()
      cancelFramePlacement()
      return
    }

    // Cmd+E exports graph as YAML (works even in inputs)
    if ((e.key === 'e' || e.key === 'E') && (e.metaKey || e.ctrlKey) && !e.shiftKey) {
      e.preventDefault()
      exportGraphAsYaml()
      return
    }

    // Skip other shortcuts if user is typing in an input
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

    // Cmd+C / Ctrl+C copies selected nodes as JSON
    if ((e.key === 'c' || e.key === 'C') && (e.metaKey || e.ctrlKey) && !e.shiftKey) {
      console.log('[KEYDOWN] Cmd+C detected, selected nodes:', store.selectedNodeIds.length)
      if (store.selectedNodeIds.length > 0) {
        e.preventDefault()
        copySelectedNodes()
      }
    }

    // Cmd+V / Ctrl+V pastes nodes from clipboard
    if ((e.key === 'v' || e.key === 'V') && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      pasteNodes()
    }

    // Ctrl+Shift+R refreshes workspace from files
    if ((e.key === 'R' || e.key === 'r') && e.ctrlKey && e.shiftKey) {
      e.preventDefault()
      refreshFromFiles()
    }

    // Cmd+Plus / Cmd+= increases font scale
    if ((e.key === '+' || e.key === '=') && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      increaseFontScale()
    }

    // Cmd+Minus decreases font scale
    if (e.key === '-' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      decreaseFontScale()
    }

    // Cmd+0 resets font scale
    if (e.key === '0' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      fontScale.value = 1.0
      uiStorage.setFontScale(1.0)
      document.documentElement.style.setProperty('--font-scale', '1')
    }
  }
  window.addEventListener('keydown', handleKeydown)

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
    window.removeEventListener('keydown', handleKeydown)
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

// screenToCanvas is provided by useViewState composable

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
// Note: startEditing, saveEditing, onEditorKeydown have local implementations with extra logic (auto-fit, mermaid render)
const { editingNodeId, editContent, editingTitleId, editTitle, startEditingTitle, saveTitleEditing, cancelTitleEditing } = nodeEditor

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

// Graph size thresholds - use displayNodes count so neighborhood mode gets proper routing
// In neighborhood mode, always use full routing since we have few nodes
const isLargeGraph = computed(() => !neighborhoodMode.value && (displayNodes.value.length > 200 || store.filteredEdges.length > 500))
const isHugeGraph = computed(() => !neighborhoodMode.value && displayNodes.value.length > 350)
const isMassiveGraph = computed(() => !neighborhoodMode.value && (displayNodes.value.length > 300 || store.filteredEdges.length > 800))

// Semantic zoom collapse - hide content for massive graphs when zoomed out
const isSemanticZoomCollapsed = computed(() => isMassiveGraph.value && scale.value < 0.6)

// LOD (Level of Detail) mode - render nodes as circles when many visible in viewport
const LOD_THRESHOLD = 500
const isLODMode = computed(() => visibleNodes.value.length > LOD_THRESHOLD)

// Node degree (edge count) for LOD circle sizing
const nodeDegree = computed(() => {
  const degree: Record<string, number> = {}
  for (const node of store.filteredNodes) {
    degree[node.id] = 0
  }
  for (const edge of store.filteredEdges) {
    if (degree[edge.source_node_id] !== undefined) degree[edge.source_node_id]++
    if (degree[edge.target_node_id] !== undefined) degree[edge.target_node_id]++
  }
  return degree
})

// Calculate LOD circle radius based on degree (min 8px, max 40px)
function getLODRadius(nodeId: string): number {
  const deg = nodeDegree.value[nodeId] || 0
  // Log scale for better distribution: radius = 8 + log2(degree + 1) * 6
  return Math.min(40, 8 + Math.log2(deg + 1) * 6)
}

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

// Help modal
const showHelpModal = ref(false)

// Font scale (Cmd+/Cmd-)
const fontScale = ref(uiStorage.getFontScale())
const MIN_FONT_SCALE = 0.7
const MAX_FONT_SCALE = 1.5

function increaseFontScale() {
  fontScale.value = Math.min(MAX_FONT_SCALE, fontScale.value + 0.1)
  uiStorage.setFontScale(fontScale.value)
  document.documentElement.style.setProperty('--font-scale', String(fontScale.value))
}

function decreaseFontScale() {
  fontScale.value = Math.max(MIN_FONT_SCALE, fontScale.value - 0.1)
  uiStorage.setFontScale(fontScale.value)
  document.documentElement.style.setProperty('--font-scale', String(fontScale.value))
}

// Initialize font scale on mount
onMounted(() => {
  document.documentElement.style.setProperty('--font-scale', String(fontScale.value))
})

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

// Interaction state
const draggingNode = ref<string | null>(null)
const dragStart = ref({ x: 0, y: 0, nodeX: 0, nodeY: 0 })
const multiDragInitial = ref<Map<string, { x: number; y: number }>>(new Map())
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
  if (!result.startsWith('__UNHANDLED__:')) {
    return result
  }
  console.log(`[Tool] ${name} falling through to switch`)

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

    case 'create_theme': {
      // Parse args if it's a string
      let parsedArgs = args
      if (typeof args === 'string') {
        try { parsedArgs = JSON.parse(args) } catch { parsedArgs = {} }
      }
      const themeName = parsedArgs.name || 'custom-theme'
      const description = parsedArgs.description || ''
      agentLog.value.push(`> Creating theme: ${themeName}`)
      console.log('[Theme] CASE HIT - Creating theme:', themeName, description, 'raw args:', args)

      try {
        // Generate theme YAML using LLM
        const prompt = `Create a YAML theme configuration based on this description: "${description}"

The theme should have this structure:
name: "${themeName}"
display_name: "${themeName.split('-').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}"
description: "${description}"
is_dark: false (or true if it's a dark theme)
variables:
  bg_canvas: "#hex"
  bg_surface: "#hex"
  bg_surface_alt: "#hex"
  bg_elevated: "#hex"
  text_main: "#hex"
  text_secondary: "#hex"
  text_muted: "#hex"
  border_default: "#hex"
  border_subtle: "#hex"
  primary_color: "#hex"
  danger_color: "#hex"
  danger_bg: "#hex"
  danger_border: "#hex"
  dot_color: "#hex"
  shadow_sm: "rgba(...)"
  shadow_md: "rgba(...)"

Make colors match the description. Be creative! Output ONLY the YAML, no explanations.`

        const yamlContent = await llmQueue.generate(prompt)
        console.log('[Theme] Generated YAML:', yamlContent?.slice(0, 200))
        if (!yamlContent) return 'Failed to generate theme'

        // Clean up YAML (remove markdown code blocks if present)
        let cleanYaml = yamlContent.trim()
        if (cleanYaml.startsWith('```')) {
          cleanYaml = cleanYaml.replace(/^```(yaml)?\n?/, '').replace(/\n?```$/, '')
        }
        console.log('[Theme] Clean YAML:', cleanYaml.slice(0, 200))

        // Create the theme
        console.log('[Theme] Calling createTheme...')
        const newTheme = await themesStore.createTheme({
          name: themeName,
          display_name: themeName.split('-').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
          yaml_content: cleanYaml,
        })
        console.log('[Theme] Created theme:', newTheme)
        console.log('[Theme] Themes in store:', themesStore.themes.length)

        // Apply the new theme
        themesStore.setTheme(newTheme.name)
        return `Created and applied theme "${themeName}"`
      } catch (e) {
        console.error('[Theme] Error creating theme:', e)
        return `Failed to create theme: ${e}`
      }
    }

    case 'update_theme': {
      let parsedArgs = args
      if (typeof args === 'string') {
        try { parsedArgs = JSON.parse(args) } catch { parsedArgs = {} }
      }
      const themeName = parsedArgs.name || ''
      const changes = parsedArgs.changes || ''
      if (!themeName) return 'Theme name required'
      agentLog.value.push(`> Updating theme: ${themeName}`)

      try {
        // Find the theme
        const theme = themesStore.themes.find(t => t.name === themeName)
        if (!theme) return `Theme "${themeName}" not found`
        if (theme.is_builtin === 1) return 'Cannot modify built-in themes'

        // Generate updated YAML using LLM
        const prompt = `Update this theme YAML based on the instruction: "${changes}"

Current theme YAML:
${theme.yaml_content}

Apply the changes and output the complete updated YAML. Output ONLY the YAML, no explanations.`

        const yamlContent = await llmQueue.generate(prompt)
        if (!yamlContent) return 'Failed to generate updated theme'

        // Clean up YAML
        let cleanYaml = yamlContent.trim()
        if (cleanYaml.startsWith('```')) {
          cleanYaml = cleanYaml.replace(/^```(yaml)?\n?/, '').replace(/\n?```$/, '')
        }

        // Update the theme
        await themesStore.updateTheme({
          id: theme.id,
          yaml_content: cleanYaml,
          display_name: theme.display_name,
        })

        return `Updated theme "${themeName}"`
      } catch (e) {
        return `Failed to update theme: ${e}`
      }
    }

    case 'apply_theme': {
      let parsedArgs = args
      if (typeof args === 'string') {
        try { parsedArgs = JSON.parse(args) } catch { parsedArgs = {} }
      }
      const themeName = parsedArgs.name || ''
      if (!themeName) return 'Theme name required'

      const theme = themesStore.themes.find(t => t.name === themeName)
      if (!theme) return `Theme "${themeName}" not found. Available: ${themesStore.themes.map(t => t.name).join(', ')}`

      themesStore.setTheme(themeName)
      return `Applied theme "${themeName}"`
    }

    case 'list_themes': {
      const builtin = themesStore.builtinThemes.map(t => t.name)
      const custom = themesStore.customThemes.map(t => t.name)
      return `Built-in themes: ${builtin.join(', ')}\nCustom themes: ${custom.length > 0 ? custom.join(', ') : '(none)'}\nCurrent: ${themesStore.currentThemeName}`
    }

    case 'plan': {
      let parsedArgs = args
      if (typeof args === 'string') {
        try { parsedArgs = JSON.parse(args) } catch { parsedArgs = {} }
      }
      const tasks = parsedArgs.tasks || []
      if (!Array.isArray(tasks) || tasks.length === 0) return 'No tasks provided'

      // Clear previous tasks and set new ones
      agentTasks.value = tasks.map((t: string, i: number) => ({
        id: `task-${i}`,
        description: t,
        status: 'pending' as const
      }))

      // Log the plan
      agentLog.value.push('--- PLAN ---')
      tasks.forEach((t: string, i: number) => {
        agentLog.value.push(`[ ] ${i + 1}. ${t}`)
      })
      agentLog.value.push('------------')

      return `Created plan with ${tasks.length} tasks`
    }

    case 'update_task': {
      let parsedArgs = args
      if (typeof args === 'string') {
        try { parsedArgs = JSON.parse(args) } catch { parsedArgs = {} }
      }
      const taskIndex = parsedArgs.task_index ?? -1
      const status = parsedArgs.status || 'done'

      if (taskIndex < 0 || taskIndex >= agentTasks.value.length) {
        return `Invalid task index: ${taskIndex}`
      }

      const task = agentTasks.value[taskIndex]
      const oldStatus = task.status
      task.status = status === 'done' ? 'done' : status === 'failed' ? 'error' : 'running'

      // Update log with status
      const statusIcon = status === 'done' ? '[x]' : status === 'failed' ? '[!]' : '[>]'
      agentLog.value.push(`${statusIcon} Task ${taskIndex + 1}: ${task.description} -> ${status}`)

      return `Task ${taskIndex + 1} updated: ${oldStatus} -> ${status}`
    }

    case 'remember': {
      let parsedArgs = args
      if (typeof args === 'string') {
        try { parsedArgs = JSON.parse(args) } catch { parsedArgs = {} }
      }
      const message = parsedArgs.message || ''
      if (!message) return 'Nothing to remember'

      // Store in per-workspace memory
      const workspaceId = store.currentWorkspaceId || 'default'
      memoryStorage.addMemory(workspaceId, message)

      agentLog.value.push(`[memory] ${message}`)
      return `Remembered for this workspace: ${message}`
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
        hitX1: x1, hitY1: y1, hitX2: x2, hitY2: y2,
        link_type: edge.link_type,
        label: edge.label,
        isBidirectional: false,
        isShortEdge: Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2) < 50,
        debugInfo: undefined,
      }
    }).filter((e): e is NonNullable<typeof e> => e !== null)
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
  // Exception: storyline edges are never deduplicated (they have storyline_id)
  const seenPairs = new Set<string>()
  edges = edges.filter(e => {
    // Storyline edges are always kept - they need to show even if another edge exists
    if (e.storyline_id) return true
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

  // Use batch routing for all edge styles
  // The routing modules handle grid tracking, obstacle avoidance, and path generation
  const effectiveStyle: EdgeStyle = style
  let routedEdges: Map<string, { svgPath: string; strokeWidth?: number; path?: Array<{x: number; y: number}>; debugInfo?: { srcOffset: number; tgtOffset: number; srcSide: string; tgtSide: string } }> | null = null

  // Build spatial index for fast obstacle detection (O(log n) instead of O(n))
  const spatialIndex = new SpatialIndex()
  spatialIndex.build(nodeMap)
  setRoutingSpatialIndex(spatialIndex)

  try {
    routedEdges = routeAllEdges(edgeDefs, nodeRects, nodeMap, effectiveStyle)
  } finally {
    // Clear spatial index after routing
    setRoutingSpatialIndex(null)
  }

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
    // Pre-routed paths for diagonal/orthogonal/straight, manual routing for curved
    let path = ''
    const routed = routedEdges?.get(edge.id)

    // For huge graphs (400+ nodes), use simple straight lines for performance
    if (isHugeGraph.value) {
      path = `M${startPort.x},${startPort.y} L${endEdge.x},${endEdge.y}`
    } else if (routed?.svgPath) {
      // Use pre-routed path from routing modules (diagonal or orthogonal)
      path = routed.svgPath
    } else {
      // Fallback: simple line via standoff points
      path = `M${startPort.x},${startPort.y} L${startStandoff.x},${startStandoff.y} L${endStandoff.x},${endStandoff.y} L${endEdge.x},${endEdge.y}`
    }

    // Get stroke width from routing or default
    const strokeWidth = routed?.strokeWidth || 1.5

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
      strokeWidth,
      // Full extent for hit area (includes arrow)
      hitX1: startPort.x,
      hitY1: startPort.y,
      hitX2: endPort.x,
      hitY2: endPort.y,
      link_type: edge.link_type,
      color: edge.color,
      label: edge.label,
      isBidirectional,
      isShortEdge,
      // Debug: port offset info
      debugInfo: routed?.debugInfo,
    }
  }).filter(Boolean)
})

// Threshold for "edges on hover only" mode (based on visible edges, not total)
const EDGE_HOVER_ONLY_THRESHOLD = 500

// Threshold for filtering edges by viewport visibility
const EDGE_VIEWPORT_FILTER_THRESHOLD = 200

// Visible edges - filtered for large graphs with pre-computed rendering properties
const visibleEdgeLines = computed(() => {
  let edges = edgeLines.value
  const visIds = visibleNodeIds.value
  const hovered = hoveredNodeId.value
  const selectedNodes = store.selectedNodeIds

  // For small graphs, show all edges regardless of viewport visibility
  // Only filter by viewport for larger graphs to improve performance
  if (edges.length > EDGE_VIEWPORT_FILTER_THRESHOLD) {
    // Filter to edges that should be rendered:
    // 1. Edges connected to hovered/selected nodes (always show, even if other endpoint is off-screen)
    // 2. Edges where BOTH endpoints are visible
    edges = edges.filter(e => {
      const connectedToActive = hovered === e.source_node_id || hovered === e.target_node_id ||
        selectedNodes.includes(e.source_node_id) || selectedNodes.includes(e.target_node_id)
      if (connectedToActive) return true
      return visIds.has(e.source_node_id) && visIds.has(e.target_node_id)
    })
  }

  // Build neighbor set for 2-hop edge display
  // Neighbors are nodes directly connected to hovered/selected nodes
  const neighborIds = new Set<string>()
  if (hovered || selectedNodes.length > 0) {
    for (const e of edges) {
      if (e.source_node_id === hovered || selectedNodes.includes(e.source_node_id)) {
        neighborIds.add(e.target_node_id)
      }
      if (e.target_node_id === hovered || selectedNodes.includes(e.target_node_id)) {
        neighborIds.add(e.source_node_id)
      }
    }
  }

  // For very large visible edge counts (500+), only show edges on hover/select
  // Also include neighbor's edges (2nd hop) for context
  if (edges.length > EDGE_HOVER_ONLY_THRESHOLD) {
    if (hovered || selectedNodes.length > 0) {
      edges = edges.filter(e => {
        // Direct edges to hovered/selected nodes
        const isDirect = e.source_node_id === hovered || e.target_node_id === hovered ||
          selectedNodes.includes(e.source_node_id) || selectedNodes.includes(e.target_node_id)
        if (isDirect) return true
        // 2nd hop: edges where at least one endpoint is a neighbor
        return neighborIds.has(e.source_node_id) || neighborIds.has(e.target_node_id)
      })
    } else {
      edges = []
    }
  }

  // Pre-compute rendering properties to avoid repeated function calls in template
  const highlighted = highlightedEdgeIds.value
  const selected = selectedEdge.value
  const baseStrokeWidth = edgeStrokeWidth.value

  return edges.map(e => {
    const isHighlighted = highlighted.has(e.id)
    const isSelected = selected === e.id

    // Determine if this is a direct edge or a 2nd-hop neighbor edge
    const isDirect = e.source_node_id === hovered || e.target_node_id === hovered ||
      selectedNodes.includes(e.source_node_id) || selectedNodes.includes(e.target_node_id)
    const isNeighborEdge = !isDirect && (neighborIds.has(e.source_node_id) || neighborIds.has(e.target_node_id))

    // Opacity: direct edges are full, neighbor edges are transparent
    const opacity = isNeighborEdge ? 0.25 : 1.0

    // Use explicit color field first, then link_type as fallback, then default
    const color = (e.color && e.color.startsWith('#')) ? e.color
      : (e.link_type?.startsWith('#') ? e.link_type : defaultEdgeColor.value)
    const effectiveStrokeWidth = baseStrokeWidth
    // Use multiplier for highlight to scale properly with zoom
    const renderStrokeWidth = isSelected || isHighlighted ? effectiveStrokeWidth * 2 : effectiveStrokeWidth

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
      isNeighborEdge,
      opacity,
      color,
      edgeHighlightColor,
      renderStrokeWidth,
      glowStrokeWidth: effectiveStrokeWidth * 4,
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
    startZooming()

    const zoomIntensity = 0.003
    const delta = Math.exp(-e.deltaY * zoomIntensity)
    const newScale = Math.min(Math.max(scale.value * delta, 0.05), 3)
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

// Node dragging
function onNodeMouseDown(e: MouseEvent, nodeId: string) {
  e.stopPropagation()

  // Prevent text selection on shift+click or alt+click
  if (e.shiftKey || e.altKey) {
    e.preventDefault()
  }

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
  document.body.classList.add('node-dragging')

  // If node is already selected, don't change selection (allows multi-drag)
  // Only select if not already selected
  if (!store.selectedNodeIds.includes(nodeId)) {
    store.selectNode(nodeId, e.shiftKey || e.metaKey)
  }
  selectedEdge.value = null

  // Log clicked node info for debugging port assignments
  const clickedNode = store.getNode(nodeId)
  const nodeEdges = store.filteredEdges.filter(e => e.source_node_id === nodeId || e.target_node_id === nodeId)
  console.log(`[Click] "${clickedNode?.title}" - ${nodeEdges.length} edges`)

  // Optimize entry points for this node (wrapped in try-catch to not break click handling)
  try {
    const optNodeMap = new Map<string, NodeRect>()
    for (const n of store.filteredNodes) {
      optNodeMap.set(n.id, {
        id: n.id,
        canvas_x: n.canvas_x,
        canvas_y: n.canvas_y,
        width: n.width || NODE_DEFAULTS.WIDTH,
        height: n.height || NODE_DEFAULTS.HEIGHT,
      })
    }
    const edgeDefs = store.filteredEdges.map(edge => ({
      id: edge.id,
      source_node_id: edge.source_node_id,
      target_node_id: edge.target_node_id,
    }))
    optimizeNodeEntrypoints(nodeId, edgeDefs, optNodeMap)
  } catch (err) {
    console.error('[optimizeNodeEntrypoints] Error:', err)
  }

  // Trigger edge re-routing
  store.nodeLayoutVersion++

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

function stopNodeDrag(e: MouseEvent) {
  const draggedNodeId = draggingNode.value
  const draggedNodeIds = multiDragInitial.value.size > 0
    ? [...multiDragInitial.value.keys()]
    : (draggedNodeId ? [draggedNodeId] : [])

  // Check if drag ended over storyline panel
  const storylinePanel = document.querySelector('.storyline-panel')
  let droppedOnStoryline = false
  if (storylinePanel && draggedNodeIds.length > 0) {
    const rect = storylinePanel.getBoundingClientRect()
    if (e.clientX >= rect.left && e.clientX <= rect.right &&
        e.clientY >= rect.top && e.clientY <= rect.bottom) {
      droppedOnStoryline = true
      // Reset nodes to original positions (don't move them on canvas)
      if (multiDragInitial.value.size > 0) {
        for (const [id, initial] of multiDragInitial.value) {
          store.updateNodePosition(id, initial.x, initial.y)
        }
      } else if (draggedNodeId) {
        store.updateNodePosition(draggedNodeId, dragStart.value.nodeX, dragStart.value.nodeY)
      }
      // Emit event for storyline panel to handle
      window.dispatchEvent(new CustomEvent('node-dropped-on-storyline', {
        detail: { nodeIds: draggedNodeIds, x: e.clientX, y: e.clientY }
      }))
    }
  }

  // Push overlapping nodes away after drag (only if not dropped on storyline)
  // Skip in LOD mode - circles are small, pushing based on full node size doesn't make sense
  if (!droppedOnStoryline && !isLODMode.value) {
    if (multiDragInitial.value.size > 0) {
      for (const id of multiDragInitial.value.keys()) {
        pushOverlappingNodesAway(id)
      }
    } else if (draggingNode.value) {
      pushOverlappingNodesAway(draggingNode.value)
    }

    // Assign nodes to frame if dropped inside one
    for (const nodeId of draggedNodeIds) {
      const node = store.getNode(nodeId)
      if (!node) continue

      const nodeWidth = node.width || 200
      const nodeHeight = node.height || 120
      const nodeArea = nodeWidth * nodeHeight
      let assignedFrameId: string | null = null

      for (const frame of store.frames) {
        const overlapX = Math.max(0, Math.min(node.canvas_x + nodeWidth, frame.canvas_x + frame.width) - Math.max(node.canvas_x, frame.canvas_x))
        const overlapY = Math.max(0, Math.min(node.canvas_y + nodeHeight, frame.canvas_y + frame.height) - Math.max(node.canvas_y, frame.canvas_y))
        const overlapArea = overlapX * overlapY

        if (overlapArea > nodeArea * 0.5) {
          assignedFrameId = frame.id
          break
        }
      }

      // Update frame assignment (null removes from frame)
      if (node.frame_id !== assignedFrameId) {
        store.assignNodesToFrame([nodeId], assignedFrameId)
      }
    }
  }

  draggingNode.value = null
  multiDragInitial.value.clear()
  lastDragEndTime = Date.now()
  document.body.classList.remove('node-dragging')
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
    for (const [id] of multiResizeInitial.value) {
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
      for (const [id] of multiResizeInitial.value) {
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
  // Already editing this node - don't reset content (preserves unsaved edits)
  if (editingNodeId.value === nodeId) {
    return
  }
  // Save any current editing first
  if (editingNodeId.value) {
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
// Avoids using light colors in light mode (would be invisible)
function getEdgeHighlightColor(nodeColor: string | null): string {
  if (!nodeColor) return highlightColor.value
  if (currentTheme.value === 'cyber' && cyberHighlightColors[nodeColor]) {
    return cyberHighlightColors[nodeColor]
  }
  // For non-cyber themes, check if the node color is too light for visibility
  // Skip white and very light colors in light mode
  if (currentTheme.value !== 'dark' && currentTheme.value !== 'pitch-black') {
    const hex = nodeColor.replace('#', '')
    const r = parseInt(hex.substr(0, 2), 16)
    const g = parseInt(hex.substr(2, 2), 16)
    const b = parseInt(hex.substr(4, 2), 16)
    const brightness = (r * 299 + g * 587 + b * 114) / 1000
    // If color is too bright (>200), use the default highlight color instead
    if (brightness > 200) {
      return highlightColor.value
    }
  }
  return nodeColor
}

// Edge style types
type EdgeStyleType = 'orthogonal' | 'diagonal' | 'curved' | 'hyperbolic' | 'straight'
const edgeStyles: { value: EdgeStyleType; label: string }[] = [
  { value: 'orthogonal', label: '⌐' },
  { value: 'diagonal', label: '∠' },
  { value: 'curved', label: '∿' },
  { value: 'hyperbolic', label: '∼' },
  { value: 'straight', label: '/' },
]

// Store edge styles (edgeId -> style)
const edgeStyleMap = ref<Record<string, string>>({})
const globalEdgeStyle = ref<EdgeStyleType>(canvasStorage.getEdgeStyle())

function toggleMagnifier() {
  magnifierEnabled.value = !magnifierEnabled.value
  uiStorage.setMagnifierEnabled(magnifierEnabled.value)
}

function cycleEdgeStyle() {
  const styles: EdgeStyleType[] = ['orthogonal', 'diagonal', 'curved', 'hyperbolic', 'straight']
  const idx = styles.indexOf(globalEdgeStyle.value)
  globalEdgeStyle.value = styles[(idx + 1) % styles.length]
  canvasStorage.setEdgeStyle(globalEdgeStyle.value)
}

function getEdgeStyle(edgeId: string): string {
  return edgeStyleMap.value[edgeId] || 'diagonal'
}

function setEdgeStyle(style: string) {
  if (selectedEdge.value) {
    edgeStyleMap.value[selectedEdge.value] = style
  }
}

function getEdgeColor(edge: { link_type: string; color?: string | null; debugInfo?: { srcOffset: number } }): string {
  // Prefer explicit color field, then check link_type, then default to gray
  if (edge.color && edge.color.startsWith('#')) return edge.color
  if (edge.link_type && edge.link_type.startsWith('#')) return edge.link_type
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

// Node colors for the color picker (transparent tints layered over solid bg)
const defaultNodeColors = [
  { value: null, display: null },
  { value: 'rgba(239, 68, 68, 0.08)', display: '#fecaca' }, // red
  { value: 'rgba(249, 115, 22, 0.08)', display: '#fed7aa' }, // orange
  { value: 'rgba(234, 179, 8, 0.08)', display: '#fef08a' }, // yellow
  { value: 'rgba(34, 197, 94, 0.08)', display: '#bbf7d0' }, // green
  { value: 'rgba(59, 130, 246, 0.08)', display: '#bfdbfe' }, // blue
  { value: 'rgba(168, 85, 247, 0.08)', display: '#e9d5ff' }, // purple
  { value: 'rgba(236, 72, 153, 0.08)', display: '#fbcfe8' }, // pink
]

const cyberNodeColors = [
  { value: null, display: null },
  { value: '#4d1f30', display: '#ff3366' }, // neon red (dark bg)
  { value: '#4d3300', display: '#ffaa00' }, // neon orange
  { value: '#4d4d00', display: '#ffff00' }, // neon yellow
  { value: '#004d20', display: '#00ff66' }, // neon green
  { value: '#003d4d', display: '#00ccff' }, // neon blue
  { value: '#2e194d', display: '#9933ff' }, // neon purple
  { value: '#4d004d', display: '#ff00ff' }, // neon magenta
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

async function addNodeToStoryline(storylineId: string) {
  if (!contextMenuNodeId.value) return

  // Get all nodes to add (selected nodes if multi-select, otherwise just the context menu node)
  const nodeIds = store.selectedNodeIds.length > 1 && store.selectedNodeIds.includes(contextMenuNodeId.value)
    ? [...store.selectedNodeIds]
    : [contextMenuNodeId.value]

  try {
    for (const nodeId of nodeIds) {
      await store.addNodeToStoryline(storylineId, nodeId)
    }
    showToast?.(`Added ${nodeIds.length} node(s) to storyline`, 'success')
    closeContextMenu()
  } catch (e) {
    console.error('Failed to add nodes to storyline:', e)
    showToast?.(`Failed to add: ${e}`, 'error')
  }
}

async function createStorylineFromNode() {
  if (!contextMenuNodeId.value) return

  // Get all nodes to add (selected nodes if multi-select, otherwise just the context menu node)
  const nodeIds = store.selectedNodeIds.length > 1 && store.selectedNodeIds.includes(contextMenuNodeId.value)
    ? [...store.selectedNodeIds]
    : [contextMenuNodeId.value]

  const firstNode = store.getNode(nodeIds[0])
  if (!firstNode) return

  try {
    const title = nodeIds.length > 1
      ? `Story: ${nodeIds.length} nodes`
      : `Story: ${firstNode.title}`
    const storyline = await store.createStoryline(title)
    for (const nodeId of nodeIds) {
      await store.addNodeToStoryline(storyline.id, nodeId)
    }
    showToast?.(`Created storyline with ${nodeIds.length} node(s)`, 'success')
    closeContextMenu()
  } catch (e) {
    console.error('Failed to create storyline:', e)
    showToast?.(`Failed: ${e}`, 'error')
  }
}

/// Computed: number of selected nodes for context menu display
const contextMenuNodeCount = computed(() => contextMenu.nodeCount.value)

// Computed: workspaces other than the current one (for "Send to Workspace" menu)
const otherWorkspaces = computed(() => {
  return store.workspaces.filter(w => w.id !== store.currentWorkspaceId)
})

// Move selected nodes to a different workspace
async function moveNodesToWorkspace(workspaceId: string | null) {
  if (!contextMenuNodeId.value) return

  // Get all nodes to move (selected nodes if multi-select, otherwise just the context menu node)
  const nodeIds = store.selectedNodeIds.length > 1 && store.selectedNodeIds.includes(contextMenuNodeId.value)
    ? [...store.selectedNodeIds]
    : [contextMenuNodeId.value]

  try {
    await store.moveNodesToWorkspace(nodeIds, workspaceId)
    const targetName = workspaceId
      ? store.workspaces.find(w => w.id === workspaceId)?.name || 'workspace'
      : 'Default Workspace'
    showToast?.(`Moved ${nodeIds.length} node(s) to ${targetName}`, 'success')
    closeContextMenu()
  } catch (e) {
    console.error('Failed to move nodes:', e)
    showToast?.(`Failed: ${e}`, 'error')
  }
}

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
        <button class="clear-log-btn" :data-tooltip="t('canvas.agent.clearLog')" @click="agentLog.length = 0">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
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
      @zoom-out="scale = Math.max(scale * 0.8, 0.05)"
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
    </div>
  </div>
</template>

<style src="./PixiCanvas.css" scoped></style>
