/**
 * MCP Message Handler
 *
 * Routes incoming MCP requests to appropriate store methods and returns responses.
 */

import type { Node, Edge, Frame, Storyline } from '../types'
import type {
  JsonRpcRequest,
  JsonRpcResponse,
  McpNode,
  McpEdge,
  McpViewport,
  McpFrame,
  McpStoryline,
} from './types'
import {
  createSuccessResponse,
  createErrorResponse,
  JsonRpcErrorCodes,
} from './types'

/**
 * Store interface for MCP handler
 * Subset of nodes store methods needed by MCP
 * Uses getter functions to support Vue reactive refs/computed
 */
export interface McpStoreInterface {
  // Read operations - use getter functions to support computed refs
  getFilteredNodes: () => Node[]
  getFilteredEdges: () => Edge[]
  getNode: (id: string) => Node | undefined

  // Write operations
  createNode: (data: {
    title: string
    markdown_content?: string
    canvas_x: number
    canvas_y: number
    width?: number
    height?: number
    node_type?: string
  }) => Promise<Node>
  updateNodeContent: (id: string, content: string) => Promise<void>
  updateNodeTitle: (id: string, title: string) => Promise<void>
  updateNodePosition: (id: string, x: number, y: number) => Promise<void>
  updateNodeSize: (id: string, width: number, height: number) => Promise<void>
  updateNodeColor: (id: string, color: string | null) => Promise<void>
  deleteNode: (id: string) => Promise<void>

  // Edge operations
  createEdge: (data: {
    source_node_id: string
    target_node_id: string
    label?: string
    link_type?: string
    directed?: boolean
  }) => Promise<Edge>
  deleteEdge: (id: string) => Promise<void>
  updateEdgeDirected: (id: string, directed: boolean) => Promise<void>

  // Frame operations
  getFilteredFrames: () => Frame[]
  getFrame: (id: string) => Frame | undefined
  createFrame: (x: number, y: number, width: number, height: number, title: string) => Frame
  updateFramePosition: (id: string, x: number, y: number) => Promise<void>
  updateFrameSize: (id: string, width: number, height: number) => Promise<void>
  updateFrameTitle: (id: string, title: string) => Promise<void>
  updateFrameColor: (id: string, color: string | null) => Promise<void>
  deleteFrame: (id: string) => void
  assignNodesToFrame: (nodeIds: string[], frameId: string | null) => void

  // Storyline operations
  getFilteredStorylines: () => Storyline[]
  getStoryline: (id: string) => Storyline | undefined
  getStorylineNodes: (storylineId: string) => Promise<Node[]>
  createStoryline: (title: string, description?: string, color?: string) => Promise<Storyline>
  updateStoryline: (id: string, title: string, description?: string, color?: string) => Promise<void>
  deleteStoryline: (id: string) => Promise<void>
  addNodeToStoryline: (storylineId: string, nodeId: string, position?: number) => Promise<void>
  removeNodeFromStoryline: (storylineId: string, nodeId: string) => Promise<void>
  reorderStorylineNodes: (storylineId: string, nodeIds: string[]) => Promise<void>
}

/**
 * Viewport interface for canvas operations
 */
export interface McpViewportInterface {
  getViewport: () => McpViewport
  focusNode: (id: string) => void
}

/**
 * Undo interface for MCP operations
 * Allows MCP mutations to be undone via Cmd+Z
 */
export interface McpUndoInterface {
  pushPositionUndo: (positions: Map<string, { x: number; y: number }>) => void
  pushDeletionUndo: (node: Node, edges: Edge[]) => void
  pushCreationUndo: (nodeIds: string[]) => void
}

/**
 * Convert internal Node to MCP format
 */
