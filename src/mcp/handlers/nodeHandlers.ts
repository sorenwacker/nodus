/**
 * Node CRUD and Graph Query Handlers
 *
 * Handles node creation, update, deletion, and graph analysis operations.
 */

import type { Node, Edge, Frame } from '../../types'
import type { McpNode, McpEdge } from '../types'
import { JsonRpcErrorCodes } from '../types'
import type { McpStoreInterface, McpUndoInterface } from '../messageHandler'

/**
 * Convert internal Node to MCP format
 */
export function nodeToMcp(node: Node, includeContent = false): McpNode {
  const mcpNode: McpNode = {
    id: node.id,
    title: node.title,
    node_type: node.node_type,
    canvas_x: node.canvas_x,
    canvas_y: node.canvas_y,
    width: node.width,
    height: node.height,
    created_at: node.created_at,
    updated_at: node.updated_at,
  }

  if (includeContent) {
    mcpNode.markdown_content = node.markdown_content
  }

  if (node.tags) {
    try {
      mcpNode.tags = JSON.parse(node.tags)
    } catch {
      mcpNode.tags = []
    }
  }

  return mcpNode
}

/**
 * Convert internal Edge to MCP format
 */
export function edgeToMcp(edge: Edge): McpEdge {
  return {
    id: edge.id,
    source_node_id: edge.source_node_id,
    target_node_id: edge.target_node_id,
    label: edge.label,
    link_type: edge.link_type,
    directed: edge.directed,
  }
}

/**
 * Map simple color names to hex values
 */
export const COLOR_NAME_MAP: Record<string, string> = {
  red: '#ef4444',
  orange: '#f97316',
  yellow: '#eab308',
  green: '#22c55e',
  blue: '#3b82f6',
  purple: '#8b5cf6',
  pink: '#ec4899',
  gray: '#6b7280',
  grey: '#6b7280',
}

/**
 * Convert color name to hex, or return the value if already hex/rgba
 */
export function normalizeColor(color: string | null): string | null {
  if (!color) return null
  const lower = color.toLowerCase().trim()
  return COLOR_NAME_MAP[lower] || color
}

/**
 * Clamp a position to keep a node inside its assigned frame
 * Returns the clamped position, or original if node has no frame
 */
export function clampToFrame(
  node: Node,
  targetX: number,
  targetY: number,
  getFrame: (id: string) => Frame | undefined
): { x: number; y: number } {
  if (!node.frame_id) {
    return { x: targetX, y: targetY }
  }

  const frame = getFrame(node.frame_id)
  if (!frame) {
    return { x: targetX, y: targetY }
  }

  const padding = 10
  const titleHeight = 50

  // Clamp position to keep node inside frame bounds
  const minX = frame.canvas_x + padding
  const minY = frame.canvas_y + padding + titleHeight
  const maxX = frame.canvas_x + frame.width - node.width - padding
  const maxY = frame.canvas_y + frame.height - node.height - padding

  return {
    x: Math.max(minX, Math.min(maxX, targetX)),
    y: Math.max(minY, Math.min(maxY, targetY)),
  }
}

/**
 * Custom error class for MCP errors
 */
export class McpError extends Error {
  code: number

  constructor(code: number, message: string) {
    super(message)
    this.code = code
    this.name = 'McpError'
  }
}

// Handler implementations

export function handleGetGraphSummary(store: McpStoreInterface): {
  node_count: number
  edge_count: number
  node_types: Record<string, number>
  top_connected: Array<{ id: string; title: string; connections: number }>
  content_format: string
} {
  const nodes = store.getFilteredNodes()
  const edges = store.getFilteredEdges()

  // Count node types
  const nodeTypes: Record<string, number> = {}
  for (const node of nodes) {
    const type = node.node_type || 'note'
    nodeTypes[type] = (nodeTypes[type] || 0) + 1
  }

  // Find most connected nodes
  const connectionCount: Record<string, number> = {}
  for (const edge of edges) {
    connectionCount[edge.source_node_id] = (connectionCount[edge.source_node_id] || 0) + 1
    connectionCount[edge.target_node_id] = (connectionCount[edge.target_node_id] || 0) + 1
  }

  const topConnected = Object.entries(connectionCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([id, count]) => {
      const node = store.getNode(id)
      return { id, title: node?.title || 'Unknown', connections: count }
    })

  return {
    node_count: nodes.length,
    edge_count: edges.length,
    node_types: nodeTypes,
    top_connected: topConnected,
    content_format: 'markdown',
  }
}

