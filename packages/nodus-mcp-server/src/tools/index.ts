/**
 * MCP tool definitions for Nodus.
 *
 * One module per group of tools: the single file had grown past the project's
 * thousand-line limit, and the groups it was already divided into by comment
 * are the seams it is cut along.
 */
import type { McpToolDeclaration } from './types'
import { READ_TOOLS } from './readTools'
import { WORKSPACE_TOOLS } from './workspaceTools'
import { NODE_TOOLS } from './nodeTools'
import { EDGE_TOOLS } from './edgeTools'
import { FRAME_TOOLS } from './frameTools'
import { STORYLINE_TOOLS } from './storylineTools'
import { CANVAS_TOOLS } from './canvasTools'

export type { McpToolDeclaration } from './types'

/** All available MCP tools */
export const NODUS_TOOLS: McpToolDeclaration[] = [
  ...READ_TOOLS,
  ...WORKSPACE_TOOLS,
  ...NODE_TOOLS,
  ...EDGE_TOOLS,
  ...FRAME_TOOLS,
  ...STORYLINE_TOOLS,
  ...CANVAS_TOOLS,
]

/**
 * Get tool by name
 */
export function getTool(name: string): McpToolDeclaration | undefined {
  return NODUS_TOOLS.find((tool) => tool.name === name)
}
