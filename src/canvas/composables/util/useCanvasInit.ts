/**
 * Canvas initialization composable
 *
 * Handles onMounted setup including event listeners for zoom-to-node,
 * LLM config changes, radial z-order, storyline hover, and viewport resizing.
 */
import { ref, watch, onMounted, onUnmounted, nextTick, type Ref, type ComputedRef } from 'vue'

/**
 * Context for canvas initialization
 */
export interface UseCanvasInitContext {
  /** Ref to the canvas DOM element */
  canvasRef: Ref<HTMLElement | null>
  /** Viewport width ref to update */
  viewportWidth: Ref<number>
  /** Viewport height ref to update */
  viewportHeight: Ref<number>
  /** Whether we have saved view state (skip centering if true) */
  savedView: boolean
  /** Function to zoom to a specific node */
  zoomToNode: (nodeId: string, scale: number) => void
  /** Function to center the grid */
  centerGrid: () => void
  /** Function to fit view to content */
  fitToContent: () => void
  /** Function to refresh LLM configured state */
  refreshLLMConfigured: () => void
  /** Function to render mermaid diagrams */
  renderMermaidDiagrams: () => void
  /** Function to set external hover state */
  setExternalHover: (node: unknown | null) => void
  /** Function to open fullscreen node */
  openFullscreenNode: (nodeId: string) => void
  /** PDF drop composable setup function */
  pdfDropSetup: () => void
  /** PDF drop composable cleanup function */
  pdfDropCleanup: () => void
  /** Display store setup listener */
  displayStoreSetupListener: () => void
  /** Display store cleanup listener */
  displayStoreCleanupListener: () => void
  /** Setup content watchers for markdown/math/mermaid */
  setupContentWatchers: () => void
  /** LLM enabled ref */
  llmEnabled: Ref<boolean>
  /** Font scale ref */
  fontScale: ComputedRef<number>
  /** Node z-order map for radial layout */
  nodeZOrder: Ref<Map<string, number>>
  /** Neighborhood mode exit function */
  neighborhoodExit: () => void
  /** Filtered nodes count getter */
  getFilteredNodesLength: () => number
}

/**
 * Return type for useCanvasInit
 */
export interface UseCanvasInitReturn {
  /** Whether we've initially centered the view */
  hasInitiallyCentered: Ref<boolean>
}

/**
 * Composable for canvas initialization
 *
 * Sets up all the event listeners and initialization logic that runs
 * when the canvas component mounts, and cleans them up on unmount.
 */
