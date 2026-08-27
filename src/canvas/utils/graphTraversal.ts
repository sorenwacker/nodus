/**
 * Graph traversal utilities
 */

export interface NodeInfo {
  id: string
  title: string
  content: string
}

export interface Edge {
  source_node_id: string
  target_node_id: string
}

/**
 * BFS traversal to find all connected nodes from a starting node
 */
export function findConnectedNodes(
  startNodeId: string,
  edges: Edge[],
  getNode: (id: string) => { title?: string; markdown_content?: string | null } | undefined
): NodeInfo[] {
  const visited = new Set<string>([startNodeId])
  const queue = [startNodeId]
  const connectedNodes: NodeInfo[] = []

  while (queue.length > 0) {
    const currentId = queue.shift()!
    for (const edge of edges) {
      let neighborId: string | null = null
      if (edge.source_node_id === currentId && !visited.has(edge.target_node_id)) {
        neighborId = edge.target_node_id
      } else if (edge.target_node_id === currentId && !visited.has(edge.source_node_id)) {
        neighborId = edge.source_node_id
      }
      if (neighborId) {
        visited.add(neighborId)
        queue.push(neighborId)
        const node = getNode(neighborId)
        if (node) {
          connectedNodes.push({
            id: neighborId,
            title: node.title || 'Untitled',
            content: node.markdown_content || '',
          })
        }
      }
    }
  }

  return connectedNodes
}

/**
 * Get immediate neighbor IDs of a node (1 hop away)
 */
export function getNeighborIds(nodeId: string, edges: Edge[]): string[] {
  const neighbors: string[] = []
  for (const edge of edges) {
    if (edge.source_node_id === nodeId) {
      neighbors.push(edge.target_node_id)
    } else if (edge.target_node_id === nodeId) {
      neighbors.push(edge.source_node_id)
    }
  }
  return neighbors
}

