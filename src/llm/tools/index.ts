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
import { registerResearchTools } from './researchTools'
import { registerNodeEditTools } from './nodeEditTools'

export { resetPositionCounter } from './nodeTools'

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
  registerResearchTools()
  registerNodeEditTools()
}

// Ensure tools are registered before exporting
registerCoreTools()

/**
 * Get current agent tools from registry
 * This is a getter to ensure tools are always up-to-date
 */
export function getAgentTools(): AgentTool[] {
  return toolRegistry.getToolDefinitions()
}

/**
 * @deprecated Use getAgentTools() instead
 * Maintained for backwards compatibility - now returns fresh data
 */
export const agentTools: AgentTool[] = toolRegistry.getToolDefinitions()
