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
 * Get immediate neighbors of a node (1 hop away)
 */
export function getImmediateNeighbors(
  nodeId: string,
  edges: Edge[],
  getNode: (id: string) => { title?: string; markdown_content?: string | null } | undefined
): Array<{ title: string; content: string }> {
  const neighbors: Array<{ title: string; content: string }> = []

  for (const edge of edges) {
    let neighborId: string | null = null
    if (edge.source_node_id === nodeId) neighborId = edge.target_node_id
    else if (edge.target_node_id === nodeId) neighborId = edge.source_node_id

    if (neighborId) {
      const node = getNode(neighborId)
      if (node) {
        neighbors.push({
          title: node.title || 'Untitled',
          content: node.markdown_content || '',
        })
      }
    }
  }

  return neighbors
}

/**
 * Build context string from connected nodes with a character limit
 */
export function buildChainContext(
  nodes: NodeInfo[],
  charLimit: number
): string {
  if (nodes.length === 0 || charLimit <= 0) return ''

  let totalChars = 0
  const includedNodes: string[] = []

  for (const node of nodes) {
    if (totalChars + node.content.length > charLimit) {
      const remaining = charLimit - totalChars
      if (remaining > 100) {
        includedNodes.push(`--- ${node.title} ---\n${node.content.slice(0, remaining)}...(truncated)`)
      }
      break
    }
    includedNodes.push(`--- ${node.title} ---\n${node.content}`)
    totalChars += node.content.length
  }

  if (includedNodes.length === 0) return ''

  return `\nCONTEXT FROM ${includedNodes.length}/${nodes.length} CONNECTED NODES:\n` +
    includedNodes.join('\n\n') + '\n'
}
