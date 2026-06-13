/**
 * Composable for storyline reader content interaction
 *
 * Handles click events in rendered content, routing wikilinks and external links
 * to appropriate handlers.
 */
import { nextTick, watch, type Ref } from 'vue'
import { useNodesStore } from '../stores/nodes'
import { openExternal } from '../lib/tauri'
import { resolveWikilink } from '../lib/wikilink'
import type { Node } from '../types'

export interface UseStorylineReaderContentOptions {
  /** Array of nodes in the storyline */
  nodes: Ref<Node[]>
  /** Container element for rendered content */
  contentRef: Ref<HTMLElement | null>
  /** Function to navigate to a node by index */
  goToNode: (index: number) => void
  /** Function to close the reader */
  onClose: () => void
  /** Markdown rendering functions */
  renderAllNodes: (nodes: Node[]) => void
  processPendingContent: (container?: HTMLElement) => Promise<void>
}

/**
 * Handles content interaction logic for the storyline reader.
 * Manages wikilink/external link routing and markdown rendering setup.
 */
export function useStorylineReaderContent(options: UseStorylineReaderContentOptions) {
  const { nodes, contentRef, goToNode, onClose, renderAllNodes, processPendingContent } = options
  const store = useNodesStore()

  /**
   * Handle clicks in rendered content.
   * Routes wikilinks to in-storyline navigation or canvas,
   * and external links to the system browser.
   */
  function handleContentClick(e: MouseEvent) {
    const target = e.target as HTMLElement
    const link = target.closest('a')
    if (link) {
      e.preventDefault()
      e.stopPropagation()
      if (link.classList.contains('wikilink')) {
        handleWikilinkClick(link)
      } else if (link.href) {
        openExternal(link.href)
      }
    }
  }

  /**
   * Handle wikilink click - navigate within storyline or to canvas
   */
  function handleWikilinkClick(link: HTMLAnchorElement) {
    const linkTarget = link.dataset.target
    if (!linkTarget) return

    const linkedNode = resolveWikilink(linkTarget, {
      nodes: store.filteredNodes,
      frames: store.filteredFrames,
    })

    if (!linkedNode) return

    // Check if the linked node is in this storyline
    const nodeIndex = nodes.value.findIndex(n => n.id === linkedNode.id)
    if (nodeIndex >= 0) {
      // Navigate within storyline
      goToNode(nodeIndex)
    } else {
      // Navigate to node on canvas
      store.selectNode(linkedNode.id)
      onClose()
      window.dispatchEvent(new CustomEvent('zoom-to-node', { detail: { nodeId: linkedNode.id } }))
    }
  }

  /**
   * Set up watcher to render node content when nodes change.
   * Handles two-phase rendering: markdown first, then math/diagrams.
   */
  function setupContentRendering() {
    watch(nodes, async (newNodes) => {
      // Phase 1: Render markdown with placeholders (sync)
      renderAllNodes(newNodes)
      // Phase 2: After DOM update, inject math/mermaid SVGs
      await nextTick()
      // Delay to ensure DOM is fully rendered and contentRef is available
      setTimeout(async () => {
        if (contentRef.value) {
          await processPendingContent(contentRef.value)
        } else {
          // Fallback to document-wide search if container not ready
          await processPendingContent()
        }
      }, 100)
    }, { immediate: true })
  }

  return {
    handleContentClick,
    handleWikilinkClick,
    setupContentRendering,
  }
}
