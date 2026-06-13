/**
 * Canvas event handlers composable
 *
 * Handles content clicks, double-clicks, and context menu events
 * for the canvas and nodes.
 */
import type { Ref } from 'vue'

/**
 * Context menu interface (subset needed by event handlers)
 */
export interface ContextMenuInterface {
  open: (e: MouseEvent, nodeId: string) => void
  close: () => void
}

/**
 * Context for canvas event handlers
 */
export interface UseCanvasEventHandlersContext {
  /** Currently editing node ID */
  editingNodeId: Ref<string | null>
  /** Edit content for the editing node */
  editContent: Ref<string>
  /** Whether in-node search is active */
  showNodeSearch: Ref<boolean>
  /** Close in-node search */
  closeNodeSearch: () => void
  /** Open in-node search */
  openNodeSearch: (nodeId?: string) => void
  /** Update node content in store */
  updateNodeContent: (nodeId: string, content: string) => void
  /** Get a node by ID */
  getNode: (nodeId: string) => { auto_fit?: boolean } | undefined
  /** Render mermaid diagrams */
  renderMermaidDiagrams: () => void
  /** Fit node to content */
  fitNodeToContent: (nodeId: string) => void
  /** Navigate to a node by title or ID */
  navigateToNode: (target: string) => void
  /** Open external link */
  openExternal: (url: string) => void
  /** Screen to canvas coordinate conversion */
  screenToCanvas: (screenX: number, screenY: number) => { x: number; y: number }
  /** Snap to grid */
  snapToGrid: (value: number) => number
  /** Create a new node */
  createNode: (options: {
    title: string
    node_type: string
    markdown_content: string
    canvas_x: number
    canvas_y: number
  }) => Promise<void>
  /** Last drag end timestamp */
  lastDragEndTime: () => number
  /** Context menu interface */
  contextMenu: ContextMenuInterface
  /** Suppress preview panel */
  suppressPreviewPanel: () => void
  /** Get store selected node IDs */
  getSelectedNodeIds: () => string[]
  /** Select a node */
  selectNode: (nodeId: string) => void
}

/**
 * Return type for useCanvasEventHandlers
 */
export interface UseCanvasEventHandlersReturn {
  /**
   * Handle clicks on rendered content (wikilinks, external links)
   */
  handleContentClick: (e: MouseEvent) => void
  /**
   * Save editing state (blur handler)
   */
  saveEditing: (e?: FocusEvent) => void
  /**
   * Handle keydown in editor
   */
  onEditorKeydown: (e: KeyboardEvent) => void
  /**
   * Handle double-click on canvas to create node
   */
  onCanvasDoubleClick: (e: MouseEvent) => Promise<void>
  /**
   * Handle right-click context menu on canvas/nodes
   */
  onContextMenu: (e: MouseEvent) => void
  /**
   * Close context menu
   */
  closeContextMenu: () => void
  /**
   * Handle context menu on LOD canvas node
   */
  onLODNodeContextMenu: (e: MouseEvent, nodeId: string) => void
  /**
   * Handle context menu on LOD canvas background
   */
  onLODCanvasContextMenu: (e: MouseEvent) => void
}

/**
 * Composable for canvas event handlers
 *
 * Extracts event handling logic for content clicks, editing,
 * double-click node creation, and context menus.
 */
export function useCanvasEventHandlers(
  ctx: UseCanvasEventHandlersContext
): UseCanvasEventHandlersReturn {
  const {
    editingNodeId,
    editContent,
    showNodeSearch,
    closeNodeSearch,
    openNodeSearch,
    updateNodeContent,
    getNode,
    renderMermaidDiagrams,
    fitNodeToContent,
    navigateToNode,
    openExternal,
    screenToCanvas,
    snapToGrid,
    createNode,
    lastDragEndTime,
    contextMenu,
    suppressPreviewPanel,
    getSelectedNodeIds,
    selectNode,
  } = ctx

  /**
   * Handle clicks on rendered content
   * Intercepts wikilink and external link clicks
   */
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

  /**
   * Save editing state
   *
   * Handles blur events and direct calls (e.g., from Cmd+Enter).
   * Triggers mermaid rendering and auto-fit after save.
   */
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
      updateNodeContent(nodeId, editContent.value)
      // Trigger mermaid rendering after content update
      setTimeout(renderMermaidDiagrams, 100)
      // Auto-fit node to content after saving (if enabled for this node)
      // Delay to ensure content is rendered (including mermaid)
      const node = getNode(nodeId)
      if (node?.auto_fit) {
        setTimeout(() => fitNodeToContent(nodeId), 500)
      }
    }
    editingNodeId.value = null
    editContent.value = ''
  }

  /**
   * Handle keydown in editor
   *
   * - Cmd/Ctrl+F: Open in-node search
   * - Escape: Close search or save editing
   * - Cmd/Ctrl+Enter: Save and exit
   */
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

  /**
   * Double click on canvas to create a new node
   *
   * Ignores clicks on interactive elements and recent drag operations.
   */
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
    if (Date.now() - lastDragEndTime() < 200) return

    const pos = screenToCanvas(e.clientX, e.clientY)
    await createNode({
      title: '',
      node_type: 'note',
      markdown_content: '',
      canvas_x: snapToGrid(pos.x),
      canvas_y: snapToGrid(pos.y),
    })
  }

  /**
   * Handle right-click context menu
   *
   * Opens context menu on node or closes if clicking elsewhere.
   */
  function onContextMenu(e: MouseEvent) {
    e.preventDefault()

    // Check if clicking on a node
    const target = e.target as HTMLElement
    const nodeCard = target.closest('.node-card') as HTMLElement | null

    if (nodeCard) {
      const nodeId = nodeCard.dataset.nodeId
      if (nodeId) {
        suppressPreviewPanel()
        contextMenu.open(e, nodeId)

        // Select the node if not already selected
        if (!getSelectedNodeIds().includes(nodeId)) {
          selectNode(nodeId)
        }
        return
      }
    }

    // Hide context menu if clicking elsewhere
    contextMenu.close()
  }

  /**
   * Close context menu
   */
  function closeContextMenu() {
    contextMenu.close()
  }

  /**
   * Handle context menu on LOD canvas node
   */
  function onLODNodeContextMenu(e: MouseEvent, nodeId: string) {
    suppressPreviewPanel()
    contextMenu.open(e, nodeId)
    if (!getSelectedNodeIds().includes(nodeId)) {
      selectNode(nodeId)
    }
  }

  /**
   * Handle context menu on LOD canvas background
   */
  function onLODCanvasContextMenu(_e: MouseEvent) {
    contextMenu.close()
  }

  return {
    handleContentClick,
    saveEditing,
    onEditorKeydown,
    onCanvasDoubleClick,
    onContextMenu,
    closeContextMenu,
    onLODNodeContextMenu,
    onLODCanvasContextMenu,
  }
}
