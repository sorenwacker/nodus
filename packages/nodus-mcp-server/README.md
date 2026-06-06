# nodus-mcp-server

MCP (Model Context Protocol) server for Nodus. Allows AI tools like Claude Desktop to interact with your Nodus knowledge graph.

## Installation

```bash
npm install -g nodus-mcp-server
```

Or use directly with npx:

```bash
npx nodus-mcp-server
```

## Configuration

### Claude Desktop

Add to `~/.config/claude/claude_desktop_config.json` (Linux/macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "nodus": {
      "command": "npx",
      "args": ["nodus-mcp-server"]
    }
  }
}
```

### Nodus Setup

1. Open Nodus
2. Go to Settings > MCP Server
3. Enable "Allow MCP connections"
4. When Claude Desktop connects, approve the connection in the Nodus popup

## Available Tools

### Read Operations

- **list_nodes** - List all nodes in the current workspace
- **get_node** - Get a specific node by ID with full content
- **search_nodes** - Search nodes by title or content
- **get_edges** - Get all edges (connections) between nodes

### Write Operations

- **create_node** - Create a new node
- **update_node** - Update an existing node (title, content, position)
- **delete_node** - Delete a node

### Edge Operations

- **create_edge** - Create a connection between two nodes
- **update_edge** - Update an edge (label, directed)
- **delete_edge** - Delete an edge

### Canvas Operations

- **get_viewport** - Get current canvas viewport position and zoom
- **focus_node** - Focus the canvas on a specific node

## Environment Variables

- `NODUS_MCP_PORT` - WebSocket port (default: 9742)

## Security

- All connections require explicit user approval in Nodus
- The WebSocket server only listens on localhost (127.0.0.1)
- No remote connections are allowed

## License

MIT
