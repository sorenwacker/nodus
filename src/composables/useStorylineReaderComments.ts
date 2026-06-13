/**
 * Composable for storyline reader comment state management
 *
 * Manages comment collapse state and provides helpers for
 * parsing comment metadata.
 */
import { ref } from 'vue'
import { parseCommentMeta } from './useCommentMeta'
import type { Node } from '../types'

/**
 * Manages comment state for the storyline reader.
 * Handles collapsing/expanding comments and parsing comment metadata.
 */
export function useStorylineReaderComments() {
  const collapsedComments = ref<Set<string>>(new Set())

  /**
   * Get parsed comment metadata and text from a node
   */
  function getCommentMeta(node: Node) {
    return parseCommentMeta(node.markdown_content)
  }

  /**
   * Check if a comment is currently collapsed
   */
  function isCommentCollapsed(nodeId: string): boolean {
    return collapsedComments.value.has(nodeId)
  }

  /**
   * Toggle the collapsed state of a comment
   */
  function toggleCommentCollapsed(nodeId: string) {
    if (collapsedComments.value.has(nodeId)) {
      collapsedComments.value.delete(nodeId)
    } else {
      collapsedComments.value.add(nodeId)
    }
  }

  /**
   * Expand a specific comment (if collapsed)
   */
  function expandComment(nodeId: string) {
    collapsedComments.value.delete(nodeId)
  }

  /**
   * Collapse a specific comment
   */
  function collapseComment(nodeId: string) {
    collapsedComments.value.add(nodeId)
  }

  /**
   * Expand all comments
   */
  function expandAllComments() {
    collapsedComments.value.clear()
  }

  /**
   * Collapse all comments in the given list of nodes
   */
  function collapseAllComments(nodes: Node[]) {
    for (const node of nodes) {
      if (node.node_type === 'comment') {
        collapsedComments.value.add(node.id)
      }
    }
  }

  return {
    collapsedComments,
    getCommentMeta,
    isCommentCollapsed,
    toggleCommentCollapsed,
    expandComment,
    collapseComment,
    expandAllComments,
    collapseAllComments,
  }
}
