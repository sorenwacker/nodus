/**
 * The canvas viewport
 */
import type { McpToolDeclaration } from './types'

export const CANVAS_TOOLS: McpToolDeclaration[] = [
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
