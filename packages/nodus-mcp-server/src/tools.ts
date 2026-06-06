/**
 * MCP Tool definitions for Nodus
 */

import type { Tool } from '@modelcontextprotocol/sdk/types.js'

/**
 * All available MCP tools
 */
export const NODUS_TOOLS: Tool[] = [
  // Read operations
  {
    name: 'get_graph_summary',
    description: 'Get a compact summary of the graph: node count, edge count, node types, and most connected nodes. Use this first to understand the graph before fetching details.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'list_nodes',
    description: 'List nodes in the current workspace. Returns compact node metadata (id, title, type). Use limit/offset for large graphs.',
    inputSchema: {
      type: 'object',
      properties: {
        include_content: {
          type: 'boolean',
          description: 'Include markdown content. Default: false. Warning: can be large.',
        },
        limit: {
          type: 'number',
          description: 'Max nodes to return. Default: 50.',
        },
        offset: {
          type: 'number',
          description: 'Skip first N nodes. Default: 0.',
        },
      },
    },
  },
  {
    name: 'get_node',
    description: 'Get a specific node by ID, including its full content.',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'The node ID',
        },
      },
      required: ['id'],
    },
  },
  {
    name: 'get_node_neighbors',
    description: 'Get a node and all its direct connections. Returns the node, its neighbors, and the edges between them. Best way to explore graph structure.',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'The node ID to get neighbors for',
        },
        depth: {
          type: 'number',
          description: 'How many hops to traverse. Default: 1 (direct neighbors only). Max: 3.',
        },
      },
      required: ['id'],
    },
  },
  {
    name: 'get_graph_structure',
    description: 'Get a compact adjacency list showing how nodes connect. Returns {nodeId: {title, connections: [neighborTitles]}}. Best for understanding overall topology.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Max nodes to include. Default: 50. Most connected nodes shown first.',
        },
      },
    },
  },
  {
    name: 'search_nodes',
    description: 'Search nodes by title or content.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query string',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_orphan_nodes',
    description: 'Find nodes with no connections. Useful for finding isolated content.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'get_leaf_nodes',
    description: 'Find leaf nodes (nodes with no outgoing edges/children). These are endpoints in the graph.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'get_root_nodes',
    description: 'Find root nodes (nodes with no incoming edges/parents). These are starting points in the graph.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'get_hub_nodes',
    description: 'Find nodes with most connections. Useful for finding central concepts.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Max nodes to return. Default: 10',
        },
      },
    },
  },
  {
    name: 'get_nodes_by_color',
    description: 'Find all nodes with a specific color.',
    inputSchema: {
      type: 'object',
      properties: {
        color: {
          type: 'string',
          description: 'Color name: red, orange, yellow, green, blue, purple, pink',
        },
      },
      required: ['color'],
    },
  },
  {
    name: 'get_edges',
    description: 'Get edges (connections) between nodes. Use limit/offset for large graphs, or filter by node_id.',
    inputSchema: {
      type: 'object',
      properties: {
        node_id: {
          type: 'string',
          description: 'Only return edges connected to this node.',
        },
        limit: {
          type: 'number',
          description: 'Max edges to return. Default: 100.',
        },
        offset: {
          type: 'number',
          description: 'Skip first N edges. Default: 0.',
        },
      },
    },
  },

  // Write operations
  {
    name: 'create_node',
    description: 'Create a new node in the workspace.',
    inputSchema: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: 'Node title',
        },
        content: {
          type: 'string',
          description: 'Markdown content',
        },
        x: {
          type: 'number',
          description: 'X position on canvas. Default: 100.',
        },
        y: {
          type: 'number',
          description: 'Y position on canvas. Default: 100.',
        },
        node_type: {
          type: 'string',
          description: 'Node type: note, comment, character, location, citation, term, item. Default: note.',
        },
      },
      required: ['title'],
    },
  },
  {
    name: 'update_node',
    description: 'Update an existing node.',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'The node ID to update',
        },
        updates: {
          type: 'object',
          description: 'Fields to update',
          properties: {
            title: {
              type: 'string',
              description: 'New title',
            },
            content: {
              type: 'string',
              description: 'New markdown content',
            },
            x: {
              type: 'number',
              description: 'New X position',
            },
            y: {
              type: 'number',
              description: 'New Y position',
            },
          },
        },
      },
      required: ['id', 'updates'],
    },
  },
  {
    name: 'resize_node',
    description: 'Resize a single node.',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'The node ID to resize',
        },
        width: {
          type: 'number',
          description: 'New width in pixels',
        },
        height: {
          type: 'number',
          description: 'New height in pixels',
        },
      },
      required: ['id', 'width', 'height'],
    },
  },
  {
    name: 'batch_resize_nodes',
    description: 'Resize multiple nodes at once. Useful for normalizing node sizes.',
    inputSchema: {
      type: 'object',
      properties: {
        node_ids: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of node IDs to resize. If empty, resizes all nodes.',
        },
        width: {
          type: 'number',
          description: 'New width in pixels',
        },
        height: {
          type: 'number',
          description: 'New height in pixels',
        },
      },
      required: ['width', 'height'],
    },
  },
  {
    name: 'batch_move_nodes',
    description: 'Move multiple nodes at once. Can set absolute positions or apply relative offsets.',
    inputSchema: {
      type: 'object',
      properties: {
        moves: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', description: 'Node ID' },
              x: { type: 'number', description: 'New X position' },
              y: { type: 'number', description: 'New Y position' },
            },
            required: ['id', 'x', 'y'],
          },
          description: 'Array of {id, x, y} objects specifying new positions',
        },
      },
      required: ['moves'],
    },
  },
  {
    name: 'set_node_color',
    description: 'Set the color theme of a node.',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'The node ID',
        },
        color: {
          type: 'string',
          description: 'Color name: red, orange, yellow, green, blue, purple, pink, or null to reset',
        },
      },
      required: ['id', 'color'],
    },
  },
  {
    name: 'batch_set_node_colors',
    description: 'Set colors for multiple nodes at once.',
    inputSchema: {
      type: 'object',
      properties: {
        node_ids: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of node IDs to color',
        },
        color: {
          type: 'string',
          description: 'Color name: red, orange, yellow, green, blue, purple, pink, or null to reset',
        },
      },
      required: ['node_ids', 'color'],
    },
  },
  {
    name: 'delete_node',
    description: 'Delete a node from the workspace.',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'The node ID to delete',
        },
      },
      required: ['id'],
    },
  },

  // Edge operations
  {
    name: 'create_edge',
    description: 'Create an edge (connection) between two nodes.',
    inputSchema: {
      type: 'object',
      properties: {
        source_node_id: {
          type: 'string',
          description: 'Source node ID',
        },
        target_node_id: {
          type: 'string',
          description: 'Target node ID',
        },
        label: {
          type: 'string',
          description: 'Edge label',
        },
        link_type: {
          type: 'string',
          description: 'Link type: related, cites, blocks, supports, contradicts. Default: related.',
        },
        directed: {
          type: 'boolean',
          description: 'Whether the edge is directed. Default: true.',
        },
      },
      required: ['source_node_id', 'target_node_id'],
    },
  },
  {
    name: 'update_edge',
    description: 'Update an existing edge.',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'The edge ID to update',
        },
        label: {
          type: 'string',
          description: 'New label',
        },
        directed: {
          type: 'boolean',
          description: 'Whether the edge is directed',
        },
      },
      required: ['id'],
    },
  },
  {
    name: 'delete_edge',
    description: 'Delete an edge from the workspace.',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'The edge ID to delete',
        },
      },
      required: ['id'],
    },
  },
  {
    name: 'batch_create_edges',
    description: 'Create multiple edges at once. Efficient for connecting many nodes.',
    inputSchema: {
      type: 'object',
      properties: {
        edges: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              source_node_id: { type: 'string' },
              target_node_id: { type: 'string' },
              label: { type: 'string' },
              link_type: { type: 'string' },
            },
            required: ['source_node_id', 'target_node_id'],
          },
          description: 'Array of edges to create',
        },
      },
      required: ['edges'],
    },
  },
  {
    name: 'batch_delete_edges',
    description: 'Delete multiple edges at once.',
    inputSchema: {
      type: 'object',
      properties: {
        edge_ids: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of edge IDs to delete',
        },
      },
      required: ['edge_ids'],
    },
  },
  {
    name: 'delete_edges_for_node',
    description: 'Delete all edges connected to a node. Useful for breaking up hub nodes before reorganizing.',
    inputSchema: {
      type: 'object',
      properties: {
        node_id: {
          type: 'string',
          description: 'The node ID to disconnect',
        },
        direction: {
          type: 'string',
          enum: ['incoming', 'outgoing', 'both'],
          description: 'Which edges to delete. Default: both',
        },
      },
      required: ['node_id'],
    },
  },
  {
    name: 'arrange_radial',
    description: 'Arrange nodes in a circle around a center node. Great for creating category layouts.',
    inputSchema: {
      type: 'object',
      properties: {
        center_node_id: {
          type: 'string',
          description: 'The node to place at center',
        },
        node_ids: {
          type: 'array',
          items: { type: 'string' },
          description: 'Nodes to arrange around the center. If empty, uses connected nodes.',
        },
        radius: {
          type: 'number',
          description: 'Distance from center. Default: 300',
        },
      },
      required: ['center_node_id'],
    },
  },

  // Frame operations - Frames are visual containers for spatial grouping of nodes.
  // Use frames to organize nodes into categories, topics, or project areas on the canvas.
  // Nodes can be assigned to frames and will move with the frame when dragged.
  {
    name: 'list_frames',
    description: 'List all frames in the workspace. Frames are visual containers for grouping related nodes spatially on the canvas (e.g., by topic, project, or category).',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'get_frame',
    description: 'Get a specific frame by ID, including its position, size, and color.',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'The frame ID',
        },
      },
      required: ['id'],
    },
  },
  {
    name: 'create_frame',
    description: 'Create a frame to visually group nodes. Frames are rectangular containers that help organize the canvas spatially. Use them to create topic areas, project sections, or category groups.',
    inputSchema: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: 'Frame title (displayed at the top)',
        },
        x: {
          type: 'number',
          description: 'X position on canvas. Default: 100.',
        },
        y: {
          type: 'number',
          description: 'Y position on canvas. Default: 100.',
        },
        width: {
          type: 'number',
          description: 'Frame width. Default: 400.',
        },
        height: {
          type: 'number',
          description: 'Frame height. Default: 300.',
        },
        color: {
          type: 'string',
          description: 'Color name: red, orange, yellow, green, blue, purple, pink, gray',
        },
      },
      required: ['title'],
    },
  },
  {
    name: 'update_frame',
    description: 'Update frame properties (title, position, size, or color).',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'The frame ID',
        },
        updates: {
          type: 'object',
          description: 'Fields to update',
          properties: {
            title: { type: 'string' },
            x: { type: 'number' },
            y: { type: 'number' },
            width: { type: 'number' },
            height: { type: 'number' },
            color: { type: 'string', description: 'Color name (red, orange, yellow, green, blue, purple, pink, gray) or null to reset' },
          },
        },
      },
      required: ['id', 'updates'],
    },
  },
  {
    name: 'delete_frame',
    description: 'Delete a frame. Nodes inside are not deleted, they just become unframed.',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'The frame ID to delete',
        },
      },
      required: ['id'],
    },
  },
  {
    name: 'get_nodes_in_frame',
    description: 'Get all nodes assigned to a frame.',
    inputSchema: {
      type: 'object',
      properties: {
        frame_id: {
          type: 'string',
          description: 'The frame ID',
        },
      },
      required: ['frame_id'],
    },
  },
  {
    name: 'assign_node_to_frame',
    description: 'Assign a node to a frame and move it inside the frame bounds. The node will move with the frame when dragged.',
    inputSchema: {
      type: 'object',
      properties: {
        node_id: {
          type: 'string',
          description: 'The node ID to assign',
        },
        frame_id: {
          type: 'string',
          description: 'The frame ID to assign the node to',
        },
      },
      required: ['node_id', 'frame_id'],
    },
  },
  {
    name: 'remove_node_from_frame',
    description: 'Remove a node from its frame. The node stays in place but is no longer grouped.',
    inputSchema: {
      type: 'object',
      properties: {
        node_id: {
          type: 'string',
          description: 'The node ID to remove from its frame',
        },
      },
      required: ['node_id'],
    },
  },
  {
    name: 'batch_assign_nodes_to_frame',
    description: 'Assign multiple nodes to a frame at once. Nodes outside the frame are moved inside and stacked vertically.',
    inputSchema: {
      type: 'object',
      properties: {
        node_ids: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of node IDs to assign',
        },
        frame_id: {
          type: 'string',
          description: 'The frame ID to assign nodes to. Use null to remove from frames.',
        },
      },
      required: ['node_ids'],
    },
  },

  // Storyline operations - Storylines are ordered sequences of nodes forming a narrative path.
  // Use storylines to create reading orders, argument flows, timelines, or any linear progression through nodes.
  // Nodes in a storyline are connected by edges automatically.
  {
    name: 'batch_move_frames',
    description: 'Move multiple frames at once. Nodes assigned to each frame move with it.',
    inputSchema: {
      type: 'object',
      properties: {
        moves: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', description: 'Frame ID' },
              x: { type: 'number', description: 'New X position' },
              y: { type: 'number', description: 'New Y position' },
            },
            required: ['id', 'x', 'y'],
          },
          description: 'Array of {id, x, y} objects specifying new positions',
        },
      },
      required: ['moves'],
    },
  },
  {
    name: 'batch_resize_frames',
    description: 'Resize multiple frames at once. Nodes are pulled inside if they would be outside.',
    inputSchema: {
      type: 'object',
      properties: {
        resizes: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', description: 'Frame ID' },
              width: { type: 'number', description: 'New width' },
              height: { type: 'number', description: 'New height' },
            },
            required: ['id', 'width', 'height'],
          },
          description: 'Array of {id, width, height} objects specifying new sizes',
        },
      },
      required: ['resizes'],
    },
  },
  {
    name: 'fit_frame_to_contents',
    description: 'Resize a frame to fit all its assigned nodes with padding. Resolves overlaps with other frames.',
    inputSchema: {
      type: 'object',
      properties: {
        frame_id: {
          type: 'string',
          description: 'The frame ID to fit',
        },
      },
      required: ['frame_id'],
    },
  },
  {
    name: 'fit_all_frames',
    description: 'Resize all frames to fit their contents and resolve overlaps.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'check_frame_overlaps',
    description: 'Check if any frames overlap with each other. Returns pairs of overlapping frames.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'resolve_frame_overlaps',
    description: 'Automatically resolve frame overlaps by pushing frames apart horizontally.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },

  {
    name: 'list_storylines',
    description: 'List all storylines. Storylines are ordered sequences of nodes that form a narrative path or reading order through the graph (e.g., argument flow, timeline, chapter order).',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'get_storyline',
    description: 'Get a storyline by ID, including its title, description, and color.',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'The storyline ID',
        },
      },
      required: ['id'],
    },
  },
  {
    name: 'get_storyline_nodes',
    description: 'Get the ordered list of nodes in a storyline.',
    inputSchema: {
      type: 'object',
      properties: {
        storyline_id: {
          type: 'string',
          description: 'The storyline ID',
        },
      },
      required: ['storyline_id'],
    },
  },
  {
    name: 'create_storyline',
    description: 'Create a storyline to define an ordered path through nodes. Use storylines for reading orders, argument progressions, timelines, or any linear narrative. Nodes are connected by edges automatically.',
    inputSchema: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: 'Storyline title',
        },
        description: {
          type: 'string',
          description: 'Optional description of what this storyline represents',
        },
        color: {
          type: 'string',
          description: 'Color name for the storyline edges: red, orange, yellow, green, blue, purple, pink, gray',
        },
      },
      required: ['title'],
    },
  },
  {
    name: 'update_storyline',
    description: 'Update storyline properties (title, description, or color). Color changes apply to all edges in the storyline.',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'The storyline ID',
        },
        title: {
          type: 'string',
          description: 'New title',
        },
        description: {
          type: 'string',
          description: 'New description',
        },
        color: {
          type: 'string',
          description: 'New color for storyline edges',
        },
      },
      required: ['id'],
    },
  },
  {
    name: 'delete_storyline',
    description: 'Delete a storyline. Nodes are not deleted, but the storyline edges are removed.',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'The storyline ID to delete',
        },
      },
      required: ['id'],
    },
  },
  {
    name: 'add_node_to_storyline',
    description: 'Add a node to a storyline. By default, adds to the end. Use position to insert at a specific index. Edges are created automatically.',
    inputSchema: {
      type: 'object',
      properties: {
        storyline_id: {
          type: 'string',
          description: 'The storyline ID',
        },
        node_id: {
          type: 'string',
          description: 'The node ID to add',
        },
        position: {
          type: 'number',
          description: 'Position in the sequence (0-indexed). Default: end of storyline.',
        },
      },
      required: ['storyline_id', 'node_id'],
    },
  },
  {
    name: 'remove_node_from_storyline',
    description: 'Remove a node from a storyline. Adjacent nodes are reconnected automatically.',
    inputSchema: {
      type: 'object',
      properties: {
        storyline_id: {
          type: 'string',
          description: 'The storyline ID',
        },
        node_id: {
          type: 'string',
          description: 'The node ID to remove',
        },
      },
      required: ['storyline_id', 'node_id'],
    },
  },
  {
    name: 'reorder_storyline_nodes',
    description: 'Reorder all nodes in a storyline. Provide the complete list in the desired order. Edges are recreated automatically.',
    inputSchema: {
      type: 'object',
      properties: {
        storyline_id: {
          type: 'string',
          description: 'The storyline ID',
        },
        node_ids: {
          type: 'array',
          items: { type: 'string' },
          description: 'Complete ordered list of node IDs',
        },
      },
      required: ['storyline_id', 'node_ids'],
    },
  },

  // Canvas operations
  {
    name: 'get_viewport',
    description: 'Get the current canvas viewport position and zoom level.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'focus_node',
    description: 'Focus the canvas on a specific node.',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'The node ID to focus on',
        },
      },
      required: ['id'],
    },
  },
]

/**
 * Get tool by name
 */
export function getTool(name: string): Tool | undefined {
  return NODUS_TOOLS.find((tool) => tool.name === name)
}
