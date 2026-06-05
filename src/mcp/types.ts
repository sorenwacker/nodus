/**
 * MCP (Model Context Protocol) types for Nodus
 */

/**
 * JSON-RPC 2.0 Request
 */
export interface JsonRpcRequest {
  jsonrpc: '2.0'
  id?: string | number | null
  method: string
  params?: Record<string, unknown>
}

/**
 * JSON-RPC 2.0 Response
 */
export interface JsonRpcResponse {
  jsonrpc: '2.0'
  id?: string | number | null
  result?: unknown
  error?: JsonRpcError
}

/**
 * JSON-RPC 2.0 Error
 */
export interface JsonRpcError {
  code: number
  message: string
  data?: unknown
}

/**
 * MCP connection request event from backend
 */
export interface McpConnectionRequestEvent {
  connection_id: string
}

/**
 * MCP message event from backend
 */
export interface McpMessageEvent {
  connection_id: string
  request: JsonRpcRequest
}

/**
 * MCP connection closed event from backend
 */
export interface McpConnectionClosedEvent {
  connection_id: string
}

/**
 * MCP server status
 */
export interface McpServerStatus {
  running: boolean
  port: number | null
  pending_connections: number
}

/**
 * Node data returned by MCP (subset of full Node)
 */
export interface McpNode {
  id: string
  title: string
  node_type: string
  canvas_x: number
  canvas_y: number
  width: number
  height: number
  markdown_content?: string | null
  tags?: string[]
  created_at: number
  updated_at: number
}

/**
 * Edge data returned by MCP
 */
export interface McpEdge {
  id: string
  source_node_id: string
  target_node_id: string
  label: string | null
  link_type: string
  directed: boolean
}

/**
 * Viewport data returned by MCP
 */
export interface McpViewport {
  x: number
  y: number
  zoom: number
}

/**
 * Frame data returned by MCP
 */
export interface McpFrame {
  id: string
  title: string
  canvas_x: number
  canvas_y: number
  width: number
  height: number
  color: string | null
  parent_frame_id: string | null
}

/**
 * Storyline data returned by MCP
 * Storylines define ordered sequences of nodes forming narrative paths.
 */
export interface McpStoryline {
  id: string
  title: string
  description: string | null
  color: string | null
}

/**
 * Standard JSON-RPC error codes
 */
export const JsonRpcErrorCodes = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
  NOT_APPROVED: -32001,
} as const

/**
 * Create a success response
 */
export function createSuccessResponse(
  id: string | number | null | undefined,
  result: unknown
): JsonRpcResponse {
  return {
    jsonrpc: '2.0',
    id,
    result,
  }
}

/**
 * Create an error response
 */
export function createErrorResponse(
  id: string | number | null | undefined,
  code: number,
  message: string,
  data?: unknown
): JsonRpcResponse {
  return {
    jsonrpc: '2.0',
    id,
    error: { code, message, data },
  }
}
