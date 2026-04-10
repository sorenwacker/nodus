import { computed, type ComputedRef } from 'vue'
import type { Node, EntityNodeType } from '../../../types'

export interface UseEntityOperationsOptions {
  store: {
    filteredNodes: Node[]
    selectedNodeIds: string[]
    getLinkedEntities: (nodeId: string) => Node[]
    selectNode: (id: string) => void
    createEntityNode: (type: EntityNodeType, title: string) => Promise<Node>
    linkToEntity: (nodeId: string, entityId: string) => Promise<void>
    getNode: (id: string) => Node | undefined
  }
  contextMenu: {
    affectedNodeIds: ComputedRef<string[]>
    close: () => void
  }
  showToast?: (message: string, type: 'success' | 'error' | 'info') => void
}

/**
 * Handles entity-related operations on the canvas.
 * Provides functions for linking, creating, and navigating to entities.
 */
export function useEntityOperations(options: UseEntityOperationsOptions) {
  const { store, contextMenu, showToast } = options

  // Memoized linked entities map - computed once and cached
  const linkedEntitiesMap = computed(() => {
    const map = new Map<string, Node[]>()
    for (const node of store.filteredNodes) {
      // Only compute for non-entity nodes to avoid unnecessary work
      if (!['character', 'location', 'citation', 'term', 'item'].includes(node.node_type)) {
        map.set(node.id, store.getLinkedEntities(node.id))
      }
    }
    return map
  })

  // Get linked entities for a node (uses cached map)
  function getLinkedEntities(nodeId: string): Node[] {
    return linkedEntitiesMap.value.get(nodeId) || []
  }

  // Handle entity badge click - zoom to entity
  function handleEntityClick(entityId: string) {
    store.selectNode(entityId)
    window.dispatchEvent(new CustomEvent('zoom-to-node', { detail: { nodeId: entityId } }))
  }

  // Link affected nodes to an existing entity
  async function linkToEntity(entityId: string) {
    const affectedIds = contextMenu.affectedNodeIds.value
    for (const nodeId of affectedIds) {
      try {
        await store.linkToEntity(nodeId, entityId)
      } catch (e) {
        console.error('Failed to link to entity:', e)
      }
    }
    const entity = store.getNode(entityId)
    showToast?.(`Linked ${affectedIds.length} node(s) to ${entity?.title || 'entity'}`, 'success')
    contextMenu.close()
  }

  // Create a new entity and link affected nodes to it
  async function handleCreateEntity(type: string) {
    const labels: Record<string, string> = {
      character: 'New Character',
      location: 'New Location',
      citation: 'New Citation',
      term: 'New Term',
      item: 'New Item',
    }
    const title = labels[type] || 'New Entity'

    try {
      const entity = await store.createEntityNode(type as EntityNodeType, title)

      // Link affected nodes to the new entity
      const affectedIds = contextMenu.affectedNodeIds.value
      for (const nodeId of affectedIds) {
        await store.linkToEntity(nodeId, entity.id)
      }
      showToast?.(`Created ${title} and linked ${affectedIds.length} node(s)`, 'success')
      contextMenu.close()

      // Select the new entity for editing
      store.selectNode(entity.id)
      window.dispatchEvent(new CustomEvent('zoom-to-node', { detail: { nodeId: entity.id } }))
    } catch (e) {
      showToast?.(`Failed to create entity: ${e}`, 'error')
      contextMenu.close()
    }
  }

  return {
    linkedEntitiesMap,
    getLinkedEntities,
    handleEntityClick,
    linkToEntity,
    handleCreateEntity,
  }
}