function nodeToMcp(node: Node, includeContent = false): McpNode {
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
function edgeToMcp(edge: Edge): McpEdge {
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
const COLOR_NAME_MAP: Record<string, string> = {
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
function normalizeColor(color: string | null): string | null {
  if (!color) return null
  const lower = color.toLowerCase().trim()
  return COLOR_NAME_MAP[lower] || color
}

/**
 * Convert internal Frame to MCP format
 */
function frameToMcp(frame: Frame): McpFrame {
  return {
    id: frame.id,
    title: frame.title,
    canvas_x: frame.canvas_x,
    canvas_y: frame.canvas_y,
    width: frame.width,
    height: frame.height,
    color: frame.color,
    parent_frame_id: frame.parent_frame_id,
  }
}

/**
 * Clamp a position to keep a node inside its assigned frame
 * Returns the clamped position, or original if node has no frame
 */
function clampToFrame(
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
 * Convert internal Storyline to MCP format
 */
function storylineToMcp(storyline: Storyline): McpStoryline {
  return {
    id: storyline.id,
    title: storyline.title,
    description: storyline.description,
    color: storyline.color,
  }
}

/**
 * Create an MCP message handler with store access
 */
export function createMcpMessageHandler(
  store: McpStoreInterface,
  viewport?: McpViewportInterface,
  undo?: McpUndoInterface
) {
  /**
   * Handle an incoming MCP request and return a response
   */
  async function handleRequest(request: JsonRpcRequest): Promise<JsonRpcResponse> {
    try {
      const result = await routeRequest(request)
      return createSuccessResponse(request.id, result)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)

      // Check for specific error types
      if (message.includes('not found')) {
        return createErrorResponse(
          request.id,
          JsonRpcErrorCodes.INVALID_PARAMS,
          message
        )
      }

      return createErrorResponse(
        request.id,
        JsonRpcErrorCodes.INTERNAL_ERROR,
        message
      )
    }
  }

  /**
   * Route request to appropriate handler
   */
  async function routeRequest(request: JsonRpcRequest): Promise<unknown> {
    const params = request.params || {}

    switch (request.method) {
      // Read operations
      case 'get_graph_summary':
        return handleGetGraphSummary()

      case 'list_nodes':
        return handleListNodes(params as { include_content?: boolean; limit?: number; offset?: number })

      case 'get_node':
        return handleGetNode(params as { id: string })

      case 'get_node_neighbors':
        return handleGetNodeNeighbors(params as { id: string; depth?: number })

      case 'get_graph_structure':
        return handleGetGraphStructure(params as { limit?: number })

      case 'search_nodes':
        return handleSearchNodes(params as { query: string })

      case 'get_orphan_nodes':
        return handleGetOrphanNodes()

      case 'get_leaf_nodes':
        return handleGetLeafNodes()

      case 'get_root_nodes':
        return handleGetRootNodes()

      case 'get_hub_nodes':
        return handleGetHubNodes(params as { limit?: number })

      case 'get_nodes_by_color':
        return handleGetNodesByColor(params as { color: string })

      case 'get_edges':
        return handleGetEdges(params as { node_id?: string; limit?: number; offset?: number })

      // Write operations
      case 'create_node':
        return handleCreateNode(
          params as {
            title: string
            content?: string
            x?: number
            y?: number
            node_type?: string
          }
        )

      case 'update_node':
        return handleUpdateNode(
          params as {
            id: string
            updates: {
              title?: string
              content?: string
              x?: number
              y?: number
            }
          }
        )

      case 'delete_node':
        return handleDeleteNode(params as { id: string })

      case 'resize_node':
        return handleResizeNode(params as { id: string; width: number; height: number })

      case 'batch_resize_nodes':
        return handleBatchResizeNodes(params as { node_ids?: string[]; width: number; height: number })

      case 'batch_move_nodes':
        return handleBatchMoveNodes(params as { moves: Array<{ id: string; x: number; y: number }> })

      case 'set_node_color':
        return handleSetNodeColor(params as { id: string; color: string | null })

      case 'batch_set_node_colors':
        return handleBatchSetNodeColors(params as { node_ids: string[]; color: string | null })

      // Edge operations
      case 'create_edge':
        return handleCreateEdge(
          params as {
            source_node_id: string
            target_node_id: string
            label?: string
            link_type?: string
            directed?: boolean
          }
        )

      case 'update_edge':
        return handleUpdateEdge(
          params as {
            id: string
            label?: string
            directed?: boolean
          }
        )

      case 'delete_edge':
        return handleDeleteEdge(params as { id: string })

      case 'batch_create_edges':
        return handleBatchCreateEdges(params as { edges: Array<{ source_node_id: string; target_node_id: string; label?: string; link_type?: string }> })

      case 'batch_delete_edges':
        return handleBatchDeleteEdges(params as { edge_ids: string[] })

      case 'delete_edges_for_node':
        return handleDeleteEdgesForNode(params as { node_id: string; direction?: 'incoming' | 'outgoing' | 'both' })

      case 'arrange_radial':
        return handleArrangeRadial(params as { center_node_id: string; node_ids?: string[]; radius?: number })

      // Frame operations
      case 'list_frames':
        return handleListFrames()

      case 'get_frame':
        return handleGetFrame(params as { id: string })

      case 'create_frame':
        return handleCreateFrame(params as { title: string; x?: number; y?: number; width?: number; height?: number })

      case 'update_frame':
        return handleUpdateFrame(params as { id: string; updates: { title?: string; x?: number; y?: number; width?: number; height?: number; color?: string | null } })

      case 'delete_frame':
        return handleDeleteFrame(params as { id: string })

      case 'get_nodes_in_frame':
        return handleGetNodesInFrame(params as { frame_id: string })

      case 'assign_node_to_frame':
        return handleAssignNodeToFrame(params as { node_id: string; frame_id: string })

      case 'remove_node_from_frame':
        return handleRemoveNodeFromFrame(params as { node_id: string })

      case 'batch_assign_nodes_to_frame':
        return handleBatchAssignNodesToFrame(params as { node_ids: string[]; frame_id?: string | null })

      case 'batch_move_frames':
        return handleBatchMoveFrames(params as { moves: Array<{ id: string; x: number; y: number }> })

      case 'batch_resize_frames':
        return handleBatchResizeFrames(params as { resizes: Array<{ id: string; width: number; height: number }> })

      case 'fit_frame_to_contents':
        return handleFitFrameToContents(params as { frame_id: string })

      case 'fit_all_frames':
        return handleFitAllFrames()

      case 'check_frame_overlaps':
        return handleCheckFrameOverlaps()

      case 'resolve_frame_overlaps':
        return handleResolveFrameOverlaps()

      // Storyline operations
      case 'list_storylines':
        return handleListStorylines()

      case 'get_storyline':
        return handleGetStoryline(params as { id: string })

      case 'get_storyline_nodes':
        return handleGetStorylineNodes(params as { storyline_id: string })

      case 'create_storyline':
        return handleCreateStoryline(params as { title: string; description?: string; color?: string })

      case 'update_storyline':
        return handleUpdateStoryline(params as { id: string; title?: string; description?: string; color?: string })

      case 'delete_storyline':
        return handleDeleteStoryline(params as { id: string })

      case 'add_node_to_storyline':
        return handleAddNodeToStoryline(params as { storyline_id: string; node_id: string; position?: number })

      case 'remove_node_from_storyline':
        return handleRemoveNodeFromStoryline(params as { storyline_id: string; node_id: string })

      case 'reorder_storyline_nodes':
        return handleReorderStorylineNodes(params as { storyline_id: string; node_ids: string[] })

      // Canvas operations
      case 'get_viewport':
        return handleGetViewport()

      case 'focus_node':
        return handleFocusNode(params as { id: string })

      default:
        throw new McpError(
          JsonRpcErrorCodes.METHOD_NOT_FOUND,
          `Method not found: ${request.method}`
        )
    }
  }

  // Handler implementations

  function handleGetGraphSummary(): {
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

  function handleListNodes(params: { include_content?: boolean; limit?: number; offset?: number }): McpNode[] {
    const limit = params.limit ?? 50
    const offset = params.offset ?? 0

    return store.getFilteredNodes()
      .slice(offset, offset + limit)
      .map((node) => nodeToMcp(node, params.include_content))
  }

  function handleGetNode(params: { id: string }): McpNode {
    const node = store.getNode(params.id)
    if (!node) {
      throw new McpError(
        JsonRpcErrorCodes.INVALID_PARAMS,
        `Node not found: ${params.id}`
      )
    }
    return nodeToMcp(node, true)
  }

  function handleGetNodeNeighbors(params: { id: string; depth?: number }): {
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

  function handleGetGraphStructure(params: { limit?: number }): Record<string, { title: string; connections: string[] }> {
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

  function handleSearchNodes(params: { query: string }): Array<{ id: string; title: string }> {
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

  function handleGetOrphanNodes(): Array<{ id: string; title: string }> {
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

  function handleGetLeafNodes(): Array<{ id: string; title: string }> {
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

  function handleGetRootNodes(): Array<{ id: string; title: string }> {
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

  function handleGetHubNodes(params: { limit?: number }): Array<{ id: string; title: string; connections: number }> {
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

  function handleGetNodesByColor(params: { color: string }): Array<{ id: string; title: string }> {
    return store.getFilteredNodes()
      .filter((node) => node.color_theme === params.color)
      .map((node) => ({ id: node.id, title: node.title }))
  }

  function handleGetEdges(params: { node_id?: string; limit?: number; offset?: number }): McpEdge[] {
    const limit = params.limit ?? 100
    const offset = params.offset ?? 0

    let edges = store.getFilteredEdges()

    // Filter by node if specified
    if (params.node_id) {
      edges = edges.filter(
        (e) => e.source_node_id === params.node_id || e.target_node_id === params.node_id
      )
    }

    return edges.slice(offset, offset + limit).map(edgeToMcp)
  }

  async function handleCreateNode(params: {
    title: string
    content?: string
    x?: number
    y?: number
    node_type?: string
  }): Promise<{ id: string; warning?: string; duplicate_ids?: string[] }> {
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

  async function handleUpdateNode(params: {
    id: string
    updates: {
      title?: string
      content?: string
      x?: number
      y?: number
    }
  }): Promise<{ success: boolean }> {
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

  async function handleDeleteNode(params: { id: string }): Promise<{ success: boolean }> {
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

  async function handleResizeNode(params: { id: string; width: number; height: number }): Promise<{ success: boolean }> {
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

  async function handleBatchResizeNodes(params: { node_ids?: string[]; width: number; height: number }): Promise<{ success: boolean; count: number }> {
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

  async function handleBatchMoveNodes(params: { moves: Array<{ id: string; x: number; y: number }> }): Promise<{ success: boolean; count: number }> {
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

  async function handleSetNodeColor(params: { id: string; color: string | null }): Promise<{ success: boolean }> {
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

  async function handleBatchSetNodeColors(params: { node_ids: string[]; color: string | null }): Promise<{ success: boolean; count: number }> {
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

  async function handleCreateEdge(params: {
    source_node_id: string
    target_node_id: string
    label?: string
    link_type?: string
    directed?: boolean
  }): Promise<{ id: string }> {
    // Validate nodes exist
    if (!store.getNode(params.source_node_id)) {
      throw new McpError(
        JsonRpcErrorCodes.INVALID_PARAMS,
        `Source node not found: ${params.source_node_id}`
      )
    }
    if (!store.getNode(params.target_node_id)) {
      throw new McpError(
        JsonRpcErrorCodes.INVALID_PARAMS,
        `Target node not found: ${params.target_node_id}`
      )
    }

    const edge = await store.createEdge({
      source_node_id: params.source_node_id,
      target_node_id: params.target_node_id,
      label: params.label,
      link_type: params.link_type || 'related',
      directed: params.directed ?? true,
    })

    return { id: edge.id }
  }

  async function handleUpdateEdge(params: {
    id: string
    label?: string
    directed?: boolean
  }): Promise<{ success: boolean }> {
    const edge = store.getFilteredEdges().find((e) => e.id === params.id)
    if (!edge) {
      throw new McpError(
        JsonRpcErrorCodes.INVALID_PARAMS,
        `Edge not found: ${params.id}`
      )
    }

    if (params.directed !== undefined) {
      await store.updateEdgeDirected(params.id, params.directed)
    }

    return { success: true }
  }

  async function handleDeleteEdge(params: { id: string }): Promise<{ success: boolean }> {
    const edge = store.getFilteredEdges().find((e) => e.id === params.id)
    if (!edge) {
      throw new McpError(
        JsonRpcErrorCodes.INVALID_PARAMS,
        `Edge not found: ${params.id}`
      )
    }

    await store.deleteEdge(params.id)
    return { success: true }
  }

  async function handleBatchCreateEdges(params: { edges: Array<{ source_node_id: string; target_node_id: string; label?: string; link_type?: string }> }): Promise<{ success: boolean; count: number; ids: string[] }> {
    const ids: string[] = []
    for (const edgeData of params.edges) {
      // Validate nodes exist
      if (!store.getNode(edgeData.source_node_id) || !store.getNode(edgeData.target_node_id)) {
        continue
      }
      const edge = await store.createEdge({
        source_node_id: edgeData.source_node_id,
        target_node_id: edgeData.target_node_id,
        label: edgeData.label,
        link_type: edgeData.link_type || 'related',
        directed: true,
      })
      ids.push(edge.id)
    }
    return { success: true, count: ids.length, ids }
  }

  async function handleBatchDeleteEdges(params: { edge_ids: string[] }): Promise<{ success: boolean; count: number }> {
    let count = 0
    for (const id of params.edge_ids) {
      const edge = store.getFilteredEdges().find((e) => e.id === id)
      if (edge) {
        await store.deleteEdge(id)
        count++
      }
    }
    return { success: true, count }
  }

  async function handleDeleteEdgesForNode(params: { node_id: string; direction?: 'incoming' | 'outgoing' | 'both' }): Promise<{ success: boolean; count: number }> {
    const direction = params.direction || 'both'
    const edges = store.getFilteredEdges().filter((e) => {
      if (direction === 'outgoing') return e.source_node_id === params.node_id
      if (direction === 'incoming') return e.target_node_id === params.node_id
      return e.source_node_id === params.node_id || e.target_node_id === params.node_id
    })

    for (const edge of edges) {
      await store.deleteEdge(edge.id)
    }

    return { success: true, count: edges.length }
  }

  async function handleArrangeRadial(params: { center_node_id: string; node_ids?: string[]; radius?: number }): Promise<{ success: boolean; count: number }> {
    const centerNode = store.getNode(params.center_node_id)
    if (!centerNode) {
      throw new McpError(
        JsonRpcErrorCodes.INVALID_PARAMS,
        `Center node not found: ${params.center_node_id}`
      )
    }

    const radius = params.radius || 300
    let nodeIds = params.node_ids

    // If no node_ids provided, use connected nodes
    if (!nodeIds || nodeIds.length === 0) {
      const edges = store.getFilteredEdges().filter(
        (e) => e.source_node_id === params.center_node_id || e.target_node_id === params.center_node_id
      )
      nodeIds = [...new Set(edges.map((e) =>
        e.source_node_id === params.center_node_id ? e.target_node_id : e.source_node_id
      ))]
    }

    const angleStep = (2 * Math.PI) / nodeIds.length
    let count = 0

    for (let i = 0; i < nodeIds.length; i++) {
      const node = store.getNode(nodeIds[i])
      if (node) {
        const angle = i * angleStep - Math.PI / 2 // Start from top
        const x = centerNode.canvas_x + radius * Math.cos(angle)
        const y = centerNode.canvas_y + radius * Math.sin(angle)
        await store.updateNodePosition(nodeIds[i], x, y)
        count++
      }
    }

    return { success: true, count }
  }

  // Frame handlers

  function handleListFrames(): McpFrame[] {
    return store.getFilteredFrames().map(frameToMcp)
  }

  function handleGetFrame(params: { id: string }): McpFrame {
    const frame = store.getFrame(params.id)
    if (!frame) {
      throw new McpError(
        JsonRpcErrorCodes.INVALID_PARAMS,
        `Frame not found: ${params.id}`
      )
    }
    return frameToMcp(frame)
  }

  function handleCreateFrame(params: { title: string; x?: number; y?: number; width?: number; height?: number }): { id: string } {
    const frame = store.createFrame(
      params.x ?? 100,
      params.y ?? 100,
      params.width ?? 400,
      params.height ?? 300,
      params.title
    )
    return { id: frame.id }
  }

  async function handleUpdateFrame(params: {
    id: string
    updates: { title?: string; x?: number; y?: number; width?: number; height?: number; color?: string | null }
  }): Promise<{ success: boolean }> {
    const frame = store.getFrame(params.id)
    if (!frame) {
      throw new McpError(
        JsonRpcErrorCodes.INVALID_PARAMS,
        `Frame not found: ${params.id}`
      )
    }

    const { updates } = params

    if (updates.title !== undefined) {
      await store.updateFrameTitle(params.id, updates.title)
    }

    if (updates.x !== undefined && updates.y !== undefined) {
      await store.updateFramePosition(params.id, updates.x, updates.y)
    }

    if (updates.width !== undefined && updates.height !== undefined) {
      await store.updateFrameSize(params.id, updates.width, updates.height)
    }

    if (updates.color !== undefined) {
      const color = normalizeColor(updates.color)
      await store.updateFrameColor(params.id, color)
    }

    return { success: true }
  }

  function handleDeleteFrame(params: { id: string }): { success: boolean } {
    const frame = store.getFrame(params.id)
    if (!frame) {
      throw new McpError(
        JsonRpcErrorCodes.INVALID_PARAMS,
        `Frame not found: ${params.id}`
      )
    }

    store.deleteFrame(params.id)
    return { success: true }
  }

  function handleGetNodesInFrame(params: { frame_id: string }): Array<{ id: string; title: string; frame_id: string | null }> {
    const frame = store.getFrame(params.frame_id)
    if (!frame) {
      throw new McpError(
        JsonRpcErrorCodes.INVALID_PARAMS,
        `Frame not found: ${params.frame_id}`
      )
    }

    // Find nodes assigned to this frame
    const nodes = store.getFilteredNodes().filter((node) => node.frame_id === params.frame_id)

    return nodes.map((n) => ({ id: n.id, title: n.title, frame_id: n.frame_id }))
  }

  // Helper: Fit frame to its nodes and resolve overlaps with other frames
  async function fitFrameToNodesAndResolveOverlaps(frameId: string): Promise<void> {
    const frame = store.getFrame(frameId)
    if (!frame) return

    const padding = 20
    const titleHeight = 50

    // Get all nodes in this frame
    const nodesInFrame = store.getFilteredNodes().filter((n) => n.frame_id === frameId)
    if (nodesInFrame.length === 0) return

    // Calculate bounding box of all nodes
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const node of nodesInFrame) {
      minX = Math.min(minX, node.canvas_x)
      minY = Math.min(minY, node.canvas_y)
      maxX = Math.max(maxX, node.canvas_x + node.width)
      maxY = Math.max(maxY, node.canvas_y + node.height)
    }

    // Calculate required frame size with padding
    const requiredWidth = maxX - minX + padding * 2
    const requiredHeight = maxY - minY + padding * 2 + titleHeight

    // Only resize if needed (frame too small)
    const newWidth = Math.max(frame.width, requiredWidth)
    const newHeight = Math.max(frame.height, requiredHeight)

    if (newWidth !== frame.width || newHeight !== frame.height) {
      await store.updateFrameSize(frameId, newWidth, newHeight)
    }

    // Resolve overlaps with other frames
    const allFrames = store.getFilteredFrames()
    const updatedFrame = store.getFrame(frameId)
    if (!updatedFrame) return

    for (const otherFrame of allFrames) {
      if (otherFrame.id === frameId) continue

      // Check for overlap
      const overlap = !(
        updatedFrame.canvas_x + updatedFrame.width < otherFrame.canvas_x ||
        otherFrame.canvas_x + otherFrame.width < updatedFrame.canvas_x ||
        updatedFrame.canvas_y + updatedFrame.height < otherFrame.canvas_y ||
        otherFrame.canvas_y + otherFrame.height < updatedFrame.canvas_y
      )

      if (overlap) {
        // Push other frame to the right
        const newX = updatedFrame.canvas_x + updatedFrame.width + 20
        await store.updateFramePosition(otherFrame.id, newX, otherFrame.canvas_y)
      }
    }
  }

  async function handleAssignNodeToFrame(params: { node_id: string; frame_id: string }): Promise<{ success: boolean; moved: boolean }> {
    const node = store.getNode(params.node_id)
    if (!node) {
      throw new McpError(
        JsonRpcErrorCodes.INVALID_PARAMS,
        `Node not found: ${params.node_id}`
      )
    }

    const frame = store.getFrame(params.frame_id)
    if (!frame) {
      throw new McpError(
        JsonRpcErrorCodes.INVALID_PARAMS,
        `Frame not found: ${params.frame_id}`
      )
    }

    store.assignNodesToFrame([params.node_id], params.frame_id)

    // Move node inside frame if it's outside
    const padding = 20
    const nodeRight = node.canvas_x + node.width
    const nodeBottom = node.canvas_y + node.height
    const frameRight = frame.canvas_x + frame.width - padding
    const frameBottom = frame.canvas_y + frame.height - padding

    const isOutside =
      node.canvas_x < frame.canvas_x + padding ||
      node.canvas_y < frame.canvas_y + padding ||
      nodeRight > frameRight ||
      nodeBottom > frameBottom

    let moved = false
    if (isOutside) {
      // Place node at top-left of frame with padding
      const newX = frame.canvas_x + padding
      const newY = frame.canvas_y + padding + 40 // Extra space for frame title
      await store.updateNodePosition(params.node_id, newX, newY)
      moved = true
    }

    // Fit frame to nodes and resolve overlaps
    await fitFrameToNodesAndResolveOverlaps(params.frame_id)

    return { success: true, moved }
  }

  function handleRemoveNodeFromFrame(params: { node_id: string }): { success: boolean } {
    const node = store.getNode(params.node_id)
    if (!node) {
      throw new McpError(
        JsonRpcErrorCodes.INVALID_PARAMS,
        `Node not found: ${params.node_id}`
      )
    }

    store.assignNodesToFrame([params.node_id], null)
    return { success: true }
  }

  async function handleBatchAssignNodesToFrame(params: { node_ids: string[]; frame_id?: string | null }): Promise<{ success: boolean; count: number; moved: number }> {
    const frameId = params.frame_id ?? null

    // Validate frame exists if assigning to a frame
    const frame = frameId !== null ? store.getFrame(frameId) : null
    if (frameId !== null && !frame) {
      throw new McpError(
        JsonRpcErrorCodes.INVALID_PARAMS,
        `Frame not found: ${frameId}`
      )
    }

    // Filter to valid nodes
    const validNodeIds = params.node_ids.filter((id) => store.getNode(id))
    store.assignNodesToFrame(validNodeIds, frameId)

    // Move nodes inside frame if assigning to a frame
    let movedCount = 0
    if (frame) {
      const padding = 20
      const frameLeft = frame.canvas_x + padding
      const frameTop = frame.canvas_y + padding + 40 // Extra space for frame title
      const frameRight = frame.canvas_x + frame.width - padding
      const frameBottom = frame.canvas_y + frame.height - padding

      for (let i = 0; i < validNodeIds.length; i++) {
        const node = store.getNode(validNodeIds[i])
        if (!node) continue

        const nodeRight = node.canvas_x + node.width
        const nodeBottom = node.canvas_y + node.height

        const isOutside =
          node.canvas_x < frameLeft ||
          node.canvas_y < frameTop ||
          nodeRight > frameRight ||
          nodeBottom > frameBottom

        if (isOutside) {
          // Stack nodes vertically inside frame
          const newX = frameLeft
          const newY = frameTop + i * (node.height + 10)
          await store.updateNodePosition(validNodeIds[i], newX, newY)
          movedCount++
        }
      }

      // Fit frame to nodes and resolve overlaps
      await fitFrameToNodesAndResolveOverlaps(frameId)
    }

    return { success: true, count: validNodeIds.length, moved: movedCount }
  }

  // Batch frame operations

  async function handleBatchMoveFrames(params: { moves: Array<{ id: string; x: number; y: number }> }): Promise<{ success: boolean; count: number }> {
    let count = 0
    for (const move of params.moves) {
      const frame = store.getFrame(move.id)
      if (!frame) continue

      // Calculate delta to move nodes with frame
      const dx = move.x - frame.canvas_x
      const dy = move.y - frame.canvas_y

      // Move frame
      await store.updateFramePosition(move.id, move.x, move.y)

      // Move all nodes assigned to this frame
      const nodesInFrame = store.getFilteredNodes().filter((n) => n.frame_id === move.id)
      for (const node of nodesInFrame) {
        await store.updateNodePosition(node.id, node.canvas_x + dx, node.canvas_y + dy)
      }

      count++
    }

    return { success: true, count }
  }

  async function handleBatchResizeFrames(params: { resizes: Array<{ id: string; width: number; height: number }> }): Promise<{ success: boolean; count: number }> {
    let count = 0
    for (const resize of params.resizes) {
      const frame = store.getFrame(resize.id)
      if (!frame) continue

      await store.updateFrameSize(resize.id, resize.width, resize.height)

      // Pull nodes inside if they would be outside after resize
      await pullNodesInsideFrame(resize.id)

      count++
    }

    return { success: true, count }
  }

  // Helper: Pull nodes inside frame bounds
  async function pullNodesInsideFrame(frameId: string): Promise<void> {
    const frame = store.getFrame(frameId)
    if (!frame) return

    const padding = 20
    const titleHeight = 50
    const nodesInFrame = store.getFilteredNodes().filter((n) => n.frame_id === frameId)

    for (const node of nodesInFrame) {
      const minX = frame.canvas_x + padding
      const minY = frame.canvas_y + padding + titleHeight
      const maxX = frame.canvas_x + frame.width - node.width - padding
      const maxY = frame.canvas_y + frame.height - node.height - padding

      // Check if node is outside
      if (node.canvas_x < minX || node.canvas_x > maxX || node.canvas_y < minY || node.canvas_y > maxY) {
        const newX = Math.max(minX, Math.min(maxX, node.canvas_x))
        const newY = Math.max(minY, Math.min(maxY, node.canvas_y))
        await store.updateNodePosition(node.id, newX, newY)
      }
    }
  }

  async function handleFitFrameToContents(params: { frame_id: string }): Promise<{ success: boolean; resized: boolean }> {
    const frame = store.getFrame(params.frame_id)
    if (!frame) {
      throw new McpError(
        JsonRpcErrorCodes.INVALID_PARAMS,
        `Frame not found: ${params.frame_id}`
      )
    }

    await fitFrameToNodesAndResolveOverlaps(params.frame_id)
    return { success: true, resized: true }
  }

  async function handleFitAllFrames(): Promise<{ success: boolean; count: number }> {
    const frames = store.getFilteredFrames()
    let count = 0

    for (const frame of frames) {
      const nodesInFrame = store.getFilteredNodes().filter((n) => n.frame_id === frame.id)
      if (nodesInFrame.length > 0) {
        await fitFrameToNodesAndResolveOverlaps(frame.id)
        count++
      }
    }

    // Final pass to resolve any remaining overlaps
    await handleResolveFrameOverlaps()

    return { success: true, count }
  }

  // Frame overlap detection and resolution

  function handleCheckFrameOverlaps(): Array<{ frame1: { id: string; title: string }; frame2: { id: string; title: string }; overlap: { x: number; y: number; width: number; height: number } }> {
    const frames = store.getFilteredFrames()
    const overlaps: Array<{ frame1: { id: string; title: string }; frame2: { id: string; title: string }; overlap: { x: number; y: number; width: number; height: number } }> = []

    for (let i = 0; i < frames.length; i++) {
      for (let j = i + 1; j < frames.length; j++) {
        const f1 = frames[i]
        const f2 = frames[j]

        // Calculate overlap rectangle
        const overlapX = Math.max(f1.canvas_x, f2.canvas_x)
        const overlapY = Math.max(f1.canvas_y, f2.canvas_y)
        const overlapRight = Math.min(f1.canvas_x + f1.width, f2.canvas_x + f2.width)
        const overlapBottom = Math.min(f1.canvas_y + f1.height, f2.canvas_y + f2.height)

        if (overlapRight > overlapX && overlapBottom > overlapY) {
          overlaps.push({
            frame1: { id: f1.id, title: f1.title },
            frame2: { id: f2.id, title: f2.title },
            overlap: {
              x: overlapX,
              y: overlapY,
              width: overlapRight - overlapX,
              height: overlapBottom - overlapY,
            },
          })
        }
      }
    }

    return overlaps
  }

  async function handleResolveFrameOverlaps(): Promise<{ success: boolean; resolved: number }> {
    const frames = store.getFilteredFrames()
    let resolved = 0

    // Sort frames by x position (left to right)
    const sortedFrames = [...frames].sort((a, b) => a.canvas_x - b.canvas_x)

    for (let i = 0; i < sortedFrames.length; i++) {
      const frame = sortedFrames[i]

      for (let j = i + 1; j < sortedFrames.length; j++) {
        const otherFrame = sortedFrames[j]

        // Check for overlap
        const overlaps = !(
          frame.canvas_x + frame.width < otherFrame.canvas_x ||
          otherFrame.canvas_x + otherFrame.width < frame.canvas_x ||
          frame.canvas_y + frame.height < otherFrame.canvas_y ||
          otherFrame.canvas_y + otherFrame.height < frame.canvas_y
        )

        if (overlaps) {
          // Push other frame to the right
          const newX = frame.canvas_x + frame.width + 20
          await store.updateFramePosition(otherFrame.id, newX, otherFrame.canvas_y)
          // Update local reference for cascade resolution
          otherFrame.canvas_x = newX
          resolved++
        }
      }
    }

    return { success: true, resolved }
  }

  // Storyline handlers

  function handleListStorylines(): McpStoryline[] {
    return store.getFilteredStorylines().map(storylineToMcp)
  }

  function handleGetStoryline(params: { id: string }): McpStoryline {
    const storyline = store.getStoryline(params.id)
    if (!storyline) {
      throw new McpError(
        JsonRpcErrorCodes.INVALID_PARAMS,
        `Storyline not found: ${params.id}`
      )
    }
    return storylineToMcp(storyline)
  }

  async function handleGetStorylineNodes(params: { storyline_id: string }): Promise<Array<{ id: string; title: string; position: number }>> {
    const storyline = store.getStoryline(params.storyline_id)
    if (!storyline) {
      throw new McpError(
        JsonRpcErrorCodes.INVALID_PARAMS,
        `Storyline not found: ${params.storyline_id}`
      )
    }

    const nodes = await store.getStorylineNodes(params.storyline_id)
    return nodes.map((node, index) => ({
      id: node.id,
      title: node.title,
      position: index,
    }))
  }

  async function handleCreateStoryline(params: { title: string; description?: string; color?: string }): Promise<{ id: string }> {
    const color = normalizeColor(params.color || null)
    const storyline = await store.createStoryline(params.title, params.description, color || undefined)
    return { id: storyline.id }
  }

  async function handleUpdateStoryline(params: { id: string; title?: string; description?: string; color?: string }): Promise<{ success: boolean }> {
    const storyline = store.getStoryline(params.id)
    if (!storyline) {
      throw new McpError(
        JsonRpcErrorCodes.INVALID_PARAMS,
        `Storyline not found: ${params.id}`
      )
    }

    const color = params.color !== undefined ? normalizeColor(params.color) : storyline.color
    await store.updateStoryline(
      params.id,
      params.title ?? storyline.title,
      params.description ?? storyline.description ?? undefined,
      color ?? undefined
    )
    return { success: true }
  }

  async function handleDeleteStoryline(params: { id: string }): Promise<{ success: boolean }> {
    const storyline = store.getStoryline(params.id)
    if (!storyline) {
      throw new McpError(
        JsonRpcErrorCodes.INVALID_PARAMS,
        `Storyline not found: ${params.id}`
      )
    }

    await store.deleteStoryline(params.id)
    return { success: true }
  }

  async function handleAddNodeToStoryline(params: { storyline_id: string; node_id: string; position?: number }): Promise<{ success: boolean }> {
    const storyline = store.getStoryline(params.storyline_id)
    if (!storyline) {
      throw new McpError(
        JsonRpcErrorCodes.INVALID_PARAMS,
        `Storyline not found: ${params.storyline_id}`
      )
    }

    const node = store.getNode(params.node_id)
    if (!node) {
      throw new McpError(
        JsonRpcErrorCodes.INVALID_PARAMS,
        `Node not found: ${params.node_id}`
      )
    }

    await store.addNodeToStoryline(params.storyline_id, params.node_id, params.position)
    return { success: true }
  }

  async function handleRemoveNodeFromStoryline(params: { storyline_id: string; node_id: string }): Promise<{ success: boolean }> {
    const storyline = store.getStoryline(params.storyline_id)
    if (!storyline) {
      throw new McpError(
        JsonRpcErrorCodes.INVALID_PARAMS,
        `Storyline not found: ${params.storyline_id}`
      )
    }

    await store.removeNodeFromStoryline(params.storyline_id, params.node_id)
    return { success: true }
  }

  async function handleReorderStorylineNodes(params: { storyline_id: string; node_ids: string[] }): Promise<{ success: boolean }> {
    const storyline = store.getStoryline(params.storyline_id)
    if (!storyline) {
      throw new McpError(
        JsonRpcErrorCodes.INVALID_PARAMS,
        `Storyline not found: ${params.storyline_id}`
      )
    }

    await store.reorderStorylineNodes(params.storyline_id, params.node_ids)
    return { success: true }
  }

  function handleGetViewport(): McpViewport {
    if (!viewport) {
      return { x: 0, y: 0, zoom: 1 }
    }
    return viewport.getViewport()
  }

  function handleFocusNode(params: { id: string }): { success: boolean } {
    const node = store.getNode(params.id)
    if (!node) {
      throw new McpError(
        JsonRpcErrorCodes.INVALID_PARAMS,
        `Node not found: ${params.id}`
      )
    }

    if (viewport) {
      viewport.focusNode(params.id)
    }

    return { success: true }
  }

  return { handleRequest }
}

/**
 * Custom error class for MCP errors
 */
class McpError extends Error {
  code: number

  constructor(code: number, message: string) {
    super(message)
    this.code = code
    this.name = 'McpError'
  }
}
