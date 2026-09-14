/**
 * Frames, the visual containers
 */
import type { McpToolDeclaration } from './types'

export const FRAME_TOOLS: McpToolDeclaration[] = [
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
]
