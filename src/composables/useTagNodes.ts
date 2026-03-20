/**
 * Tag node management composable
 * Handles creation of tag nodes and edges from hashtags
 */
import type { Node, Edge, CreateEdgeInput } from '../types'

export interface TagNodeDeps {
  getNodes: () => Node[]
  getCurrentWorkspaceId: () => string | null
  createNode: (data: {
    title: string
    node_type: string
    canvas_x: number
    canvas_y: number
    width: number
    height: number
    color_theme?: string
    workspace_id?: string
  }) => Promise<Node>
  getEdges: () => Edge[]
  createEdge: (data: CreateEdgeInput) => Promise<Edge>
}

export function useTagNodes(deps: TagNodeDeps) {
  /**
   * Find or create a tag node for a given tag name.
   * Tag nodes have node_type: 'tag', small size, and primary color background.
   */
  async function getOrCreateTagNode(tagName: string, nearNodeId?: string): Promise<Node> {
    // Normalize tag name (lowercase for comparison)
    const normalizedTag = tagName.toLowerCase()
    const nodes = deps.getNodes()

    // Check if tag node already exists
    const existingTagNode = nodes.find(
      n => n.node_type === 'tag' && n.title.toLowerCase() === normalizedTag
    )
    if (existingTagNode) {
      return existingTagNode
    }

    // Calculate position near the first node using this tag
    let x = 100
    let y = 100
    if (nearNodeId) {
      const nearNode = nodes.find(n => n.id === nearNodeId)
      if (nearNode) {
        // Position to the right of the source node, offset slightly
        x = nearNode.canvas_x + (nearNode.width || 200) + 80
        y = nearNode.canvas_y
      }
    }

    // Create tag node with distinct properties
    const tagNode = await deps.createNode({
      title: tagName,
      node_type: 'tag',
      canvas_x: x,
      canvas_y: y,
      width: 100,
      height: 40,
      color_theme: 'var(--primary-color)',
      workspace_id: deps.getCurrentWorkspaceId() || undefined,
    })

    return tagNode
  }

  /**
   * Create edges from a node to its tag nodes.
   * Link type is 'tagged'.
   */
  async function createTagEdges(nodeId: string, tagNames: string[]): Promise<void> {
    const edges = deps.getEdges()

    for (const tagName of tagNames) {
      const tagNode = await getOrCreateTagNode(tagName, nodeId)

      // Check if edge already exists
      const exists = edges.some(
        e => e.source_node_id === nodeId &&
             e.target_node_id === tagNode.id &&
             e.link_type === 'tagged'
      )
      if (!exists) {
        await deps.createEdge({
          source_node_id: nodeId,
          target_node_id: tagNode.id,
          link_type: 'tagged',
        })
      }
    }
  }

  /**
   * Get all tag nodes
   */
  function getTagNodes(): Node[] {
    return deps.getNodes().filter(n => n.node_type === 'tag')
  }

  return {
    getOrCreateTagNode,
    createTagEdges,
    getTagNodes,
  }
}