export function useCanvasInit(ctx: UseCanvasInitContext): UseCanvasInitReturn {
  const hasInitiallyCentered = ref(false)

  onMounted(() => {
    // Setup display settings listener for reactive updates
    ctx.displayStoreSetupListener()

    // Setup content renderer watchers for markdown/math/mermaid
    ctx.setupContentWatchers()

    // Initialize font scale CSS variable
    document.documentElement.style.setProperty('--font-scale', String(ctx.fontScale.value))

    // Track viewport size for node culling
    const updateViewportSize = () => {
      const rect = ctx.canvasRef.value?.getBoundingClientRect()
      if (rect) {
        ctx.viewportWidth.value = rect.width
        ctx.viewportHeight.value = rect.height
      }
    }
    updateViewportSize()
    window.addEventListener('resize', updateViewportSize)

    // Listen for zoom-to-node events from search
    const handleZoomToNode = (e: Event) => {
      const nodeId = (e as CustomEvent).detail?.nodeId
      if (nodeId) ctx.zoomToNode(nodeId, 1)
    }
    window.addEventListener('zoom-to-node', handleZoomToNode)

    // Listen for LLM enabled setting changes
    const handleLLMEnabledChange = (e: Event) => {
      ctx.llmEnabled.value = (e as CustomEvent).detail
    }
    window.addEventListener('nodus-llm-enabled-change', handleLLMEnabledChange)

    // Listen for LLM config changes (provider or API key)
    const handleLLMConfigChange = () => {
      ctx.refreshLLMConfigured()
    }
    window.addEventListener('nodus-llm-config-change', handleLLMConfigChange)

    // Listen for radial layout z-order updates (angle-based stacking)
    const handleRadialZOrder = (e: Event) => {
      const order = (e as CustomEvent<string[]>).detail
      const zMap = new Map<string, number>()
      order.forEach((id, idx) => zMap.set(id, idx))
      ctx.nodeZOrder.value = zMap
    }
    window.addEventListener('nodus-radial-z-order', handleRadialZOrder)

    // Listen for storyline panel hover events
    const handleStorylineNodeHover = (e: Event) => {
      const node = (e as CustomEvent<{ node: unknown }>).detail?.node
      if (node) ctx.setExternalHover(node)
    }
    const handleStorylineNodeHoverEnd = () => {
      ctx.setExternalHover(null)
    }
    window.addEventListener('storyline-node-hover', handleStorylineNodeHover)
    window.addEventListener('storyline-node-hover-end', handleStorylineNodeHoverEnd)

    // Listen for open-node-detail events (from references sidebar)
    const handleOpenNodeDetail = (e: Event) => {
      const nodeId = (e as CustomEvent<{ nodeId: string }>).detail?.nodeId
      if (nodeId) ctx.openFullscreenNode(nodeId)
    }
    window.addEventListener('open-node-detail', handleOpenNodeDetail)

    // Setup PDF drop listener
    ctx.pdfDropSetup()

    onUnmounted(() => {
      window.removeEventListener('resize', updateViewportSize)
      window.removeEventListener('zoom-to-node', handleZoomToNode)
      window.removeEventListener('nodus-llm-enabled-change', handleLLMEnabledChange)
      window.removeEventListener('nodus-llm-config-change', handleLLMConfigChange)
      window.removeEventListener('nodus-radial-z-order', handleRadialZOrder)
      window.removeEventListener('storyline-node-hover', handleStorylineNodeHover)
      window.removeEventListener('storyline-node-hover-end', handleStorylineNodeHoverEnd)
      window.removeEventListener('open-node-detail', handleOpenNodeDetail)
      ctx.pdfDropCleanup()
      ctx.displayStoreCleanupListener()
    })

    // Only center if no saved view state
    if (!ctx.savedView) {
      ctx.centerGrid()
    }

    // Render mermaid diagrams after mount (delayed to ensure DOM is ready)
    setTimeout(() => ctx.renderMermaidDiagrams?.(), 500)
  })

  return {
    hasInitiallyCentered,
  }
}

/**
 * Context for workspace watch setup
 */
export interface UseWorkspaceWatchContext {
  /** Has initially centered ref */
  hasInitiallyCentered: Ref<boolean>
  /** Saved view flag */
  savedView: boolean
  /** Get filtered nodes length */
  getFilteredNodesLength: () => number
  /** Fit to content function */
  fitToContent: () => void
  /** Center grid function */
  centerGrid: () => void
  /** Render mermaid diagrams function */
  renderMermaidDiagrams: () => void
  /** Neighborhood exit function */
  neighborhoodExit: () => void
  /** Current workspace ID getter */
  getCurrentWorkspaceId: () => string | null
}

/**
 * Setup workspace-related watchers
 *
 * Watches for initial node load and workspace changes to center/fit view appropriately.
 */
export function useWorkspaceWatchers(
  ctx: UseWorkspaceWatchContext,
  filteredNodesLength: ComputedRef<number>,
  currentWorkspaceId: ComputedRef<string | null>
) {
  // Center view when nodes are first loaded, or center grid when empty
  watch(
    filteredNodesLength,
    (newLen, _oldLen) => {
      if (newLen > 0 && !ctx.hasInitiallyCentered.value) {
        ctx.hasInitiallyCentered.value = true
        // Always fit to content on initial load
        setTimeout(ctx.fitToContent, 50)
        // Render mermaid diagrams after initial load
        setTimeout(() => ctx.renderMermaidDiagrams?.(), 500)
      } else if (newLen === 0 && !ctx.savedView) {
        // Empty workspace - center the grid
        ctx.hasInitiallyCentered.value = false
        setTimeout(ctx.centerGrid, 50)
      }
    },
    { immediate: true }
  )

  // Re-center when workspace changes
  watch(
    currentWorkspaceId,
    async () => {
      // Exit neighborhood mode when workspace changes
      ctx.neighborhoodExit()
      // Auto-fit to content when switching workspaces
      ctx.hasInitiallyCentered.value = false
      // Use nextTick to wait for Vue's reactivity to update filteredNodes
      await nextTick()
      // Short delay to ensure computed values have propagated
      setTimeout(() => {
        if (ctx.getFilteredNodesLength() > 0) {
          ctx.fitToContent()
          ctx.hasInitiallyCentered.value = true
        } else {
          ctx.centerGrid()
        }
      }, 50)
    }
  )
}
