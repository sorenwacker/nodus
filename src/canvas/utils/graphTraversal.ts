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

/**
 * Get immediate neighbors of a node with content (1 hop away)
 */
export function getImmediateNeighbors(
  nodeId: string,
  edges: Edge[],
  getNode: (id: string) => { title?: string; markdown_content?: string | null } | undefined
): Array<{ title: string; content: string }> {
  const neighbors: Array<{ title: string; content: string }> = []

  for (const neighborId of getNeighborIds(nodeId, edges)) {
    const node = getNode(neighborId)
    if (node) {
      neighbors.push({
        title: node.title || 'Untitled',
        content: node.markdown_content || '',
      })
    }
  }

  return neighbors
}

/**
 * Get neighbors up to N hops away with depth info
 */
export function getNeighborsWithDepth(
  nodeId: string,
  edges: Edge[],
  getNode: (id: string) => { title?: string; markdown_content?: string | null } | undefined,
  maxDepth = 2
): Array<{ title: string; content: string; depth: number }> {
  const visited = new Set<string>([nodeId])
  const result: Array<{ title: string; content: string; depth: number }> = []
  let currentLevel = [nodeId]

  for (let depth = 1; depth <= maxDepth && currentLevel.length > 0; depth++) {
    const nextLevel: string[] = []

    for (const currentId of currentLevel) {
      for (const neighborId of getNeighborIds(currentId, edges)) {
        if (!visited.has(neighborId)) {
          visited.add(neighborId)
          nextLevel.push(neighborId)
          const node = getNode(neighborId)
          if (node) {
            result.push({
              title: node.title || 'Untitled',
              content: node.markdown_content || '',
              depth,
            })
          }
        }
      }
    }

    currentLevel = nextLevel
  }

  return result
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
