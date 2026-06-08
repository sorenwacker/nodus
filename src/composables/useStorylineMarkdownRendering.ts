import { ref } from 'vue'
import {
  renderMarkdown,
  renderPendingContent,
} from '../services/MarkdownRenderService'
import { useNodesStore } from '../stores/nodes'
import type { Node } from '../types'

/**
 * Handles markdown and math rendering for the storyline reader.
 * Uses the unified MarkdownRenderService for consistent rendering.
 *
 * Two-phase rendering:
 * 1. renderNodeContent/renderAllNodes - sync, creates HTML with placeholders
 * 2. processPendingContent - async, injects SVG into DOM
 *
 * Usage:
 *   await renderAllNodes(nodes)
 *   await nextTick()  // wait for DOM update
 *   await processPendingContent()  // inject math/mermaid SVGs
 */
export function useStorylineMarkdownRendering() {
  const renderedContent = ref<Map<string, string>>(new Map())

  function getWikilinkExists(target: string): boolean {
    const store = useNodesStore()
    return store.filteredNodes.some(
      n => n.title.toLowerCase() === target.toLowerCase()
    )
  }

  /**
   * Phase 1: Render markdown to HTML with placeholders (sync)
   */
  function renderNodeContent(node: Node): void {
    if (!node.markdown_content) {
      renderedContent.value = new Map(renderedContent.value).set(node.id, '')
      return
    }

    const html = renderMarkdown(node.markdown_content, {
      wikilinkExists: getWikilinkExists,
    })

    renderedContent.value = new Map(renderedContent.value).set(node.id, html)
  }

  /**
   * Phase 1: Render all nodes to HTML with placeholders (sync)
   */
  function renderAllNodes(nodes: Node[]): void {
    const newContent = new Map(renderedContent.value)

    for (const node of nodes) {
      if (!newContent.has(node.id)) {
        const html = node.markdown_content
          ? renderMarkdown(node.markdown_content, {
              wikilinkExists: getWikilinkExists,
            })
          : ''
        newContent.set(node.id, html)
      }
    }

    renderedContent.value = newContent
  }

  /**
   * Phase 2: Process pending math/mermaid in DOM (async)
   * Call this after DOM has updated with the rendered HTML
   */
  async function processPendingContent(container?: Element): Promise<void> {
    await renderPendingContent(container)
  }

  function getRenderedContent(nodeId: string): string {
    return renderedContent.value.get(nodeId) || ''
  }

  function clearCache(): void {
    renderedContent.value = new Map()
  }

  return {
    renderedContent,
    renderNodeContent,
    renderAllNodes,
    processPendingContent,
    getRenderedContent,
    clearCache,
  }
}
