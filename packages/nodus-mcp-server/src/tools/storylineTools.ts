/**
 * Storylines, the ordered paths
 */
import type { McpToolDeclaration } from './types'

export const STORYLINE_TOOLS: McpToolDeclaration[] = [
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
]