export function handleListNodes(
  store: McpStoreInterface,
  params: { include_content?: boolean; limit?: number; offset?: number }
): McpNode[] {
  const limit = params.limit ?? 50
  const offset = params.offset ?? 0

  return store.getFilteredNodes()
    .slice(offset, offset + limit)
    .map((node) => nodeToMcp(node, params.include_content))
}

export function handleGetNode(store: McpStoreInterface, params: { id: string }): McpNode {
  const node = store.getNode(params.id)
  if (!node) {
    throw new McpError(
      JsonRpcErrorCodes.INVALID_PARAMS,
      `Node not found: ${params.id}`
    )
  }
  return nodeToMcp(node, true)
}

export function handleGetNodeNeighbors(
  store: McpStoreInterface,
  params: { id: string; depth?: number }
): {
  node: McpNode
  neighbors: McpNode[]
  edges: McpEdge[]
} {
  const node = store.getNode(params.id)
  if (!node) {
    throw new McpError(
      JsonRpcErrorCodes.INVALID_PARAMS,
      `Node not found: ${params.id}`
    )
  }

  const depth = Math.min(params.depth ?? 1, 3) // Cap at 3 hops
  const allEdges = store.getFilteredEdges()

  // BFS to find all nodes within depth
  const visitedNodes = new Set<string>([params.id])
  const subgraphEdges = new Set<string>()
  let frontier = [params.id]

  for (let d = 0; d < depth && frontier.length > 0; d++) {
    const nextFrontier: string[] = []
    for (const nodeId of frontier) {
      for (const edge of allEdges) {
        if (edge.source_node_id === nodeId || edge.target_node_id === nodeId) {
          subgraphEdges.add(edge.id)
          const neighborId = edge.source_node_id === nodeId ? edge.target_node_id : edge.source_node_id
          if (!visitedNodes.has(neighborId)) {
            visitedNodes.add(neighborId)
            nextFrontier.push(neighborId)
          }
        }
      }
    }
    frontier = nextFrontier
  }

  // Collect neighbor nodes (excluding the root)
  const neighbors: McpNode[] = []
  for (const nodeId of visitedNodes) {
    if (nodeId !== params.id) {
      const n = store.getNode(nodeId)
      if (n) neighbors.push(nodeToMcp(n, true))
    }
  }

  // Collect edges within subgraph
  const edges: McpEdge[] = allEdges
    .filter(e => subgraphEdges.has(e.id))
    .map(edgeToMcp)

  return {
    node: nodeToMcp(node, true),
    neighbors,
    edges,
  }
}

export function handleGetGraphStructure(
  store: McpStoreInterface,
  params: { limit?: number }
): Record<string, { title: string; connections: string[] }> {
  const limit = params.limit ?? 50
  const nodes = store.getFilteredNodes()
  const edges = store.getFilteredEdges()

  // Count connections per node
  const connectionCount: Record<string, number> = {}
  for (const edge of edges) {
    connectionCount[edge.source_node_id] = (connectionCount[edge.source_node_id] || 0) + 1
    connectionCount[edge.target_node_id] = (connectionCount[edge.target_node_id] || 0) + 1
  }

  // Sort by most connected
  const sortedNodes = [...nodes].sort(
    (a, b) => (connectionCount[b.id] || 0) - (connectionCount[a.id] || 0)
  ).slice(0, limit)

  const result: Record<string, { title: string; connections: string[] }> = {}

  for (const node of sortedNodes) {
    const connectedEdges = edges.filter(
      (e) => e.source_node_id === node.id || e.target_node_id === node.id
    )

    const connectionTitles = connectedEdges
      .map((e) => {
        const neighborId = e.source_node_id === node.id ? e.target_node_id : e.source_node_id
        const neighbor = store.getNode(neighborId)
        return neighbor?.title || null
      })
      .filter((t): t is string => t !== null)

    result[node.title] = {
      title: node.title,
      connections: connectionTitles,
    }
  }

  return result
}

