/**
 * Composable for storyline reader entity sidebar logic
 *
 * Manages entity discovery for the current active node and provides
 * navigation helpers for jumping between entity occurrences.
 */
import { computed, type Ref } from 'vue'
import { useNodesStore } from '../stores/nodes'
import type { Node, EntityNodeType } from '../types'
import { ENTITY_NODE_TYPES } from '../types'

export interface UseStorylineReaderEntitiesOptions {
  /** Array of nodes in the storyline */
  nodes: Ref<Node[]>
  /** Index of the currently active node */
  activeNodeIndex: Ref<number>
  /** Function to navigate to a node by index */
  goToNode: (index: number) => void
  /** Function to close the reader */
  onClose: () => void
}

/**
 * Manages entity sidebar logic for the storyline reader.
 * Provides computed properties for entities linked to the current node
 * and navigation functions for jumping between entity occurrences.
 */
export function useStorylineReaderEntities(options: UseStorylineReaderEntitiesOptions) {
  const { nodes, activeNodeIndex, goToNode, onClose } = options
  const store = useNodesStore()

  /**
   * Get entities linked to the current active node
   */
  const currentNodeEntities = computed(() => {
    const node = nodes.value[activeNodeIndex.value]
    if (!node) return []
    return store.getLinkedEntities(node.id)
  })

  /**
   * Group entities by type for display in sidebar
   */
  const entitiesByType = computed(() => {
    const grouped: Record<EntityNodeType, Node[]> = {
      character: [],
      location: [],
      citation: [],
      term: [],
      item: [],
    }

    for (const entity of currentNodeEntities.value) {
      const type = entity.node_type as EntityNodeType
      if (ENTITY_NODE_TYPES.includes(type)) {
        grouped[type].push(entity)
      }
    }

    return grouped
  })

  /**
   * Check if the current node has any linked entities
   */
  const hasEntities = computed(() => currentNodeEntities.value.length > 0)

  /**
   * Navigate to the previous/next node containing a specific entity
   */
  function navigateToEntityNode(entityId: string, direction: 'prev' | 'next') {
    const currentIndex = activeNodeIndex.value
    const startIndex = direction === 'next' ? currentIndex + 1 : currentIndex - 1

    if (direction === 'next') {
      for (let i = startIndex; i < nodes.value.length; i++) {
        const nodeEntities = store.getLinkedEntities(nodes.value[i].id)
        if (nodeEntities.some(e => e.id === entityId)) {
          goToNode(i)
          return
        }
      }
    } else {
      for (let i = startIndex; i >= 0; i--) {
        const nodeEntities = store.getLinkedEntities(nodes.value[i].id)
        if (nodeEntities.some(e => e.id === entityId)) {
          goToNode(i)
          return
        }
      }
    }
  }

  /**
   * Pan to an entity on the canvas, closing the reader
   */
  function panToEntity(entityId: string) {
    store.selectNode(entityId)
    onClose()
    window.dispatchEvent(new CustomEvent('zoom-to-node', { detail: { nodeId: entityId } }))
  }

  return {
    currentNodeEntities,
    entitiesByType,
    hasEntities,
    navigateToEntityNode,
    panToEntity,
  }
}
