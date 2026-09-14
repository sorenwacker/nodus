/**
 * WebSocket client for connecting to Nodus MCP server
 */

import WebSocket from 'ws'
import { ConnectionLifecycle, interpretMessage } from './connection.js'
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
  private lifecycle = new ConnectionLifecycle(MAX_RECONNECT_ATTEMPTS)
  /** The attempt in flight, so callers join it rather than start another */
  private connecting: Promise<void> | null = null
  private isApproved = false
  /** The user said no. The socket stays open, so only this records it */
  private refused = false
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
    // One attempt at a time. Each tool call made its own, so with Nodus down
    // ten calls produced ten reconnection chains, each replacing the socket the
    // others held (PRODUCT_DESIGN.md > One connection attempt at a time)
    if (this.lifecycle.begin() === 'join' && this.connecting) return this.connecting

    this.connecting = new Promise<void>((resolve, reject) => {
      const url = `ws://${this.host}:${this.port}`
      console.error(`[MCP Client] Connecting to ${url}...`)

      // A socket being replaced is closed and detached: handlers on superseded
      // sockets went on firing, authenticating down whichever socket was
      // current and scheduling further attempts
      const previous = this.ws
      if (previous) {
        previous.removeAllListeners()
        previous.close()
      }

      const socket = new WebSocket(url)
      this.ws = socket
      const isCurrent = () => this.ws === socket

      socket.on('open', () => {
        if (!isCurrent()) return
        console.error('[MCP Client] Connected')
        this.authenticate()
        this.everConnected = true
        // A fresh budget after every successful connection: the counter never
        // reset, so ten drops over a long session ended reconnection for good
        // (PRODUCT_DESIGN.md > Reconnecting to Nodus)
        this.lifecycle.succeeded()
        this.options.onConnected?.()
        resolve()
      })

      socket.on('message', (data) => {
        if (!isCurrent()) return
        this.handleMessage(data.toString())
      })

      socket.on('close', () => {
        if (!isCurrent()) return
        console.error('[MCP Client] Disconnected')
        this.isApproved = false
        // Every request still waiting will never be answered, so reject them
        // rather than leaving their promises pending for ever
        // (PRODUCT_DESIGN.md > Reporting MCP errors)
        this.rejectAllPending('Disconnected from Nodus before a reply arrived')
        this.options.onDisconnected?.()
        this.attemptReconnect()
      })

      socket.on('error', (error) => {
        if (!isCurrent()) return
        console.error('[MCP Client] Error:', error.message)
        this.lifecycle.failed()
        this.options.onError?.(error)
        reject(error)
      })
    })

    try {
      await this.connecting
    } finally {
      this.connecting = null
    }
  }

  /**
   * Disconnect from the server
   */
  disconnect(): void {
    // Asked for by the application, so the close handler must not reconnect
    this.lifecycle.closeRequested()
    if (this.ws) {
      this.ws.removeAllListeners()
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
   * Connect if not connected, for a caller about to need the link.
   *
   * Startup says the server will retry when tools are called, and it did not:
   * after the initial failure nothing tried again
   * (PRODUCT_DESIGN.md > Reconnecting to Nodus).
   */
  async ensureConnected(): Promise<void> {
    if (this.isConnected()) return
    this.lifecycle.wanted()
    await this.connect()
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
    return this.ws?.readyState === WebSocket.OPEN && !this.isApproved && !this.refused
  }

  /**
   * Whether the user refused this connection.
   *
   * Nodus leaves the socket open after a refusal, so nothing about the socket
   * says so and only this records it. Without it every later call reported that
   * approval was still pending (PRODUCT_DESIGN.md > Reporting MCP errors).
   */
  wasRefused(): boolean {
    return this.refused
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
      const outcome = interpretMessage(message)

      switch (outcome.kind) {
        case 'approved':
          console.error('[MCP Client] Connection approved')
          if (outcome.token) saveTrustToken(outcome.token)
          this.isApproved = true
          this.refused = false
          this.options.onApproved?.()
          return

        case 'awaiting-approval':
          console.error('[MCP Client] Waiting for user approval...')
          return

        case 'refused':
          console.error(`[MCP Client] Refused: ${outcome.message}`)
          this.refused = true
          this.isApproved = false
          this.rejectAllPending(outcome.message)
          return

        case 'settle': {
          const pending = this.pendingRequests.get(outcome.id)
          if (pending) {
            this.pendingRequests.delete(outcome.id)
            if (outcome.error) pending.reject(new Error(outcome.error))
            else pending.resolve(outcome.result)
          }
          return
        }

        case 'ignore':
          return
      }
    } catch (error) {
      console.error('[MCP Client] Failed to parse message:', error)
    }
  }

  /**
   * Attempt to reconnect
   */
  private attemptReconnect(): void {
    if (!this.lifecycle.shouldReconnect()) {
      console.error('[MCP Client] Not reconnecting')
      return
    }

    const attempt = this.lifecycle.countAttempt()
    console.error(`[MCP Client] Reconnecting in ${RECONNECT_DELAY / 1000}s (attempt ${attempt})...`)

    setTimeout(() => {
      this.connect().catch((error) => {
        console.error('[MCP Client] Reconnection failed:', error.message)
      })
    }, RECONNECT_DELAY)
  }
}
