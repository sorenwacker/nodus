/**
 * Tools module index
 *
 * Re-exports all tool registration functions and provides a unified registration entry point.
 */

import { toolRegistry } from '../registry'
import type { AgentTool } from '../types'
import { registerNodeTools } from './nodeTools'
import { registerUpdateTools } from './updateTools'
import { registerBatchTools } from './batchTools'
import { registerLayoutTools } from './layoutTools'
import { registerQueryTools } from './queryTools'
import { registerSmartTools } from './smartTools'
import { registerPlanningTools } from './planningTools'
import { registerAgentTools } from './agentTools'
import { registerThemeTools } from './themeTools'

export { resetPositionCounter } from './nodeTools'

/**
 * @deprecated Use toolRegistry.getToolDefinitions() instead
 * Maintained for backwards compatibility
 */
export const agentTools: AgentTool[] = toolRegistry.getToolDefinitions()

/**
 * Register all core tools
 * Call this once at app startup
 */
export function registerCoreTools(): void {
  // Skip if already registered
  if (toolRegistry.has('create_node')) {
    return
  }

  registerNodeTools()
  registerUpdateTools()
  registerBatchTools()
  registerLayoutTools()
  registerQueryTools()
  registerSmartTools()
  registerPlanningTools()
  registerAgentTools()
  registerThemeTools()
}
