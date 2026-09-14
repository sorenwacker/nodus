/**
 * Creating and changing nodes
 */
import type { McpToolDeclaration } from './types'

export const NODE_TOOLS: McpToolDeclaration[] = [
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
          description:
            'Body content in Open Knowledge Format (OKF v0.2): Markdown with [[wikilinks]], #tags, **bold** and lists. Write the body only - Nodus adds the YAML frontmatter itself.',
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
        date: {
          type: 'string',
          description: "Point in time for timelines, e.g. '20 BC', '1500', '1969-07-20', '1969-07-20 14:30'. Stored as frontmatter.",
        },
        date_end: {
          type: 'string',
          description: 'End of a time span (same formats as date); renders as a bar on the timelines.',
        },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Tags for the node (without #).',
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
            date: {
              type: 'string',
              description: "Set the node's date (e.g. '20 BC', '1969-07-20 14:30'); empty string clears it.",
            },
            date_end: {
              type: 'string',
              description: 'Set the end of a time span; empty string clears it.',
            },
            tags: {
              type: 'array',
              items: { type: 'string' },
              description: 'Replace the node tags (without #).',
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
    description:
      'Move multiple nodes at once. Positions are absolute canvas coordinates, not offsets from where a node is now.',
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
    name: 'batch_update_nodes',
    description:
      'Update several nodes at once: title, content or position. Each entry names the node by id and carries only the fields to change.',
    inputSchema: {
      type: 'object',
      properties: {
        updates: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', description: 'Node ID' },
              title: { type: 'string', description: 'New title' },
              content: { type: 'string', description: 'New body content' },
              x: { type: 'number', description: 'New X position' },
              y: { type: 'number', description: 'New Y position' },
            },
            required: ['id'],
          },
          description: 'Array of {id, ...fields to change} objects',
        },
      },
      required: ['updates'],
    },
  },
  {
    name: 'get_duplicate_edges',
    description:
      'List edges that connect the same pair of nodes more than once, grouped by pair. Reports only; removes nothing.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'cleanup_duplicate_edges',
    description:
      'Remove duplicate edges, keeping one edge per connected pair. Use get_duplicate_edges first to see what would go.',
    inputSchema: {
      type: 'object',
      properties: {},
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
]
