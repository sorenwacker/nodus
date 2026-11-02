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

- **list_nodes** - List nodes in the current workspace; `fields` picks which fields to return, and `degree` is available as a field
- **get_nodes_by_tag** - List the nodes carrying a tag
- **get_node** - Get a specific node by ID with full content
- **search_nodes** - Search nodes by title or content
- **get_edges** - Get edges between nodes; filter by node, by label, or to unlabelled edges only, and optionally include the endpoint titles
- **get_edge_labels** - Count the edges carrying each distinct label, and the unlabelled ones
- **list_tags** - List every tag in use with its note count, its tag node if one is drawn, and the edges at that node

### Write Operations

- **create_node** - Create a new node
- **update_node** - Update an existing node (title, content, position)
- **batch_update_nodes** - Update several nodes in one call; a batch that would outrun the request timeout stops in time and lists the ids it did not attempt, to be resent
- **delete_node** - Delete a node
- **rebuild_tag_nodes** - Regenerate the tag nodes and tagged edges of the open workspace from the notes' tags: merge duplicates, drop unused tag nodes, and connect every shared tag

### Edge Operations

- **create_edge** - Create a connection between two nodes, named by id or by title
- **update_edge** - Update an edge (label, directed)
- **batch_update_edges** - Update the label, direction, or color of many edges in one call, with a result per edge
- **delete_edge** - Delete an edge

### Zotero

- **add_to_zotero** - Add nodes to the Zotero library as new items; DOIs already in the library are skipped

### Workspaces

- **list_workspaces** - List all workspaces; the one open in the app is marked
- **set_workspace** - Scope this connection to a workspace by id or name
- **get_workspace** - Show which workspace this connection is scoped to
- **create_workspace** - Create an empty workspace; a name already in use is rejected

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
