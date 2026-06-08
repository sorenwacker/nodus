/**
 * useStorylineOperations - Composable for storyline node operations
 *
 * Extracts handler functions for adding, removing, and reordering nodes
 * in storylines. Uses StorylineService for undo support when available.
 */
import type { Ref } from 'vue'
import type { StorylineService } from '../services/storylineService'
import type { useNodesStore } from '../stores/nodes'

type NodesStore = ReturnType<typeof useNodesStore>

export interface StorylineOperationsOptions {
  store: NodesStore
  storylineService: StorylineService | undefined
  selectedStorylineId: Ref<string | null>
  showToast?: (message: string, type: 'error' | 'success' | 'info') => void
}

export function useStorylineOperations(options: StorylineOperationsOptions) {
  const { store, storylineService, selectedStorylineId, showToast } = options

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

  async function handleCommentCreate(index: number, text: string) {
    if (!selectedStorylineId.value) return
    try {
      // Provide default canvas position for storyline-created comments
      const node = await store.createNode({
        title: 'Comment',
        node_type: 'comment',
        markdown_content: text,
        canvas_x: 0,
        canvas_y: 0,
      })
      if (storylineService) {
        await storylineService.addNode(selectedStorylineId.value, node.id, index)
      } else {
        await store.addNodeToStoryline(selectedStorylineId.value, node.id, index)
      }
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
