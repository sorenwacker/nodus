/**
 * Entity operations composable
 * Handles entity node creation and linking operations
 */

import type { Node, Edge, CreateNodeInput, CreateEdgeInput, EntityNodeType } from '../types'
import { ENTITY_NODE_TYPES } from '../types'

export interface EntityOperationsDeps {
  getNodes: () => Node[]
  getFilteredNodes: () => Node[]
  getNode: (id: string) => Node | undefined
  createNode: (data: CreateNodeInput) => Promise<Node>
  createEdge: (data: CreateEdgeInput) => Promise<Edge>
  getEntityEdgesForNode: (nodeId: string, direction: 'incoming' | 'outgoing' | 'both') => Edge[]
}

export function useEntityOperations(deps: EntityOperationsDeps) {
  /**
   * Get all entity nodes in the current workspace
   */
  function getEntities(): Node[] {
    return deps.getFilteredNodes().filter(n =>
      ENTITY_NODE_TYPES.includes(n.node_type as EntityNodeType)
    )
  }

  /**
   * Get entity nodes filtered by type
   */
  function getEntitiesByType(entityType: EntityNodeType): Node[] {
    return deps.getFilteredNodes().filter(n => n.node_type === entityType)
  }

  /**
   * Get all entity nodes linked to a specific node
   * Returns entities that this node references via entity link types
   */
  function getLinkedEntities(nodeId: string): Node[] {
    const entityEdges = deps.getEntityEdgesForNode(nodeId, 'outgoing')
    const entityIds = new Set(entityEdges.map(e => e.target_node_id))
    return deps.getNodes().filter(n => entityIds.has(n.id))
  }

  /**
   * Get all content nodes that reference a specific entity
   */
  function getNodesReferencingEntity(entityId: string): Node[] {
    const entityEdges = deps.getEntityEdgesForNode(entityId, 'incoming')
    const sourceIds = new Set(entityEdges.map(e => e.source_node_id))
    return deps.getNodes().filter(n => sourceIds.has(n.id))
  }

  /**
   * Create an entity node with appropriate defaults
   */
  async function createEntityNode(
    entityType: EntityNodeType,
    title: string,
    options?: {
      canvas_x?: number
      canvas_y?: number
      markdown_content?: string
      color_theme?: string | null
    }
  ): Promise<Node> {
    return deps.createNode({
      title,
      node_type: entityType,
      canvas_x: options?.canvas_x ?? 0,
      canvas_y: options?.canvas_y ?? 0,
      markdown_content: options?.markdown_content,
      color_theme: options?.color_theme,
    })
  }

  /**
   * Link a content node to an entity with an appropriate link type
   */
  async function linkToEntity(
    sourceNodeId: string,
    entityNodeId: string,
    linkType?: string
  ): Promise<Edge> {
    const entityNode = deps.getNode(entityNodeId)
    const inferredLinkType = linkType ?? inferEntityLinkType(entityNode?.node_type)
    return deps.createEdge({
      source_node_id: sourceNodeId,
      target_node_id: entityNodeId,
      link_type: inferredLinkType,
    })
  }

  /**
   * Infer appropriate link type based on entity type
   */
  function inferEntityLinkType(entityType?: string): string {
    switch (entityType) {
      case 'character':
      case 'location':
        return 'appears_in'
      case 'citation':
        return 'references'
      case 'term':
        return 'defines'
      default:
        return 'mentions'
    }
  }

  return {
    getEntities,
    getEntitiesByType,
    getLinkedEntities,
    getNodesReferencingEntity,
    createEntityNode,
    linkToEntity,
    inferEntityLinkType,
  }
}
