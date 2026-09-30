/**
 * Fitting nodes to their rendered content on request: the selected nodes, or
 * one node. Measures the rendered view, so an open editor is closed first.
 */
import { nextTick } from 'vue'
import { NODE_DEFAULTS } from '../../constants'
import type { Node } from '../../../types'

export interface UseNodeFitNowDeps {
  getNode: (id: string) => Node | undefined
  getSelectedNodeIds: () => string[]
  getEditingNodeId: () => string | null
  /** Save the open editor's content and close it */
  finishEditing: (nodeId: string) => void
  setRenderedContent: (nodeId: string, html: string) => void
  renderMarkdown: (content: string | null) => string
  renderTypstMath: () => Promise<void>
  renderMermaidDiagrams: () => void
  fitNodeToContent: (nodeId: string) => void
  pushSizeUndo: (sizes: Map<string, { width: number; height: number; x: number; y: number }>) => void
}

export function useNodeFitNow(deps: UseNodeFitNowDeps) {
  async function fitSelectedNodes() {
    // Selected nodes are always included in visibleNodes via viewport culling,
    // so they're guaranteed to be in the DOM when zoomed in
    if (deps.getSelectedNodeIds().length === 0) return

    // Capture old sizes for undo
    const oldSizes = new Map<string, { width: number; height: number; x: number; y: number }>()
    for (const nodeId of deps.getSelectedNodeIds()) {
      const node = deps.getNode(nodeId)
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
    for (const nodeId of deps.getSelectedNodeIds()) {
      await fitNodeNow(nodeId)
    }

    // Push undo if any sizes were captured
    if (oldSizes.size > 0) {
      deps.pushSizeUndo(oldSizes)
    }
  }

  /** One-shot fit to content (does NOT enable auto_fit) */
  async function fitNodeNow(nodeId: string): Promise<void> {
    // Exit edit mode first to measure rendered view, not textarea
    if (deps.getEditingNodeId() === nodeId) deps.finishEditing(nodeId)

    // Force update rendered content for this node
    const node = deps.getNode(nodeId)
    if (node) {
      deps.setRenderedContent(nodeId, deps.renderMarkdown(node.markdown_content))
    }

    // Wait for Vue to render the view mode content and render math
    await nextTick()
    await deps.renderTypstMath()
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
          deps.renderMermaidDiagrams()
          setTimeout(() => {
            deps.fitNodeToContent(nodeId)
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

  return { fitSelectedNodes, fitNodeNow }
}
