/**
 * Tool Registry - Plugin-friendly tool registration system
 *
 * Enables dependency injection pattern for LLM tools:
 * - Tools self-register with their definition and handler
 * - Plugins can add tools without modifying core files
 * - Single source of truth for tool definitions and execution
 */

import type { Node, Edge } from '../types'

// Tool parameter schema (JSON Schema subset)
export interface ToolParameterSchema {
  type: string
  description?: string
  items?: ToolParameterSchema
  properties?: Record<string, ToolParameterSchema>
  required?: string[]
}

// Tool definition for LLM function calling
export interface ToolDefinition {
  name: string
  description: string
  parameters: {
    type: 'object'
    properties: Record<string, ToolParameterSchema>
    required?: string[]
  }
}

// Context passed to tool handlers
export interface ToolContext {
  store: INodeStore
  log: (msg: string) => void
  screenToCanvas: (x: number, y: number) => { x: number; y: number }
  snapToGrid: (value: number) => number
  ollamaModel: string
  ollamaContextLength: number
  // Undo support for content changes
  pushContentUndo?: (nodeId: string, oldContent: string | null, oldTitle: string) => void
}

// Store interface - enables swapping implementations
export interface INodeStore {
  filteredNodes: Node[]
  filteredEdges: Edge[]
  createNode: (data: Partial<Node>) => Promise<Node>
  createEdge: (data: { source_node_id: string; target_node_id: string; label?: string; color?: string }) => Promise<Edge>
  deleteNode: (id: string) => Promise<void>
  deleteEdge: (id: string) => Promise<void>
  updateNodePosition: (id: string, x: number, y: number) => Promise<void>
  updateNodeContent: (id: string, content: string) => Promise<void>
  updateNodeTitle: (id: string, title: string) => Promise<void>
  updateNodeColor?: (id: string, color: string) => Promise<void>
  updateEdgeLabel?: (id: string, label: string | null) => Promise<void>
  updateEdgeColor?: (id: string, color: string | null) => Promise<void>
}

// Tool handler function signature
export type ToolHandler = (
  args: Record<string, unknown>,
  ctx: ToolContext
) => Promise<string>

// Registered tool entry
interface RegisteredTool {
  definition: ToolDefinition
  handler: ToolHandler
  category?: string
}

/**
 * Tool Registry - Singleton pattern with registration API
 */
class ToolRegistry {
  private tools = new Map<string, RegisteredTool>()
  private categories = new Map<string, Set<string>>()

  /**
   * Register a tool with its definition and handler
   */
  register(
    definition: ToolDefinition,
    handler: ToolHandler,
    options?: { category?: string }
  ): void {
    const name = definition.name

    if (this.tools.has(name)) {
      console.warn(`[ToolRegistry] Overwriting existing tool: ${name}`)
    }

    this.tools.set(name, {
      definition,
      handler,
      category: options?.category,
    })

    // Track by category
    const category = options?.category || 'default'
    if (!this.categories.has(category)) {
      this.categories.set(category, new Set())
    }
    this.categories.get(category)!.add(name)
  }

  /**
   * Unregister a tool (useful for plugin cleanup)
   */
  unregister(name: string): boolean {
    const tool = this.tools.get(name)
    if (!tool) return false

    this.tools.delete(name)

    // Remove from category tracking
    const category = tool.category || 'default'
    this.categories.get(category)?.delete(name)

    return true
  }

  /**
   * Get all tool definitions for LLM function calling
   */
  getToolDefinitions(): Array<{ type: 'function'; function: ToolDefinition }> {
    return Array.from(this.tools.values()).map(t => ({
      type: 'function' as const,
      function: t.definition,
    }))
  }

  /**
   * Get tool definitions filtered by category
   */
  getToolsByCategory(category: string): Array<{ type: 'function'; function: ToolDefinition }> {
    const names = this.categories.get(category)
    if (!names) return []

    return Array.from(names)
      .map(name => this.tools.get(name))
      .filter((t): t is RegisteredTool => t !== undefined)
      .map(t => ({
        type: 'function' as const,
        function: t.definition,
      }))
  }

  /**
   * Get tool definitions filtered by multiple categories
   */
  getToolsByCategories(categories: string[]): Array<{ type: 'function'; function: ToolDefinition }> {
    const allNames = new Set<string>()
    for (const category of categories) {
      const names = this.categories.get(category)
      if (names) {
        for (const name of names) {
          allNames.add(name)
        }
      }
    }

    return Array.from(allNames)
      .map(name => this.tools.get(name))
      .filter((t): t is RegisteredTool => t !== undefined)
      .map(t => ({
        type: 'function' as const,
        function: t.definition,
      }))
  }

  /**
   * Execute a tool by name
   */
  async execute(
    name: string,
    rawArgs: unknown,
    ctx: ToolContext
  ): Promise<string> {
    const tool = this.tools.get(name)

    if (!tool) {
      return `__UNHANDLED__:${name}`
    }

    // Parse args if string
    let args: Record<string, unknown> = {}
    if (typeof rawArgs === 'string') {
      try {
        args = JSON.parse(rawArgs)
      } catch {
        args = {}
      }
    } else {
      args = (rawArgs as Record<string, unknown>) || {}
    }

    ctx.log(`> ${name}(${JSON.stringify(args).slice(0, 50)}...)`)

    try {
      return await tool.handler(args, ctx)
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      return `Error executing ${name}: ${msg}`
    }
  }

  /**
   * Check if a tool is registered
   */
  has(name: string): boolean {
    return this.tools.has(name)
  }

  /**
   * Get all registered tool names
   */
  getToolNames(): string[] {
    return Array.from(this.tools.keys())
  }

  /**
   * Get all categories
   */
  getCategories(): string[] {
    return Array.from(this.categories.keys())
  }

  /**
   * Clear all tools (useful for testing)
   */
  clear(): void {
    this.tools.clear()
    this.categories.clear()
  }
}

// Singleton instance
export const toolRegistry = new ToolRegistry()

// Helper to create tool definitions with type safety
export function defineTool<T extends Record<string, unknown>>(
  name: string,
  description: string,
  parameters: ToolDefinition['parameters'],
  handler: (args: T, ctx: ToolContext) => Promise<string>,
  options?: { category?: string }
): void {
  toolRegistry.register(
    { name, description, parameters },
    handler as ToolHandler,
    options
  )
}
