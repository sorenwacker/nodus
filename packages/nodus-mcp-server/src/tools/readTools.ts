/**
 * Reading the graph
 */
import type { McpToolDeclaration } from './types'

export const READ_TOOLS: McpToolDeclaration[] = [
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
    name: 'get_connected_components',
    description:
      'Report how many separate groups the graph falls into, and which nodes are in each. Call this before claiming the graph is connected.',
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
]
