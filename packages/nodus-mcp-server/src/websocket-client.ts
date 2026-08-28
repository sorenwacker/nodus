/**
 * WebSocket client for connecting to Nodus MCP server
 */

import WebSocket from 'ws'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const DEFAULT_PORT = 9742
const RECONNECT_DELAY = 3000
const MAX_RECONNECT_ATTEMPTS = 10

// Trust token issued by Nodus on first approval; presenting it on
// reconnect skips the in-app approval prompt
const TOKEN_DIR = join(homedir(), '.nodus')
const TOKEN_FILE = join(TOKEN_DIR, 'mcp-token')

function loadTrustToken(): string | null {
  try {
    const token = readFileSync(TOKEN_FILE, 'utf8').trim()
    return token.length > 0 ? token : null
  } catch {
    return null
  }
}

function saveTrustToken(token: string): void {
  try {
    mkdirSync(TOKEN_DIR, { recursive: true })
    writeFileSync(TOKEN_FILE, token, { mode: 0o600 })
  } catch (e) {
    console.error('[MCP Client] Could not persist trust token:', e)
  }
}

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

  /**
   * Fail every request still waiting for a reply.
   *
   * A promise nobody will ever settle looks to the caller like a request still
   * in progress (PRODUCT_DESIGN.md > Reporting MCP errors).
   */
  private rejectAllPending(reason: string): void {
    for (const [, pending] of this.pendingRequests) {
      pending.reject(new Error(reason))
    }
    this.pendingRequests.clear()
  }
  private requestId = 0
  private reconnectAttempts = 0
  private isApproved = false
  private everConnected = false
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
      console.error(`[MCP Client] Connecting to ${url}...`)

      this.ws = new WebSocket(url)

      this.ws.on('open', () => {
        console.error('[MCP Client] Connected')
        this.reconnectAttempts = 0
        this.authenticate()
        this.everConnected = true
        this.options.onConnected?.()
        resolve()
      })

      this.ws.on('message', (data) => {
        this.handleMessage(data.toString())
      })

      this.ws.on('close', () => {
        console.error('[MCP Client] Disconnected')
        this.isApproved = false
        // Every request still waiting will never be answered, so reject them
        // rather than leaving their promises pending for ever
        // (PRODUCT_DESIGN.md > Reporting MCP errors)
        this.rejectAllPending('Disconnected from Nodus before a reply arrived')
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
   * Whether a connection was ever established, so a failure can say whether
   * Nodus was never reachable or the link dropped
   * (PRODUCT_DESIGN.md > Reporting MCP errors).
   */
  hasEverConnected(): boolean {
    return this.everConnected
  }

  /** Whether the socket is open but still waiting for the user to approve it */
  isAwaitingApproval(): boolean {
    return this.ws?.readyState === WebSocket.OPEN && !this.isApproved
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
   * Present the stored trust token (if any) right after connecting, so a
   * previously approved client skips the in-app approval prompt
   */
  private authenticate(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return
    const token = loadTrustToken()
    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      id: 'authenticate',
      method: 'authenticate',
      params: { label: 'nodus-mcp-server', ...(token ? { token } : {}) },
    }
    this.ws.send(JSON.stringify(request))
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
          console.error('[MCP Client] Connection approved')
          if (typeof result.token === 'string') {
            saveTrustToken(result.token)
          }
          this.isApproved = true
          this.options.onApproved?.()
          return
        }
        if (result.status === 'pending_approval') {
          console.error('[MCP Client] Waiting for user approval...')
          return
        }
      }

      // -32001 means the request is waiting for the user. A rejection carries
      // the same code, and swallowing both left the caller's promise pending
      // for ever after the user said no
      // (PRODUCT_DESIGN.md > Reporting MCP errors)
      if (message.error?.code === -32001) {
        const text = message.error.message || ''
        const wasRejected = /reject|denied|declined/i.test(text)
        if (!wasRejected) {
          console.error('[MCP Client] Waiting for user approval...')
          return
        }
        console.error(`[MCP Client] Request rejected: ${text}`)
        if (message.id !== undefined && message.id !== null) {
          const pending = this.pendingRequests.get(message.id)
          if (pending) {
            this.pendingRequests.delete(message.id)
            pending.reject(new Error(text || 'The user rejected this request'))
          }
        }
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
    console.error(`[MCP Client] Reconnecting in ${RECONNECT_DELAY / 1000}s (attempt ${this.reconnectAttempts})...`)

    setTimeout(() => {
      this.connect().catch((error) => {
        console.error('[MCP Client] Reconnection failed:', error.message)
      })
    }, RECONNECT_DELAY)
  }
}
