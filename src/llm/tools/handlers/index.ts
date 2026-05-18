/**
 * Tool Handlers Index
 *
 * Central registry of all LLM tool handlers.
 * Import and register handlers here to make them available.
 */

import type { ToolHandler, ToolContext } from './types'

// Re-export types
export * from './types'

// Import handlers
import {
  createThemeHandler,
  updateThemeHandler,
  applyThemeHandler,
  listThemesHandler,
} from './themeHandlers'

import {
  rememberHandler,
  setGoalHandler,
  updateProgressHandler,
  completeGoalHandler,
  pushTaskHandler,
  popTaskHandler,
  peekStackHandler,
  clearStackHandler,
} from './memoryHandlers'

import {
  smartColorHandler,
  colorMatchingHandler,
  colorRegexHandler,
  resetEdgeColorsHandler,
} from './colorHandlers'

/**
 * Tool handler registry
 * Maps tool names to their handler functions
 */
const toolRegistry = new Map<string, ToolHandler>()

// Register theme handlers
toolRegistry.set('create_theme', createThemeHandler)
toolRegistry.set('update_theme', updateThemeHandler)
toolRegistry.set('apply_theme', applyThemeHandler)
toolRegistry.set('list_themes', listThemesHandler)

// Register memory handlers
toolRegistry.set('remember', rememberHandler)
toolRegistry.set('set_goal', setGoalHandler)
toolRegistry.set('update_progress', updateProgressHandler)
toolRegistry.set('complete_goal', completeGoalHandler)
toolRegistry.set('push_task', pushTaskHandler)
toolRegistry.set('pop_task', popTaskHandler)
toolRegistry.set('peek_stack', peekStackHandler)
toolRegistry.set('clear_stack', clearStackHandler)

// Register color handlers
toolRegistry.set('smart_color', smartColorHandler)
toolRegistry.set('color_matching', colorMatchingHandler)
toolRegistry.set('color_regex', colorRegexHandler)
toolRegistry.set('reset_edge_colors', resetEdgeColorsHandler)

/**
 * Get a registered tool handler by name
 */
export function getToolHandler(name: string): ToolHandler | undefined {
  return toolRegistry.get(name)
}

/**
 * Check if a tool is registered
 */
export function hasToolHandler(name: string): boolean {
  return toolRegistry.has(name)
}

/**
 * Get all registered tool names
 */
export function getRegisteredTools(): string[] {
  return Array.from(toolRegistry.keys())
}

/**
 * Execute a registered tool
 * Returns null if tool not found
 */
export async function executeRegisteredTool(
  name: string,
  args: Record<string, unknown>,
  ctx: ToolContext
): Promise<string | null> {
  const handler = toolRegistry.get(name)
  if (!handler) return null
  return handler(args, ctx)
}
