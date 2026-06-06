#!/usr/bin/env node

/**
 * Nodus MCP Server
 *
 * An MCP server that connects to a running Nodus instance via WebSocket,
 * allowing AI tools like Claude Desktop to interact with your knowledge graph.
 *
 * Usage:
 *   npx nodus-mcp-server
 *
 * Configuration for Claude Desktop (~/.config/claude/claude_desktop_config.json):
 *   {
 *     "mcpServers": {
 *       "nodus": {
 *         "command": "npx",
 *         "args": ["nodus-mcp-server"]
 *       }
 *     }
 *   }
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'
import { NodusWebSocketClient } from './websocket-client.js'
import { NODUS_TOOLS } from './tools.js'

const PORT = parseInt(process.env.NODUS_MCP_PORT || '9742', 10)

class NodusMcpServer {
  private server: Server
  private wsClient: NodusWebSocketClient

  constructor() {
    this.server = new Server(
      {
        name: 'nodus-mcp-server',
        version: '0.1.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    )

    this.wsClient = new NodusWebSocketClient({
      port: PORT,
      onConnected: () => {
        console.error('[Nodus MCP] Connected to Nodus')
      },
      onDisconnected: () => {
        console.error('[Nodus MCP] Disconnected from Nodus')
      },
      onApproved: () => {
        console.error('[Nodus MCP] Connection approved')
      },
      onError: (error) => {
        console.error('[Nodus MCP] Error:', error.message)
      },
    })

    this.setupHandlers()
  }

  private setupHandlers(): void {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: NODUS_TOOLS,
      }
    })

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params

      // Check connection
      if (!this.wsClient.isConnected()) {
        return {
          content: [
            {
              type: 'text',
              text: 'Error: Not connected to Nodus. Make sure Nodus is running and the MCP server is enabled in settings.',
            },
          ],
          isError: true,
        }
      }

      try {
        const result = await this.wsClient.request(name, args as Record<string, unknown>)

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return {
          content: [
            {
              type: 'text',
              text: `Error: ${message}`,
            },
          ],
          isError: true,
        }
      }
    })
  }

  async start(): Promise<void> {
    console.error('[Nodus MCP] Starting server...')

    // Connect to Nodus WebSocket server
    try {
      await this.wsClient.connect()
    } catch (error) {
      console.error('[Nodus MCP] Failed to connect to Nodus. Make sure Nodus is running.')
      console.error('[Nodus MCP] Will continue and retry connection when tools are called.')
    }

    // Start MCP server using stdio transport
    const transport = new StdioServerTransport()
    await this.server.connect(transport)

    console.error('[Nodus MCP] Server running')
  }
}

// Start the server
const server = new NodusMcpServer()
server.start().catch((error) => {
  console.error('[Nodus MCP] Fatal error:', error)
  process.exit(1)
})
