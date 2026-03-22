/**
 * Agent tool executor
 * Executes LLM agent tool calls using the ToolRegistry
 */
import { toolRegistry, type ToolContext, type INodeStore } from './registry'
import { registerCoreTools, resetPositionCounter } from './tools'
import { agentLogger } from '../../lib/logger'

// Re-export types for backwards compatibility
export type { ToolContext, INodeStore }
export { resetPositionCounter }

// Ensure core tools are registered
registerCoreTools()

/**
 * Execute a single agent tool
 */
export async function executeTool(
  name: string,
  rawArgs: unknown,
  ctx: ToolContext
): Promise<string> {
  agentLogger.debug(`Tool: ${name}`, rawArgs)
  return toolRegistry.execute(name, rawArgs, ctx)
}

/**
 * Get all tool definitions for LLM function calling
 */
export function getAgentTools() {
  return toolRegistry.getToolDefinitions()
}

/**
 * Check if a tool exists
 */
export function hasTool(name: string): boolean {
  return toolRegistry.has(name)
}
