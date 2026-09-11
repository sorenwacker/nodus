/**
 * useStorylineOperations - Composable for storyline node operations
 *
 * Extracts handler functions for adding, removing, and reordering nodes
 * in storylines. Uses StorylineService for undo support when available.
 */
import type { StorylineService } from '../services/storylineService'
import type { useNodesStore } from '../stores/nodes'
import type { Node, CommentType } from '../types'
import { createCommentContent } from './useCommentMeta'
import { commentAnchorTitle, anchorCommentInText } from '../lib/anchoredNodes'

type NodesStore = ReturnType<typeof useNodesStore>

export interface StorylineOperationsOptions {
  store: NodesStore
  storylineService: StorylineService | undefined
  /** Ref or computed holding the storyline the operations apply to */
  selectedStorylineId: { readonly value: string | null }
  /** The storyline's nodes in order; a new comment is anchored in one of them */
  storylineNodes: () => Node[]
  showToast?: (message: string, type: 'error' | 'success' | 'info') => void
}

/** What creating a storyline comment needs */
export interface StorylineCommentInput {
  store: Pick<NodesStore, 'nodes' | 'createNode' | 'updateNodeContent'>
  /** The storyline's nodes in order */
  storylineNodes: Node[]
  /** Where the comment goes; it is anchored in the node before this position */
  index: number
  text: string
  commentType: CommentType
  /** Add the created comment to the storyline at `index` */
  addToStoryline: (nodeId: string, index: number) => Promise<void>
}

/**
 * Create a comment in a storyline. Its type is recorded in the meta header,
 * and a wikilink in the passage it comments on anchors it there
 * (PRODUCT_DESIGN.md > Creating a comment). The storyline panel and the reader
 * both create comments here, so the two cannot drift apart again.
 */
export async function createStorylineComment(input: StorylineCommentInput): Promise<Node> {
  const { store, storylineNodes, index, text, commentType, addToStoryline } = input
  const title = commentAnchorTitle(text, store.nodes.map(n => n.title))
  const node = await store.createNode({
    title,
    node_type: 'comment',
    markdown_content: createCommentContent(text, commentType),
    canvas_x: 0,
    canvas_y: 0,
  })
  const anchor = storylineNodes[index - 1] ?? storylineNodes[index] ?? storylineNodes[0]
  if (anchor) {
    await store.updateNodeContent(anchor.id, anchorCommentInText(anchor.markdown_content || '', title))
  }
  await addToStoryline(node.id, index)
  return node
}

export function useStorylineOperations(options: StorylineOperationsOptions) {
  const { store, storylineService, selectedStorylineId, storylineNodes, showToast } = options

  async function handleNodeAdd(index: number, nodeId: string) {
    if (!selectedStorylineId.value) return
    try {
      if (storylineService) {
        await storylineService.addNode(selectedStorylineId.value, nodeId, index)
      } else {
        await store.addNodeToStoryline(selectedStorylineId.value, nodeId, index)
      }
      showToast?.('Node added to storyline', 'success')
    } catch (e) {
      console.error('Failed to add node:', e)
      showToast?.(`Failed to add node: ${e}`, 'error')
    }
  }

  async function handleNodeCreate(index: number, title: string) {
    if (!selectedStorylineId.value) return
    try {
      // Provide default canvas position for storyline-created nodes
      const node = await store.createNode({
        title,
        markdown_content: '',
        canvas_x: 0,
        canvas_y: 0,
      })
      if (storylineService) {
        await storylineService.addNode(selectedStorylineId.value, node.id, index)
      } else {
        await store.addNodeToStoryline(selectedStorylineId.value, node.id, index)
      }
      showToast?.(`Created "${title}"`, 'success')
    } catch (e) {
      console.error('Failed to create node:', e)
      showToast?.(`Failed to create node: ${e}`, 'error')
    }
  }

  async function handleCommentCreate(index: number, text: string, commentType: CommentType = 'note') {
    const storylineId = selectedStorylineId.value
    if (!storylineId) return
    try {
      await createStorylineComment({
        store,
        storylineNodes: storylineNodes(),
        index,
        text,
        commentType,
        addToStoryline: (nodeId, at) =>
          storylineService
            ? storylineService.addNode(storylineId, nodeId, at)
            : store.addNodeToStoryline(storylineId, nodeId, at),
      })
      showToast?.('Added comment', 'success')
    } catch (e) {
      console.error('Failed to create comment:', e)
      showToast?.(`Failed to create comment: ${e}`, 'error')
    }
  }

  async function handleNodeRemove(nodeId: string) {
    if (!selectedStorylineId.value) return
    try {
      if (storylineService) {
        await storylineService.removeNode(selectedStorylineId.value, nodeId)
      } else {
        await store.removeNodeFromStoryline(selectedStorylineId.value, nodeId)
      }
    } catch (e) {
      console.error('Failed to remove node:', e)
    }
  }

  async function handleNodeReorder(nodeIds: string[]) {
    if (!selectedStorylineId.value) return
    try {
      if (storylineService) {
        await storylineService.reorderNodes(selectedStorylineId.value, nodeIds)
      } else {
        await store.reorderStorylineNodes(selectedStorylineId.value, nodeIds)
      }
    } catch (e) {
      console.error('Failed to reorder nodes:', e)
    }
  }

  return {
    handleNodeAdd,
    handleNodeCreate,
    handleCommentCreate,
    handleNodeRemove,
    handleNodeReorder,
  }
}
