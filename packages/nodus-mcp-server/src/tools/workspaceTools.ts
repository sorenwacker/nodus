/**
 * Targeting a workspace
 */
import type { McpToolDeclaration } from './types'

export const WORKSPACE_TOOLS: McpToolDeclaration[] = [
  // Workspace scoping
  {
    name: 'list_workspaces',
    description: 'List all workspaces; the current one (open in the app) is marked.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'set_workspace',
    description:
      'Scope this connection to a workspace by id or name. All further reads and writes target that workspace, independent of what is open in the app - multiple connections can work different workspaces in parallel.',
    inputSchema: {
      type: 'object',
      properties: {
        workspace: {
          type: 'string',
          description: 'Workspace id or name (see list_workspaces).',
        },
      },
      required: ['workspace'],
    },
  },
  {
    name: 'get_workspace',
    description: 'Show which workspace this connection is scoped to, if any.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
]
