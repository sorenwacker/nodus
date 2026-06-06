/**
 * WebSocket client for connecting to Nodus MCP server
 */

import WebSocket from 'ws'

const DEFAULT_PORT = 9742
const RECONNECT_DELAY = 3000
const MAX_RECONNECT_ATTEMPTS = 10

export interface JsonRpcRequest {
  jsonrpc: '2.0'
  id: string | number
  method: string
  params?: Record<string, unknown>
}

export interface JsonRpcResponse {
  jsonrpc: '2.0'
  id: string | number | null
  result?: unknown
  error?: {
    code: number
    message: string
    data?: unknown
  }
}

export interface WebSocketClientOptions {
  port?: number
  host?: string
  onConnected?: () => void
  onDisconnected?: () => void
  onApproved?: () => void
  onMessage?: (request: JsonRpcRequest) => void
  onError?: (error: Error) => void
}

type PendingRequest = {
  resolve: (value: unknown) => void
  reject: (error: Error) => void
}

export class NodusWebSocketClient {
  private ws: WebSocket | null = null
  private port: number
  private host: string
  private pendingRequests = new Map<string | number, PendingRequest>()
  private requestId = 0
  private reconnectAttempts = 0
  private isApproved = false
  private options: WebSocketClientOptions

  constructor(options: WebSocketClientOptions = {}) {
    this.port = options.port ?? DEFAULT_PORT
    this.host = options.host ?? '127.0.0.1'
    this.options = options
  }

  /**
   * Connect to the Nodus WebSocket server
   */
  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const url = `ws://${this.host}:${this.port}`
      console.log(`[MCP Client] Connecting to ${url}...`)

      this.ws = new WebSocket(url)

      this.ws.on('open', () => {
        console.log('[MCP Client] Connected')
        this.reconnectAttempts = 0
        this.options.onConnected?.()
        resolve()
      })

      this.ws.on('message', (data) => {
        this.handleMessage(data.toString())
      })

      this.ws.on('close', () => {
        console.log('[MCP Client] Disconnected')
        this.isApproved = false
        this.options.onDisconnected?.()
        this.attemptReconnect()
      })

      this.ws.on('error', (error) => {
        console.error('[MCP Client] Error:', error.message)
        this.options.onError?.(error)
        reject(error)
      })
    })
  }

  /**
   * Disconnect from the server
   */
  disconnect(): void {
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
  }

  /**
   * Check if connected and approved
   */
  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN && this.isApproved
  }

  /**
   * Send a JSON-RPC request and wait for response
   */
  async request<T = unknown>(method: string, params?: Record<string, unknown>): Promise<T> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('Not connected to Nodus')
    }

    const id = ++this.requestId
    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      id,
      method,
      params,
    }

    return new Promise<T>((resolve, reject) => {
      this.pendingRequests.set(id, {
        resolve: resolve as (value: unknown) => void,
        reject,
      })

      this.ws!.send(JSON.stringify(request))

      // Timeout after 30 seconds
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id)
          reject(new Error('Request timeout'))
        }
      }, 30000)
    })
  }

  /**
   * Handle incoming message
   */
  private handleMessage(data: string): void {
    try {
      const message = JSON.parse(data) as JsonRpcResponse

      // Check for approval message
      if (message.result && typeof message.result === 'object') {
        const result = message.result as Record<string, unknown>
        if (result.status === 'approved') {
          console.log('[MCP Client] Connection approved by user')
          this.isApproved = true
          this.options.onApproved?.()
          return
        }
        if (result.status === 'pending_approval') {
          console.log('[MCP Client] Waiting for user approval...')
          return
        }
      }

      // Handle error response for pending approval
      if (message.error?.code === -32001) {
        console.log('[MCP Client] Waiting for user approval...')
        return
      }

      // Handle response to pending request
      if (message.id !== undefined && message.id !== null) {
        const pending = this.pendingRequests.get(message.id)
        if (pending) {
          this.pendingRequests.delete(message.id)
          if (message.error) {
            pending.reject(new Error(message.error.message))
          } else {
            pending.resolve(message.result)
          }
        }
      }
    } catch (error) {
      console.error('[MCP Client] Failed to parse message:', error)
    }
  }

  /**
   * Attempt to reconnect
   */
  private attemptReconnect(): void {
    if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      console.error('[MCP Client] Max reconnection attempts reached')
      return
    }

    this.reconnectAttempts++
    console.log(`[MCP Client] Reconnecting in ${RECONNECT_DELAY / 1000}s (attempt ${this.reconnectAttempts})...`)

    setTimeout(() => {
      this.connect().catch((error) => {
        console.error('[MCP Client] Reconnection failed:', error.message)
      })
    }, RECONNECT_DELAY)
  }
}