export function handleSearchNodes(
  store: McpStoreInterface,
  params: { query: string }
): Array<{ id: string; title: string }> {
  const query = params.query.toLowerCase()
  return store.getFilteredNodes()
    .filter((node) => {
      const titleMatch = node.title.toLowerCase().includes(query)
      const contentMatch = node.markdown_content?.toLowerCase().includes(query)
      return titleMatch || contentMatch
    })
    .map((node) => ({
      id: node.id,
      title: node.title,
    }))
}

export function handleGetOrphanNodes(store: McpStoreInterface): Array<{ id: string; title: string }> {
  const edges = store.getFilteredEdges()
  const connectedIds = new Set<string>()
  for (const edge of edges) {
    connectedIds.add(edge.source_node_id)
    connectedIds.add(edge.target_node_id)
  }

  return store.getFilteredNodes()
    .filter((node) => !connectedIds.has(node.id))
    .map((node) => ({ id: node.id, title: node.title }))
}

export function handleGetConnectedComponents(store: McpStoreInterface): {
  component_count: number
  components: Array<{
    size: number
    nodes?: Array<{ id: string; title: string }>
    sample_nodes?: Array<{ id: string; title: string }>
  }>
} {
  const nodes = store.getFilteredNodes()
  const edges = store.getFilteredEdges()

  // Build adjacency list (treat all edges as undirected for connectivity)
  const adjacency = new Map<string, Set<string>>()
  for (const node of nodes) {
    adjacency.set(node.id, new Set())
  }
  for (const edge of edges) {
    adjacency.get(edge.source_node_id)?.add(edge.target_node_id)
    adjacency.get(edge.target_node_id)?.add(edge.source_node_id)
  }

  // Find connected components using BFS
  const visited = new Set<string>()
  const components: Array<string[]> = []

  for (const node of nodes) {
    if (visited.has(node.id)) continue

    // BFS to find all nodes in this component
    const component: string[] = []
    const queue = [node.id]
    visited.add(node.id)

    while (queue.length > 0) {
      const current = queue.shift()!
      component.push(current)

      const neighbors = adjacency.get(current) || new Set()
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor)
          queue.push(neighbor)
        }
      }
    }

    components.push(component)
  }

  // Sort components by size (largest first)
  components.sort((a, b) => b.length - a.length)

  // Format response
  const formattedComponents = components.map((component) => {
    const nodeInfos = component.map((id) => {
      const n = store.getNode(id)
      return { id, title: n?.title || 'Unknown' }
    })

    // For small components (<=10 nodes), include all nodes
    // For larger components, include only sample nodes
    if (component.length <= 10) {
      return { size: component.length, nodes: nodeInfos }
    } else {
      return {
        size: component.length,
        sample_nodes: nodeInfos.slice(0, 5),
      }
    }
  })

  return {
    component_count: components.length,
    components: formattedComponents,
  }
}

export function handleGetLeafNodes(store: McpStoreInterface): Array<{ id: string; title: string }> {
  const edges = store.getFilteredEdges()
  // Nodes that are sources (have outgoing edges)
  const sourceIds = new Set<string>()
  // Nodes that are targets (have incoming edges)
  const targetIds = new Set<string>()

  for (const edge of edges) {
    sourceIds.add(edge.source_node_id)
    targetIds.add(edge.target_node_id)
  }

  // Leaf nodes: have incoming edges but no outgoing edges
  return store.getFilteredNodes()
    .filter((node) => targetIds.has(node.id) && !sourceIds.has(node.id))
    .map((node) => ({ id: node.id, title: node.title }))
}

export function handleGetRootNodes(store: McpStoreInterface): Array<{ id: string; title: string }> {
  const edges = store.getFilteredEdges()
  // Nodes that are sources (have outgoing edges)
  const sourceIds = new Set<string>()
  // Nodes that are targets (have incoming edges)
  const targetIds = new Set<string>()

  for (const edge of edges) {
    sourceIds.add(edge.source_node_id)
    targetIds.add(edge.target_node_id)
  }

  // Root nodes: have outgoing edges but no incoming edges
  return store.getFilteredNodes()
    .filter((node) => sourceIds.has(node.id) && !targetIds.has(node.id))
    .map((node) => ({ id: node.id, title: node.title }))
}

