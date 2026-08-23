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
  /**
   * Whether wikilinks expand into callouts. Only the full-width reader has the
   * room for them (PRODUCT_DESIGN.md > Anchored nodes).
   */
  const expandAnchors = ref(false)

  function resolveAnchoredNode(target: string) {
    if (!expandAnchors.value) return null
    const store = useNodesStore()
    const node = store.filteredNodes.find(
      n => n.title.toLowerCase() === target.toLowerCase()
    )
    if (!node) return null
    return { id: node.id, title: node.title, markdown: node.markdown_content || '' }
  }

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
      anchoredNode: resolveAnchoredNode,
    })

    renderedContent.value = new Map(renderedContent.value).set(node.id, html)
  }

  /**
   * Phase 1: Render all nodes to HTML with placeholders (sync)
   */
  /** Sections that cover the first screenful, rendered before the slide */
  const FIRST_SCREENFUL = 6
  /** Nodes rendered per animation frame once the slide has settled */
  const RENDER_BATCH = 4
  /** How long the reader's slide takes; matches --step-duration */
  const SLIDE_SETTLE_MS = 320

  async function renderAllNodes(
    nodes: Node[],
    options?: { onBatch?: () => void; settleMs?: number }
  ): Promise<void> {
    // The first screenful renders in one pass before the slide begins; the
    // rest waits until the slide has settled and fills in below the fold.
    // Content that pops in while the panel is moving reads as flicker
    // (PRODUCT_DESIGN.md > Reader opening and switching)
    const pending = nodes.filter(n => !renderedContent.value.has(n.id))
    if (pending.length === 0) return

    const renderBatch = (batch: Node[]) => {
      const newContent = new Map(renderedContent.value)
      for (const node of batch) {
        const html = node.markdown_content
          ? renderMarkdown(node.markdown_content, {
              wikilinkExists: getWikilinkExists,
              anchoredNode: resolveAnchoredNode,
            })
          : ''
        newContent.set(node.id, html)
      }
      renderedContent.value = newContent
      options?.onBatch?.()
    }

    renderBatch(pending.slice(0, FIRST_SCREENFUL))
    if (pending.length <= FIRST_SCREENFUL) return

    await new Promise<void>(resolve =>
      setTimeout(resolve, options?.settleMs ?? SLIDE_SETTLE_MS)
    )

    for (let i = FIRST_SCREENFUL; i < pending.length; i += RENDER_BATCH) {
      if (i > FIRST_SCREENFUL) {
        await new Promise<void>(resolve =>
          typeof requestAnimationFrame === 'function'
            ? requestAnimationFrame(() => resolve())
            : setTimeout(resolve, 16)
        )
      }
      renderBatch(pending.slice(i, i + RENDER_BATCH))
    }
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
    expandAnchors,
    renderedContent,
    renderNodeContent,
    renderAllNodes,
    processPendingContent,
    getRenderedContent,
    clearCache,
  }
}
