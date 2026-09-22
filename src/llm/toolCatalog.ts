/**
 * The tool table Settings > AI > Agent shows: every registered tool with its
 * declaration and whether it is usable with the services configured now.
 *
 * Read from the registry, so it cannot describe a tool the agent does not
 * have (PRODUCT_DESIGN.md > Agent section).
 */
import { toolRegistry, type AgentToolMode, type ToolService } from './registry'
import { registerCoreTools } from './tools'

/** Which optional services the user has configured. Every other service the canvas always composes. */
export interface ConfiguredServices {
  search: boolean
}

export interface AgentToolRow {
  name: string
  description: string
  modes: AgentToolMode[]
  mutates: boolean
  unexposedReason?: string
  /** Required services that are not configured, so the tool cannot run now */
  missing: ToolService[]
}

export function describeAgentTools(configured: ConfiguredServices): AgentToolRow[] {
  registerCoreTools()
  return toolRegistry
    .getToolDefinitions()
    .map(({ function: definition }) => {
      const declaration = toolRegistry.declarationOf(definition.name)!
      const missing = (declaration.requires ?? []).filter(
        service => service === 'search' && !configured.search
      )
      return {
        name: definition.name,
        description: definition.description,
        modes: declaration.modes,
        mutates: declaration.mutates,
        unexposedReason: declaration.unexposedReason,
        missing,
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name))
}
