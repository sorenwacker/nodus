/**
 * Tool registry: the one place a tool is defined.
 *
 * An entry holds the definition the model sees, the declaration the
 * application reads (modes, mutation, required services) and the handler
 * that does the work. Nothing outside this registry maps a tool name to
 * behaviour (PRODUCT_DESIGN.md > One implementation per tool, A tool
 * declares its modes).
 */

import type { CreateNodeInput, Node, Edge } from '../types'
import type { NodeService } from '../services/nodeService'
import type { AgentPlan, SessionMemory, StackTask } from './types'
import type { DeepResearchOptions, DeepResearchResult } from './research'
import { asOneUndoStep } from '../stores/nodes/undoRecorder'
import { errorLog } from './agentLog'

// Tool parameter schema (JSON Schema subset)
export interface ToolParameterSchema {
  type: string
  description?: string
  items?: ToolParameterSchema
  properties?: Record<string, ToolParameterSchema>
  required?: string[]
  enum?: string[]
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

/** The agent surfaces a tool can be offered in. `node` is the per-node agent. */
export type AgentToolMode = 'explore' | 'plan' | 'execute' | 'node'
export const AGENT_TOOL_MODES: readonly AgentToolMode[] = ['explore', 'plan', 'execute', 'node']

/** Optional context services a handler may depend on. */
export type ToolService = 'llm' | 'search' | 'themes' | 'plan' | 'memory' | 'nodeDraft' | 'layout'

/** What a tool declares about itself beyond its definition. */
export interface ToolDeclaration {
  modes: AgentToolMode[]
  mutates: boolean
  requires?: ToolService[]
  /** Required when `modes` is empty: why the tool is registered but not offered */
  unexposedReason?: string
}

/** A change of course the runner must act on. Never part of the result text. */
export type ToolSignal = 'done' | 'await_approval' | 'node_done'

export interface ToolOutcome {
  /** The tool result the model receives */
  text: string
  signal?: ToolSignal
}

export type ToolResult = string | ToolOutcome

// ---------------------------------------------------------------------------
// Context services
// ---------------------------------------------------------------------------

/** A model call through the LLM queue. */
export interface LLMService {
  generate: (prompt: string, system?: string, priority?: number) => Promise<string>
  /** True once the run was stopped, so a long tool can give up between calls */
  isCancelled: () => boolean
}

export interface SearchHit {
  title: string
  url?: string
  content: string
}

/** Web and Wikipedia access, plus the research procedures built on them. */
export interface SearchService {
  webSearch: (query: string) => Promise<SearchHit[]>
  /** Page text, truncated to what the run can carry */
  fetchUrl: (url: string) => Promise<string>
  searchWikipedia: (query: string, limit: number) => Promise<SearchHit[]>
  fetchWikipediaArticle: (title: string, log?: (msg: string) => void) => Promise<string | null>
  quickResearch: (
    query: string,
    localNodes: Node[],
    sources: Array<'local' | 'web' | 'wikipedia'>
  ) => Promise<string>
  deepResearch: (topic: string, options: DeepResearchOptions) => Promise<DeepResearchResult>
  formatDeepResearchResults: (result: DeepResearchResult) => string
  validateClaim: (
    claim: string,
    localNodes: Node[]
  ) => Promise<{ validated: boolean; confidence: string; sources: string[] }>
}

export interface ThemesService {
  themes: Array<{
    id: string
    name: string
    display_name: string
    yaml_content: string
    is_builtin: number
  }>
  builtinThemes: Array<{ name: string }>
  customThemes: Array<{ name: string }>
  currentThemeName: string
  createTheme: (input: {
    name: string
    display_name: string
    yaml_content: string
  }) => Promise<{ id: string; name: string }>
  updateTheme: (input: { id: string; yaml_content: string; display_name: string }) => Promise<void>
  setTheme: (name: string) => void
}

/** The plan under approval and the task list the panel shows. */
export interface PlanService {
  currentPlan: () => AgentPlan | null
  createPlan: (
    title: string,
    steps: Array<{ description: string; action?: string; targets?: string[]; details?: string }>
  ) => AgentPlan
  /** Opens the approval dialog; false when there is no plan to approve */
  requestApproval: () => boolean
  isApprovalOpen: () => boolean
  setTasks: (tasks: string[]) => void
  updateTaskStatus: (index: number, status: 'done' | 'failed' | 'in_progress') => boolean
  taskCount: () => number
  taskDescription: (index: number) => string | undefined
}

/** Facts, session and stack memory for the current workspace. */
export interface MemoryService {
  workspaceId: () => string | null
  addFact: (workspaceId: string, message: string) => void
  getSession: (workspaceId: string) => SessionMemory | null
  setSession: (workspaceId: string, session: SessionMemory) => void
  clearSession: (workspaceId: string) => void
  updateProgress: (workspaceId: string, progress: number, completedAction?: string) => void
  getStack: (workspaceId: string) => StackTask[]
  pushTask: (workspaceId: string, task: Omit<StackTask, 'id' | 'created_at'>) => StackTask
  popTask: (workspaceId: string) => StackTask | null
  peekTask: (workspaceId: string) => StackTask | null
  clearStack: (workspaceId: string) => void
}

/** The note the node agent is editing. */
export interface NodeDraftService {
  content: string
  title: string
  /** True once the run has written content, which `node_done` requires */
  saved: boolean
  updateContent: (content: string) => Promise<void>
  updateTitle: (title: string) => Promise<void>
}

export interface LayoutService {
  applyForceLayout: (
    nodes: Array<{ id: string; x: number; y: number; width: number; height: number }>,
    edges: Array<{ source: string; target: string }>,
    options?: { centerX?: number; centerY?: number; iterations?: number }
  ) => Promise<Map<string, { x: number; y: number }>>
}

// Context passed to tool handlers
export interface ToolContext {
  store: INodeStore
  log: (msg: string) => void
  screenToCanvas: (x: number, y: number) => { x: number; y: number }
  snapToGrid: (value: number) => number
  model: string
  contextLength: number
  // Undo support for content changes
  pushContentUndo?: (nodeId: string, oldContent: string | null, oldTitle: string) => void
  /**
   * Record several nodes' content as ONE undo step, for a batch rewrite. One
   * entry per node would mean pressing undo once per node to reverse a single
   * instruction (PRODUCT_DESIGN.md > Recording an undo step).
   */
  pushContentsUndo?: (
    entries: Array<{ nodeId: string; content: string | null; title: string }>
  ) => void
  // NodeService for guaranteed undo on deletions and moves
  service?: NodeService
  // Selection state for selection-aware tools
  selectedNodeIds?: string[]
  editingNodeId?: string | null
  // Services, supplied by whoever composes the application. A handler whose
  // service is absent answers that the capability is unavailable
  llm?: LLMService
  search?: SearchService
  themes?: ThemesService
  plan?: PlanService
  memory?: MemoryService
  nodeDraft?: NodeDraftService
  layout?: LayoutService
}

// Store interface - enables swapping implementations
export interface INodeStore {
  filteredNodes: Node[]
  filteredEdges: Edge[]
  createNode: (data: CreateNodeInput) => Promise<Node>
  createEdge: (data: { source_node_id: string; target_node_id: string; label?: string; color?: string }) => Promise<Edge>
  deleteNode: (id: string) => Promise<void>
  deleteEdge: (id: string) => Promise<void>
  updateNodePosition: (id: string, x: number, y: number) => Promise<void>
  updateNodeContent: (id: string, content: string) => Promise<void>
  updateNodeTitle: (id: string, title: string) => Promise<void>
  updateNodeTags?: (id: string, tags: string[]) => Promise<void>
  // Frames and storylines: optional so contexts that do not provide them
  // simply report the capability as unavailable rather than crashing
  getFrames?: () => Array<{ id: string; title?: string }>
  createFrame?: (
    x: number,
    y: number,
    width: number,
    height: number,
    title: string
  ) => Promise<{ id: string; title?: string }> | { id: string; title?: string }
  assignNodesToFrame?: (nodeIds: string[], frameId: string | null) => void
  getStorylines?: () => Array<{ id: string; title: string; description?: string | null }>
  createStoryline?: (title: string, description?: string) => Promise<{ id: string }>
  addNodeToStoryline?: (storylineId: string, nodeId: string) => Promise<void>
  updateNodeColor?: (id: string, color: string) => Promise<void>
  updateEdgeLabel?: (id: string, label: string | null) => Promise<void>
  updateEdgeColor?: (id: string, color: string | null) => Promise<void>
}

// Tool handler function signature
export type ToolHandler = (
  args: Record<string, unknown>,
  ctx: ToolContext
) => Promise<ToolResult>

// Registered tool entry
interface RegisteredTool {
  definition: ToolDefinition
  handler: ToolHandler
  declaration: ToolDeclaration
}

function toOutcome(result: ToolResult): ToolOutcome {
  return typeof result === 'string' ? { text: result } : result
}

export class ToolRegistry {
  private tools = new Map<string, RegisteredTool>()

