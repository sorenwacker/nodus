/**
 * Edges between nodes
 */
import type { McpToolDeclaration } from './types'

export const EDGE_TOOLS: McpToolDeclaration[] = [
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
        color: {
          type: 'string',
          description: 'Edge color as a name or hex value (optional)',
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
        color: {
          type: 'string',
          description: 'Edge color as a name or hex value; empty string clears it',
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
]
