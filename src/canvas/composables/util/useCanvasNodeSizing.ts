/**
 * Canvas node sizing composable
 *
 * Handles node height calculation and fit-to-content operations.
 */
import { nextTick, type Ref, type ComputedRef } from 'vue'
import { measureNodeContent } from '../../utils/nodeSizing'
import { NODE_DEFAULTS } from '../../constants'

/**
 * Context for node sizing operations
 */
export interface UseCanvasNodeSizingContext {
  /** Store functions for node operations */
  store: {
    getNode: (id: string) => NodeLike | undefined
    updateNodeSize: (id: string, width: number, height: number) => Promise<void>
    updateNodeContent: (id: string, content: string) => Promise<void>
    get filteredNodes(): NodeLike[]
    get selectedNodeIds(): string[]
    nodeLayoutVersion: number
  }
  /** Whether semantic zoom collapse is active */
  isSemanticZoomCollapsed: ComputedRef<boolean>
  /** Currently editing node ID */
  editingNodeId: Ref<string | null>
  /** Edit content ref */
  editContent: Ref<string>
  /** Neighborhood mode active */
  neighborhoodMode: Ref<boolean>
  /** Focus node ID in neighborhood mode */
  focusNodeId: Ref<string | null>
  /** Layout neighborhood function */
  layoutNeighborhood: (focusId: string) => void
  /** Save editing function */
  saveEditing: () => void
  /** Render markdown function */
  renderMarkdown: (content: string | null) => string
  /** Render typst math function */
  renderTypstMath: () => Promise<void>
  /** Render mermaid diagrams function */
  renderMermaidDiagrams: () => void
  /** Node rendered content cache */
  nodeRenderedContent: Ref<Record<string, string>>
  /** Push size undo function */
  pushSizeUndo?: (oldSizes: Map<string, { width: number; height: number; x: number; y: number }>) => void
}

/**
 * Minimal node shape for sizing
 */
export interface NodeLike {
  id: string
  height?: number
  width?: number
  markdown_content: string | null
  canvas_x: number
  canvas_y: number
}

/**
 * Return type for useCanvasNodeSizing
 */
export interface UseCanvasNodeSizingReturn {
  /** Get node height - use stored height or estimate from content */
  getNodeHeight: (node: { height?: number; markdown_content: string | null }, respectCollapse?: boolean) => number
  /** Fit a single node to its content */
  fitNodeToContent: (nodeId: string) => void
  /** Fit all nodes to their content (selected nodes if any, otherwise all visible) */
  fitAllNodesToContent: () => Promise<void>
  /** Reset all nodes to default size */
  resetAllNodeSizes: () => Promise<void>
  /** Fit selected nodes to content with undo support */
  fitSelectedNodes: () => Promise<void>
  /** One-shot fit to content (does NOT enable auto_fit) */
  fitNodeNow: (nodeId: string) => Promise<void>
}

/** Collapsed height constant for semantic zoom */
const COLLAPSED_NODE_HEIGHT = 140

/**
 * Composable for canvas node sizing operations
 *
 * Provides functions to calculate node heights and fit nodes to their content.
 */
export function useCanvasNodeSizing(ctx: UseCanvasNodeSizingContext): UseCanvasNodeSizingReturn {
  /**
   * Get node height - use stored height or estimate from content
   * When semantic zoom is active, returns collapsed height instead
   */
  function getNodeHeight(
    node: { height?: number; markdown_content: string | null },
    respectCollapse = true
  ): number {
    // When semantic zoom collapse is active, all nodes render at fixed height
    if (respectCollapse && ctx.isSemanticZoomCollapsed.value) {
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
    const contentHeight = lineCount * 24 + Math.floor(charCount / 35) * 20
    return Math.max(120, Math.min(600, contentHeight + 80))
  }

  /**
   * Fit a single node to its content
   */
  function fitNodeToContent(nodeId: string) {
    const node = ctx.store.getNode(nodeId)
    if (!node) return

    const cardEl = document.querySelector(`[data-node-id="${nodeId}"]`) as HTMLElement
    if (!cardEl) return

    const result = measureNodeContent(cardEl, node.width || NODE_DEFAULTS.WIDTH)
    if (!result) return

    ctx.store.updateNodeSize(nodeId, result.width, result.height)

    // In neighborhood mode, re-layout to adapt to new sizes
    if (ctx.neighborhoodMode.value && ctx.focusNodeId.value) {
      setTimeout(() => ctx.layoutNeighborhood(ctx.focusNodeId.value!), 10)
    }
  }

  /**
   * Fit nodes to their content (selected nodes if any, otherwise all visible)
   */
  async function fitAllNodesToContent() {
    // Exit any active editing first
    if (ctx.editingNodeId.value) {
      ctx.saveEditing()
      await nextTick()
    }
    // Render Mermaid diagrams first, then wait for them to complete
    ctx.renderMermaidDiagrams()
    // Wait longer for Mermaid SVGs to render (they're async)
    setTimeout(() => {
      // Fit selected nodes if any, otherwise all visible nodes
      const nodesToFit =
        ctx.store.selectedNodeIds.length > 0
          ? ctx.store.selectedNodeIds
          : ctx.store.filteredNodes.map(n => n.id)
      for (const nodeId of nodesToFit) {
        fitNodeToContent(nodeId)
      }
      // Trigger edge re-routing after sizes change
      ctx.store.nodeLayoutVersion++
    }, 500)
  }

  /**
   * Reset all nodes to default size (200x120)
   */
  async function resetAllNodeSizes() {
    for (const node of ctx.store.filteredNodes) {
      await ctx.store.updateNodeSize(node.id, 200, 120)
    }
    ctx.store.nodeLayoutVersion++
  }

  /**
   * Fit selected nodes to content with undo support
   */
  async function fitSelectedNodes() {
    if (ctx.store.selectedNodeIds.length === 0) return

    // Capture old sizes for undo
    const oldSizes = new Map<string, { width: number; height: number; x: number; y: number }>()
    for (const nodeId of ctx.store.selectedNodeIds) {
      const node = ctx.store.getNode(nodeId)
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
    for (const nodeId of ctx.store.selectedNodeIds) {
      await fitNodeNow(nodeId)
    }

    // Push undo if any sizes were captured
    if (oldSizes.size > 0 && ctx.pushSizeUndo) {
      ctx.pushSizeUndo(oldSizes)
    }
  }

  /**
   * One-shot fit to content (does NOT enable auto_fit)
   */
  async function fitNodeNow(nodeId: string): Promise<void> {
    // Exit edit mode first to measure rendered view, not textarea
    const wasEditing = ctx.editingNodeId.value === nodeId
    if (wasEditing) {
      // Save content directly
      ctx.store.updateNodeContent(nodeId, ctx.editContent.value)
      // Clear editing state
      ctx.editingNodeId.value = null
      ctx.editContent.value = ''
    }

    // Force update rendered content for this node
    const node = ctx.store.getNode(nodeId)
    if (node) {
      ctx.nodeRenderedContent.value = {
        ...ctx.nodeRenderedContent.value,
        [nodeId]: ctx.renderMarkdown(node.markdown_content),
      }
    }

    // Wait for Vue to render the view mode content and render math
    await nextTick()
    await ctx.renderTypstMath()
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
          ctx.renderMermaidDiagrams()
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

  return {
    getNodeHeight,
    fitNodeToContent,
    fitAllNodesToContent,
    resetAllNodeSizes,
    fitSelectedNodes,
    fitNodeNow,
  }
}
