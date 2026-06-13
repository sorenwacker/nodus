/**
 * Fullscreen node modal composable
 *
 * Handles the state for opening/closing the fullscreen node viewer
 * and navigation between nodes.
 */
import { ref, type Ref } from 'vue'
import { resolveWikilink } from '../../../lib/wikilink'
import type { Node, Frame } from '../../../types'

/**
 * Context for fullscreen modal operations
 */
export interface UseFullscreenModalContext {
  /** Get filtered nodes */
  getFilteredNodes: () => Node[]
  /** Get filtered frames */
  getFilteredFrames: () => Frame[]
}

/**
 * Return type for useFullscreenModal
 */
export interface UseFullscreenModalReturn {
  /** Whether the fullscreen modal is visible */
  showFullscreenModal: Ref<boolean>
  /** The currently displayed node ID */
  fullscreenNodeId: Ref<string | null>
  /** Open fullscreen view for a node */
  openFullscreenNode: (nodeId: string) => void
  /** Close the fullscreen view */
  closeFullscreenNode: () => void
  /** Navigate to a linked node by title (stays in fullscreen) */
  handleNavigateToNode: (title: string) => void
}

/**
 * Composable for fullscreen node modal state
 *
 * Provides state and handlers for the fullscreen node viewer,
 * including opening, closing, and navigation between linked nodes.
 */
export function useFullscreenModal(ctx: UseFullscreenModalContext): UseFullscreenModalReturn {
  const showFullscreenModal = ref(false)
  const fullscreenNodeId = ref<string | null>(null)

  /**
   * Open fullscreen view for a node
   */
  function openFullscreenNode(nodeId: string) {
    fullscreenNodeId.value = nodeId
    showFullscreenModal.value = true
  }

  /**
   * Close the fullscreen view
   */
  function closeFullscreenNode() {
    showFullscreenModal.value = false
    fullscreenNodeId.value = null
  }

  /**
   * Navigate to a linked node by title (stays in fullscreen)
   */
  function handleNavigateToNode(title: string) {
    const linkedNode = resolveWikilink(title, {
      nodes: ctx.getFilteredNodes(),
      frames: ctx.getFilteredFrames(),
    })
    if (linkedNode) {
      // Open the linked node in fullscreen
      fullscreenNodeId.value = linkedNode.id
    }
  }

  return {
    showFullscreenModal,
    fullscreenNodeId,
    openFullscreenNode,
    closeFullscreenNode,
    handleNavigateToNode,
  }
}
