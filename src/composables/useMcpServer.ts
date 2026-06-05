/**
 * MCP Server composable
 *
 * Manages the MCP WebSocket server lifecycle and connection approval.
 */

import { ref, onMounted, onUnmounted } from 'vue'
import { invoke } from '../lib/tauri'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import type {
  McpServerStatus,
  McpConnectionRequestEvent,
  McpMessageEvent,
  McpConnectionClosedEvent,
  JsonRpcRequest,
  JsonRpcResponse,
} from '../mcp/types'
import { createMcpMessageHandler, type McpStoreInterface, type McpViewportInterface, type McpUndoInterface } from '../mcp/messageHandler'

export interface UseMcpServerOptions {
  store: McpStoreInterface
  viewport?: McpViewportInterface
  undo?: McpUndoInterface
  onConnectionRequest?: (connectionId: string) => void
  onConnectionClosed?: (connectionId: string) => void
}

export function useMcpServer(options: UseMcpServerOptions) {
  const isRunning = ref(false)
  const port = ref<number | null>(null)
  const pendingConnections = ref<string[]>([])
  const approvedConnections = ref<string[]>([])
  const error = ref<string | null>(null)

  // Create message handler
  const { handleRequest } = createMcpMessageHandler(options.store, options.viewport, options.undo)

  // Event listeners
  const unlistenFns: UnlistenFn[] = []

  /**
   * Start the MCP server
   */
  async function startServer(): Promise<void> {
    try {
      error.value = null
      const serverPort = await invoke<number>('start_mcp_server')
      port.value = serverPort
      isRunning.value = true
      console.log(`[MCP] Server started on port ${serverPort}`)
    } catch (e) {
      error.value = String(e)
      console.error('[MCP] Failed to start server:', e)
      throw e
    }
  }

  /**
   * Stop the MCP server
   */
  async function stopServer(): Promise<void> {
    try {
      error.value = null
      await invoke('stop_mcp_server')
      port.value = null
      isRunning.value = false
      pendingConnections.value = []
      approvedConnections.value = []
      console.log('[MCP] Server stopped')
    } catch (e) {
      error.value = String(e)
      console.error('[MCP] Failed to stop server:', e)
      throw e
    }
  }

  /**
   * Approve a pending connection
   */
  async function approveConnection(connectionId: string): Promise<void> {
    try {
      await invoke('approve_mcp_connection', { connectionId, approved: true })
      pendingConnections.value = pendingConnections.value.filter((id) => id !== connectionId)
      approvedConnections.value.push(connectionId)
      console.log(`[MCP] Connection ${connectionId} approved`)
    } catch (e) {
      console.error('[MCP] Failed to approve connection:', e)
      throw e
    }
  }

  /**
   * Reject a pending connection
   */
  async function rejectConnection(connectionId: string): Promise<void> {
    try {
      await invoke('approve_mcp_connection', { connectionId, approved: false })
      pendingConnections.value = pendingConnections.value.filter((id) => id !== connectionId)
      console.log(`[MCP] Connection ${connectionId} rejected`)
    } catch (e) {
      console.error('[MCP] Failed to reject connection:', e)
      throw e
    }
  }

  /**
   * Send a response to a connection
   */
  async function sendResponse(connectionId: string, response: JsonRpcResponse): Promise<void> {
    try {
      const responseStr = JSON.stringify(response)
      await invoke('send_mcp_response', { connectionId, response: responseStr })
    } catch (e) {
      console.error('[MCP] Failed to send response:', e)
      throw e
    }
  }

  /**
   * Get current server status
   */
  async function getStatus(): Promise<McpServerStatus> {
    return await invoke<McpServerStatus>('get_mcp_status')
  }

  /**
   * Handle incoming MCP message
   */
  async function handleMessage(connectionId: string, request: JsonRpcRequest): Promise<void> {
    const response = await handleRequest(request)
    await sendResponse(connectionId, response)
  }

  /**
   * Set up event listeners
   */
  async function setupListeners(): Promise<void> {
    // Connection request
    const unlistenConnectionRequest = await listen<McpConnectionRequestEvent>(
      'mcp-connection-request',
      (event) => {
        const { connection_id } = event.payload
        pendingConnections.value.push(connection_id)
        options.onConnectionRequest?.(connection_id)
        console.log(`[MCP] Connection request: ${connection_id}`)
      }
    )
    unlistenFns.push(unlistenConnectionRequest)

    // Message from approved client
    const unlistenMessage = await listen<McpMessageEvent>(
      'mcp-message',
      async (event) => {
        const { connection_id, request } = event.payload
        console.log(`[MCP] Message from ${connection_id}: ${request.method}`)
        await handleMessage(connection_id, request)
      }
    )
    unlistenFns.push(unlistenMessage)

    // Connection closed
    const unlistenConnectionClosed = await listen<McpConnectionClosedEvent>(
      'mcp-connection-closed',
      (event) => {
        const { connection_id } = event.payload
        pendingConnections.value = pendingConnections.value.filter((id) => id !== connection_id)
        approvedConnections.value = approvedConnections.value.filter((id) => id !== connection_id)
        options.onConnectionClosed?.(connection_id)
        console.log(`[MCP] Connection closed: ${connection_id}`)
      }
    )
    unlistenFns.push(unlistenConnectionClosed)
  }

  /**
   * Cleanup event listeners
   */
  function cleanup(): void {
    for (const unlisten of unlistenFns) {
      unlisten()
    }
    unlistenFns.length = 0
  }

  // Lifecycle hooks
  onMounted(async () => {
    await setupListeners()

    // Check current status
    try {
      const status = await getStatus()
      isRunning.value = status.running
      port.value = status.port
    } catch {
      // Server might not be initialized yet
    }
  })

  onUnmounted(() => {
    cleanup()
  })

  return {
    // State
    isRunning,
    port,
    pendingConnections,
    approvedConnections,
    error,

    // Methods
    startServer,
    stopServer,
    approveConnection,
    rejectConnection,
    getStatus,
  }
}