export function handleGetHubNodes(
  store: McpStoreInterface,
  params: { limit?: number }
): Array<{ id: string; title: string; connections: number }> {
  const limit = params.limit || 10
  const edges = store.getFilteredEdges()

  const connectionCount: Record<string, number> = {}
  for (const edge of edges) {
    connectionCount[edge.source_node_id] = (connectionCount[edge.source_node_id] || 0) + 1
    connectionCount[edge.target_node_id] = (connectionCount[edge.target_node_id] || 0) + 1
  }

  return Object.entries(connectionCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([id, count]) => {
      const node = store.getNode(id)
      return { id, title: node?.title || 'Unknown', connections: count }
    })
}

export function handleGetNodesByColor(
  store: McpStoreInterface,
  params: { color: string }
): Array<{ id: string; title: string }> {
  return store.getFilteredNodes()
    .filter((node) => node.color_theme === params.color)
    .map((node) => ({ id: node.id, title: node.title }))
}

export async function handleCreateNode(
  store: McpStoreInterface,
  undo: McpUndoInterface | undefined,
  params: {
    title: string
    content?: string
    x?: number
    y?: number
    node_type?: string
  }
): Promise<{ id: string; warning?: string; duplicate_ids?: string[] }> {
  // Check for existing nodes with the same title
  const existingNodes = store.getFilteredNodes().filter(
    (n) => n.title.toLowerCase() === params.title.toLowerCase()
  )

  const node = await store.createNode({
    title: params.title,
    markdown_content: params.content,
    canvas_x: params.x ?? 100,
    canvas_y: params.y ?? 100,
    node_type: params.node_type,
  })

  // Capture creation for undo
  if (undo) {
    undo.pushCreationUndo([node.id])
  }

  const result: { id: string; warning?: string; duplicate_ids?: string[] } = { id: node.id }

  if (existingNodes.length > 0) {
    result.warning = `Node created, but ${existingNodes.length} existing node(s) have the same title "${params.title}"`
    result.duplicate_ids = existingNodes.map((n) => n.id)
  }

  return result
}

export async function handleUpdateNode(
  store: McpStoreInterface,
  undo: McpUndoInterface | undefined,
  params: {
    id: string
    updates: {
      title?: string
      content?: string
      x?: number
      y?: number
    }
  }
): Promise<{ success: boolean }> {
  const node = store.getNode(params.id)
  if (!node) {
    throw new McpError(
      JsonRpcErrorCodes.INVALID_PARAMS,
      `Node not found: ${params.id}`
    )
  }

  const { updates } = params

  if (updates.title !== undefined) {
    await store.updateNodeTitle(params.id, updates.title)
  }

  if (updates.content !== undefined) {
    await store.updateNodeContent(params.id, updates.content)
  }

  if (updates.x !== undefined && updates.y !== undefined) {
    // Capture position for undo before changing
    if (undo) {
      const positions = new Map<string, { x: number; y: number }>()
      positions.set(node.id, { x: node.canvas_x, y: node.canvas_y })
      undo.pushPositionUndo(positions)
    }
    // Clamp position to keep node inside its frame
    const clamped = clampToFrame(node, updates.x, updates.y, store.getFrame)
    await store.updateNodePosition(params.id, clamped.x, clamped.y)
  }

  return { success: true }
}

export async function handleBatchUpdateNodes(
  store: McpStoreInterface,
  undo: McpUndoInterface | undefined,
  params: {
    updates: Array<{
      id: string
      title?: string
      content?: string
      x?: number
      y?: number
    }>
  }
): Promise<{ success: boolean; updated: number; failed: number; errors?: Array<{ id: string; error: string }> }> {
  let updated = 0
  let failed = 0
  const errors: Array<{ id: string; error: string }> = []

  // Capture positions for undo before any changes
  if (undo) {
    const positions = new Map<string, { x: number; y: number }>()
    for (const update of params.updates) {
      if (update.x !== undefined && update.y !== undefined) {
        const node = store.getNode(update.id)
        if (node) {
          positions.set(node.id, { x: node.canvas_x, y: node.canvas_y })
        }
      }
    }
    if (positions.size > 0) {
      undo.pushPositionUndo(positions)
    }
  }

  for (const update of params.updates) {
    const node = store.getNode(update.id)
    if (!node) {
      failed++
      errors.push({ id: update.id, error: 'Node not found' })
      continue
    }

    try {
      if (update.title !== undefined) {
        await store.updateNodeTitle(update.id, update.title)
      }

      if (update.content !== undefined) {
        await store.updateNodeContent(update.id, update.content)
      }

      if (update.x !== undefined && update.y !== undefined) {
        const clamped = clampToFrame(node, update.x, update.y, store.getFrame)
        await store.updateNodePosition(update.id, clamped.x, clamped.y)
      }

      updated++
    } catch (e) {
      failed++
      errors.push({ id: update.id, error: e instanceof Error ? e.message : String(e) })
    }
  }

  const result: { success: boolean; updated: number; failed: number; errors?: Array<{ id: string; error: string }> } = {
    success: failed === 0,
    updated,
    failed,
  }

  if (errors.length > 0) {
    result.errors = errors
  }

  return result
}

