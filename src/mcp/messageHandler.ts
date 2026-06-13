/**
 * MCP Message Handler
 *
 * Routes incoming MCP requests to appropriate store methods and returns responses.
 */

import type { Node, Edge, Frame, Storyline } from '../types'
import type {
  JsonRpcRequest,
  JsonRpcResponse,
  McpViewport,
} from './types'
import {
  createSuccessResponse,
  createErrorResponse,
  JsonRpcErrorCodes,
} from './types'

// Import handlers from organized modules
import {
  McpError,
  handleGetGraphSummary,
  handleListNodes,
  handleGetNode,
  handleGetNodeNeighbors,
  handleGetGraphStructure,
  handleSearchNodes,
  handleGetOrphanNodes,
  handleGetConnectedComponents,
  handleGetLeafNodes,
  handleGetRootNodes,
  handleGetHubNodes,
  handleGetNodesByColor,
  handleCreateNode,
  handleUpdateNode,
  handleBatchUpdateNodes,
  handleDeleteNode,
  handleResizeNode,
  handleBatchResizeNodes,
  handleBatchMoveNodes,
  handleSetNodeColor,
  handleBatchSetNodeColors,
  handleGetEdges,
  handleCreateEdge,
  handleUpdateEdge,
  handleDeleteEdge,
  handleBatchCreateEdges,
  handleBatchDeleteEdges,
  handleDeleteEdgesForNode,
  handleGetDuplicateEdges,
  handleCleanupDuplicateEdges,
  handleArrangeRadial,
  handleListFrames,
  handleGetFrame,
  handleCreateFrame,
  handleUpdateFrame,
  handleDeleteFrame,
  handleGetNodesInFrame,
  handleAssignNodeToFrame,
  handleRemoveNodeFromFrame,
  handleBatchAssignNodesToFrame,
  handleBatchMoveFrames,
  handleBatchResizeFrames,
  handleFitFrameToContents,
  handleFitAllFrames,
  handleCheckFrameOverlaps,
  handleResolveFrameOverlaps,
  handleListStorylines,
  handleGetStoryline,
  handleGetStorylineNodes,
  handleCreateStoryline,
  handleUpdateStoryline,
  handleDeleteStoryline,
  handleAddNodeToStoryline,
  handleRemoveNodeFromStoryline,
  handleReorderStorylineNodes,
} from './handlers'

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
        return handleGetGraphSummary(store)

      case 'list_nodes':
        return handleListNodes(store, params as { include_content?: boolean; limit?: number; offset?: number })

      case 'get_node':
        return handleGetNode(store, params as { id: string })

      case 'get_node_neighbors':
        return handleGetNodeNeighbors(store, params as { id: string; depth?: number })

      case 'get_graph_structure':
        return handleGetGraphStructure(store, params as { limit?: number })

      case 'search_nodes':
        return handleSearchNodes(store, params as { query: string })

      case 'get_orphan_nodes':
        return handleGetOrphanNodes(store)

      case 'get_connected_components':
        return handleGetConnectedComponents(store)

      case 'get_leaf_nodes':
        return handleGetLeafNodes(store)

      case 'get_root_nodes':
        return handleGetRootNodes(store)

      case 'get_hub_nodes':
        return handleGetHubNodes(store, params as { limit?: number })

      case 'get_nodes_by_color':
        return handleGetNodesByColor(store, params as { color: string })

      case 'get_edges':
        return handleGetEdges(store, params as { node_id?: string; limit?: number; offset?: number })

      // Write operations
      case 'create_node':
        return handleCreateNode(
          store,
          undo,
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
          store,
          undo,
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

      case 'batch_update_nodes':
        return handleBatchUpdateNodes(
          store,
          undo,
          params as {
            updates: Array<{
              id: string
              title?: string
              content?: string
              x?: number
              y?: number
            }>
          }
        )

      case 'delete_node':
        return handleDeleteNode(store, undo, params as { id: string })

      case 'resize_node':
        return handleResizeNode(store, params as { id: string; width: number; height: number })

      case 'batch_resize_nodes':
        return handleBatchResizeNodes(store, params as { node_ids?: string[]; width: number; height: number })

      case 'batch_move_nodes':
        return handleBatchMoveNodes(store, undo, params as { moves: Array<{ id: string; x: number; y: number }> })

      case 'set_node_color':
        return handleSetNodeColor(store, params as { id: string; color: string | null })

      case 'batch_set_node_colors':
        return handleBatchSetNodeColors(store, params as { node_ids: string[]; color: string | null })

      // Edge operations
      case 'create_edge':
        return handleCreateEdge(
          store,
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
          store,
          params as {
            id: string
            label?: string
            directed?: boolean
          }
        )

      case 'delete_edge':
        return handleDeleteEdge(store, params as { id: string })

      case 'batch_create_edges':
        return handleBatchCreateEdges(store, params as { edges: Array<{ source_node_id: string; target_node_id: string; label?: string; link_type?: string }> })

      case 'batch_delete_edges':
        return handleBatchDeleteEdges(store, params as { edge_ids: string[] })

      case 'delete_edges_for_node':
        return handleDeleteEdgesForNode(store, params as { node_id: string; direction?: 'incoming' | 'outgoing' | 'both' })

      case 'get_duplicate_edges':
        return handleGetDuplicateEdges(store)

      case 'cleanup_duplicate_edges':
        return handleCleanupDuplicateEdges(store)

      case 'arrange_radial':
        return handleArrangeRadial(store, params as { center_node_id: string; node_ids?: string[]; radius?: number })

      // Frame operations
      case 'list_frames':
        return handleListFrames(store)

      case 'get_frame':
        return handleGetFrame(store, params as { id: string })

      case 'create_frame':
        return handleCreateFrame(store, params as { title: string; x?: number; y?: number; width?: number; height?: number; color?: string })

      case 'update_frame':
        return handleUpdateFrame(store, params as { id: string; updates: { title?: string; x?: number; y?: number; width?: number; height?: number; color?: string | null } })

      case 'delete_frame':
        return handleDeleteFrame(store, params as { id: string })

      case 'get_nodes_in_frame':
        return handleGetNodesInFrame(store, params as { frame_id: string })

      case 'assign_node_to_frame':
        return handleAssignNodeToFrame(store, params as { node_id: string; frame_id: string })

      case 'remove_node_from_frame':
        return handleRemoveNodeFromFrame(store, params as { node_id: string })

      case 'batch_assign_nodes_to_frame':
        return handleBatchAssignNodesToFrame(store, params as { node_ids: string[]; frame_id?: string | null })

      case 'batch_move_frames':
        return handleBatchMoveFrames(store, params as { moves: Array<{ id: string; x: number; y: number }> })

      case 'batch_resize_frames':
        return handleBatchResizeFrames(store, params as { resizes: Array<{ id: string; width: number; height: number }> })

      case 'fit_frame_to_contents':
        return handleFitFrameToContents(store, params as { frame_id: string })

      case 'fit_all_frames':
        return handleFitAllFrames(store)

      case 'check_frame_overlaps':
        return handleCheckFrameOverlaps(store)

      case 'resolve_frame_overlaps':
        return handleResolveFrameOverlaps(store)

      // Storyline operations
      case 'list_storylines':
        return handleListStorylines(store)

      case 'get_storyline':
        return handleGetStoryline(store, params as { id: string })

      case 'get_storyline_nodes':
        return handleGetStorylineNodes(store, params as { storyline_id: string })

      case 'create_storyline':
        return handleCreateStoryline(store, params as { title: string; description?: string; color?: string })

      case 'update_storyline':
        return handleUpdateStoryline(store, params as { id: string; title?: string; description?: string; color?: string })

      case 'delete_storyline':
        return handleDeleteStoryline(store, params as { id: string })

      case 'add_node_to_storyline':
        return handleAddNodeToStoryline(store, params as { storyline_id: string; node_id: string; position?: number })

      case 'remove_node_from_storyline':
        return handleRemoveNodeFromStoryline(store, params as { storyline_id: string; node_id: string })

      case 'reorder_storyline_nodes':
        return handleReorderStorylineNodes(store, params as { storyline_id: string; node_ids: string[] })

      // Canvas operations
      case 'get_viewport':
        return localHandleGetViewport()

      case 'focus_node':
        return localHandleFocusNode(params as { id: string })

      default:
        throw new McpError(
          JsonRpcErrorCodes.METHOD_NOT_FOUND,
          `Method not found: ${request.method}`
        )
    }
  }

  // Local viewport handlers (not extracted since they need viewport closure)

  function localHandleGetViewport(): McpViewport {
    if (!viewport) {
      return { x: 0, y: 0, zoom: 1 }
    }
    return viewport.getViewport()
  }

  function localHandleFocusNode(params: { id: string }): { success: boolean } {
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