  /**
   * Register a tool. The declaration is validated here, so a tool that
   * breaks a rule fails at registration rather than sitting misconfigured.
   */
  register(definition: ToolDefinition, handler: ToolHandler, declaration: ToolDeclaration): void {
    const name = definition.name
    if (!declaration || !Array.isArray(declaration.modes)) {
      throw new Error(`[ToolRegistry] ${name}: a declaration with modes is required`)
    }
    if (declaration.mutates && declaration.modes.includes('plan')) {
      throw new Error(`[ToolRegistry] ${name}: a mutating tool cannot be offered in plan mode`)
    }
    if (declaration.modes.length === 0 && !declaration.unexposedReason) {
      throw new Error(`[ToolRegistry] ${name}: a tool offered in no mode needs an unexposedReason`)
    }
    if (this.tools.has(name)) {
      console.warn(`[ToolRegistry] Overwriting existing tool: ${name}`)
    }
    this.tools.set(name, { definition, handler, declaration })
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

  /** The tools a mode offers, derived from each tool's declaration */
  getToolsForMode(mode: AgentToolMode): Array<{ type: 'function'; function: ToolDefinition }> {
    return Array.from(this.tools.values())
      .filter(t => t.declaration.modes.includes(mode))
      .map(t => ({ type: 'function' as const, function: t.definition }))
  }

  declarationOf(name: string): ToolDeclaration | undefined {
    return this.tools.get(name)?.declaration
  }

  /**
   * Execute a tool by name.
   *
   * One tool call is one undo step, whether it writes one node or three
   * hundred: grouping here means a tool author does nothing to make their
   * tool undoable (PRODUCT_DESIGN.md > Recording an undo step).
   */
  async execute(name: string, rawArgs: unknown, ctx: ToolContext): Promise<ToolOutcome> {
    const tool = this.tools.get(name)
    if (!tool) {
      return { text: `Error: Unknown tool "${name}"` }
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

    const missing = (tool.declaration.requires ?? []).filter(service => ctx[service] === undefined)
    if (missing.length > 0) {
      return {
        text: `Error: ${name} is not available in this context (needs ${missing.join(', ')})`,
      }
    }

    // Log tool call with more context
    const argsStr = JSON.stringify(args)
    const preview = argsStr.length > 100 ? argsStr.slice(0, 100) + '...' : argsStr
    ctx.log(`> ${name}(${preview})`)

    try {
      const outcome = toOutcome(await asOneUndoStep(() => tool.handler(args, ctx)))
      const resultPreview = outcome.text.length > 80 ? outcome.text.slice(0, 80) + '...' : outcome.text
      if (resultPreview) ctx.log(`  → ${resultPreview}`)
      return outcome
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      ctx.log(errorLog(`${name}: ${msg}`))
      return { text: `Error executing ${name}: ${msg}` }
    }
  }

  /**
   * Check if a tool is registered
   */
  has(name: string): boolean {
    return this.tools.has(name)
  }

  /**
   * Clear all tools (useful for testing)
   */
  clear(): void {
    this.tools.clear()
  }
}

// Singleton instance
export const toolRegistry = new ToolRegistry()

/**
 * Find a node by title: exact match first, then case-insensitive.
 * All tools must resolve titles through this helper so the same title string
 * behaves identically in every tool (LLMs frequently vary capitalization).
 */
export function findNodeByTitle<T extends { title: string }>(
  nodes: T[],
  title: string
): T | undefined {
  const exact = nodes.find(n => n.title === title)
  if (exact) return exact
  const lower = title.toLowerCase()
  return nodes.find(n => n.title.toLowerCase() === lower)
}

// Helper to create tool definitions with type safety
export function defineTool<T extends Record<string, unknown>>(
  name: string,
  description: string,
  parameters: ToolDefinition['parameters'],
  handler: (args: T, ctx: ToolContext) => Promise<ToolResult>,
  declaration: ToolDeclaration
): void {
  toolRegistry.register({ name, description, parameters }, handler as ToolHandler, declaration)
}