export async function handleDeleteNode(
  store: McpStoreInterface,
  undo: McpUndoInterface | undefined,
  params: { id: string }
): Promise<{ success: boolean }> {
  const node = store.getNode(params.id)
  if (!node) {
    throw new McpError(
      JsonRpcErrorCodes.INVALID_PARAMS,
      `Node not found: ${params.id}`
    )
  }

  // Capture node and edges for undo before deletion
  if (undo) {
    const connectedEdges = store.getFilteredEdges().filter(
      (e) => e.source_node_id === params.id || e.target_node_id === params.id
    )
    undo.pushDeletionUndo({ ...node }, connectedEdges.map((e) => ({ ...e })))
  }

  await store.deleteNode(params.id)
  return { success: true }
}

export async function handleResizeNode(
  store: McpStoreInterface,
  params: { id: string; width: number; height: number }
): Promise<{ success: boolean }> {
  const node = store.getNode(params.id)
  if (!node) {
    throw new McpError(
      JsonRpcErrorCodes.INVALID_PARAMS,
      `Node not found: ${params.id}`
    )
  }

  await store.updateNodeSize(params.id, params.width, params.height)
  return { success: true }
}

export async function handleBatchResizeNodes(
  store: McpStoreInterface,
  params: { node_ids?: string[]; width: number; height: number }
): Promise<{ success: boolean; count: number }> {
  const nodeIds = params.node_ids?.length
    ? params.node_ids
    : store.getFilteredNodes().map((n) => n.id)

  let count = 0
  for (const id of nodeIds) {
    const node = store.getNode(id)
    if (node) {
      await store.updateNodeSize(id, params.width, params.height)
      count++
    }
  }

  return { success: true, count }
}

export async function handleBatchMoveNodes(
  store: McpStoreInterface,
  undo: McpUndoInterface | undefined,
  params: { moves: Array<{ id: string; x: number; y: number }> }
): Promise<{ success: boolean; count: number }> {
  // Capture positions for undo before any changes
  if (undo && params.moves.length > 0) {
    const positions = new Map<string, { x: number; y: number }>()
    for (const move of params.moves) {
      const node = store.getNode(move.id)
      if (node) {
        positions.set(node.id, { x: node.canvas_x, y: node.canvas_y })
      }
    }
    if (positions.size > 0) {
      undo.pushPositionUndo(positions)
    }
  }

  let count = 0
  for (const move of params.moves) {
    const node = store.getNode(move.id)
    if (node) {
      // Clamp position to keep node inside its frame
      const clamped = clampToFrame(node, move.x, move.y, store.getFrame)
      await store.updateNodePosition(move.id, clamped.x, clamped.y)
      count++
    }
  }

  return { success: true, count }
}

export async function handleSetNodeColor(
  store: McpStoreInterface,
  params: { id: string; color: string | null }
): Promise<{ success: boolean }> {
  const node = store.getNode(params.id)
  if (!node) {
    throw new McpError(
      JsonRpcErrorCodes.INVALID_PARAMS,
      `Node not found: ${params.id}`
    )
  }

  const color = normalizeColor(params.color)
  await store.updateNodeColor(params.id, color)
  return { success: true }
}

export async function handleBatchSetNodeColors(
  store: McpStoreInterface,
  params: { node_ids: string[]; color: string | null }
): Promise<{ success: boolean; count: number }> {
  const color = normalizeColor(params.color)
  let count = 0
  for (const id of params.node_ids) {
    const node = store.getNode(id)
    if (node) {
      await store.updateNodeColor(id, color)
      count++
    }
  }

  return { success: true, count }
}
