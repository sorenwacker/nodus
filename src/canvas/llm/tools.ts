/**
 * Agent tool definitions
 * Declarative tool specs for LLM function calling
 */
import type { AgentTool } from './types'

export const agentTools: AgentTool[] = [
  {
    type: 'function',
    function: {
      name: 'create_node',
      description: 'Create a new node on the canvas with a title and markdown content',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Node title' },
          content: { type: 'string', description: 'Markdown content for the node' },
          x: { type: 'number', description: 'X position (optional)' },
          y: { type: 'number', description: 'Y position (optional)' },
        },
        required: ['title'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_edge',
      description: 'Create an edge connecting two nodes by their titles',
      parameters: {
        type: 'object',
        properties: {
          from_title: { type: 'string', description: 'Title of source node' },
          to_title: { type: 'string', description: 'Title of target node' },
          label: { type: 'string', description: 'Edge label (optional)' },
        },
        required: ['from_title', 'to_title'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_edges',
      description: 'Delete edges. Use to remove connections without deleting nodes.',
      parameters: {
        type: 'object',
        properties: {
          filter: { type: 'string', description: '"all" to delete all edges, or node title to delete edges from/to that node' },
        },
        required: ['filter'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_node',
      description: 'Delete a single node by its title',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Title of node to delete' },
        },
        required: ['title'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_matching',
      description: 'Delete multiple nodes matching a filter.',
      parameters: {
        type: 'object',
        properties: {
          filter: { type: 'string', description: '"all", "even", "odd", "empty", or search term' },
        },
        required: ['filter'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_node',
      description: 'Update ONE node. For multiple nodes use batch_update.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Title of node to update' },
          new_content: { type: 'string', description: 'Literal content (no templates)' },
        },
        required: ['title', 'new_content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'generate_sequence',
      description: 'Generate N nodes with a pattern. Use for large batches (100+). Pattern uses {n} for number.',
      parameters: {
        type: 'object',
        properties: {
          count: { type: 'number', description: 'Number of nodes to create' },
          title_pattern: { type: 'string', description: 'Title pattern, e.g., "Node {n}" or "Item {n}"' },
          content_pattern: { type: 'string', description: 'Content pattern, e.g., "{n}" or empty' },
          layout: { type: 'string', description: '"grid" (default), "horizontal", or "vertical"' },
          connect: { type: 'boolean', description: 'If true, connect nodes sequentially (1->2->3...)' },
        },
        required: ['count', 'title_pattern'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_nodes_batch',
      description: 'Create or update multiple nodes (up to ~50). For larger batches, use generate_sequence.',
      parameters: {
        type: 'object',
        properties: {
          nodes: {
            type: 'array',
            description: 'Array of {title, content, mode?} objects. mode="append" adds to existing content.',
            items: {
              type: 'object',
              properties: {
                title: { type: 'string' },
                content: { type: 'string' },
                mode: { type: 'string', description: '"replace" (default) or "append"' },
              },
            },
          },
        },
        required: ['nodes'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'move_node',
      description: 'Move a single node to a new position',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Title of node to move' },
          x: { type: 'number', description: 'New X position' },
          y: { type: 'number', description: 'New Y position' },
        },
        required: ['title', 'x', 'y'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'auto_layout',
      description: 'Arrange nodes in a layout',
      parameters: {
        type: 'object',
        properties: {
          layout: { type: 'string', description: '"grid", "horizontal", "vertical", "circle", "clock", "star"' },
          sort: { type: 'string', description: '"alphabetical", "numeric", "reverse" (optional)' },
        },
        required: ['layout'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'query_nodes',
      description: 'Query nodes from database. Returns list of {title, content} for planning.',
      parameters: {
        type: 'object',
        properties: {
          filter: { type: 'string', description: 'Filter: "all", "empty" (no content), "has_content", or a search term' },
        },
        required: ['filter'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'for_each_node',
      description: 'Set/append CONTENT using math templates. For unique values or titles use batch_update.',
      parameters: {
        type: 'object',
        properties: {
          filter: { type: 'string', description: '"all", "empty", "has_content", or search term' },
          action: { type: 'string', description: '"set" or "append" (content only, NOT titles)' },
          template: { type: 'string', description: 'Math template: {title}, {n}, {n^2}, {n+1}' },
        },
        required: ['action', 'template'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'batch_update',
      description: 'Update multiple nodes. LLM decides values. Use for titles, content, OR positions.',
      parameters: {
        type: 'object',
        properties: {
          updates: { type: 'array', description: '[{title: "Node 1", set_title?: "Lion", set_content?: "...", x?: 100, y?: 200}]' },
        },
        required: ['updates'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'smart_move',
      description: 'Move nodes based on semantic criteria. LLM reasons about each node. Use for "move cars left, animals right".',
      parameters: {
        type: 'object',
        properties: {
          instruction: { type: 'string', description: 'Natural language: "car brands to x=100, animals to x=600"' },
        },
        required: ['instruction'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'smart_connect',
      description: 'Connect nodes within semantic groups. E.g., "connect animals together, connect cars together, but not across".',
      parameters: {
        type: 'object',
        properties: {
          groups: { type: 'string', description: 'Group descriptions: "animals, car brands"' },
        },
        required: ['groups'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'smart_color',
      description: 'Color nodes based on semantic criteria. LLM reasons about each node.',
      parameters: {
        type: 'object',
        properties: {
          instruction: { type: 'string', description: 'Natural language: "males blue, females pink" or "urgent red, normal green"' },
        },
        required: ['instruction'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'web_search',
      description: 'Search the web for information. Use this to research topics before creating nodes.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'done',
      description: 'Signal that the agent has completed all work',
      parameters: {
        type: 'object',
        properties: {
          summary: { type: 'string', description: 'Brief summary of what was accomplished' },
        },
        required: ['summary'],
      },
    },
  },
]
