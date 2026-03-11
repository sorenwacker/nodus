/**
 * Agent tool definitions
 *
 * DEPRECATED: This file is maintained for backwards compatibility.
 * Use toolRegistry from './registry' for new tools.
 *
 * Tools are now registered in './coreTools.ts' using the registry pattern.
 */
import { toolRegistry } from './registry'
import { registerCoreTools } from './coreTools'
import type { AgentTool } from './types'

// Ensure core tools are registered
registerCoreTools()

/**
 * @deprecated Use toolRegistry.getToolDefinitions() instead
 */
export const agentTools: AgentTool[] = toolRegistry.getToolDefinitions()

// Re-export registry for direct access
export { toolRegistry, defineTool } from './registry'
export { registerCoreTools } from './coreTools'
