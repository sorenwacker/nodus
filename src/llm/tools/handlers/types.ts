/**
 * Tool Handler Types
 *
 * Defines the interface for LLM tool handlers.
 * Each tool is a self-contained handler that can be tested independently.
 */

import type { Ref } from 'vue'
import type { Node } from '../../../types'
import type { AgentTask, AgentPlan, SessionMemory, StackTask } from '../../types'

/**
 * Edge interface for tool handlers
 */
export interface ToolEdge {
  id: string
  source_node_id: string
  target_node_id: string
  color?: string | null
}

/**
 * Node store interface for tool handlers
 */
export interface ToolNodeStore {
  getFilteredNodes: () => Node[]
  getFilteredEdges: () => ToolEdge[]
  updateNodeContent: (id: string, content: string) => Promise<void>
  updateNodePosition: (id: string, x: number, y: number) => Promise<void>
  updateNodeColor: (id: string, color: string) => Promise<void>
  updateEdgeColor?: (id: string, color: string | null) => Promise<void>
  createEdge: (data: {
    source_node_id: string
    target_node_id: string
    label?: string
    color?: string
  }) => Promise<unknown>
  currentWorkspaceId?: string | null
}

/**
 * LLM Queue interface for generating responses
 */
export interface ToolLLMQueue {
  generate: (prompt: string, system?: string, priority?: number) => Promise<string>
}

/**
 * Themes store interface for theme operations
 */
export interface ToolThemesStore {
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
  updateTheme: (input: {
    id: string
    yaml_content: string
    display_name: string
  }) => Promise<void>
  setTheme: (name: string) => void
}

/**
 * Plan state interface
 */
export interface ToolPlanState {
  currentPlan: Ref<AgentPlan | null>
  createPlan: (
    title: string,
    steps: Array<{ description: string; details?: string }>
  ) => AgentPlan
  requestApproval: () => boolean
}

/**
 * Memory storage interface
 */
export interface ToolMemoryStorage {
  addMemory: (workspaceId: string, message: string) => void
}

/**
 * Agent memory storage interface (session + stack)
 */
export interface ToolAgentMemoryStorage {
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

/**
 * Context provided to all tool handlers
 */
export interface ToolContext {
  llmQueue: ToolLLMQueue
  callOllama: (prompt: string, system?: string) => Promise<string>
  store: ToolNodeStore
  themesStore: ToolThemesStore
  planState: ToolPlanState
  tasks: Ref<AgentTask[]>
  memoryStorage: ToolMemoryStorage
  agentMemoryStorage: ToolAgentMemoryStorage
  log: (msg: string) => void
  pushContentUndo: (id: string, content: string | null, title: string) => void
  isCancelled: () => boolean
}

/**
 * Tool handler function signature
 */
export type ToolHandler = (
  args: Record<string, unknown>,
  ctx: ToolContext
) => Promise<string>

/**
 * Tool definition with metadata
 */
export interface ToolDefinition {
  name: string
  description: string
  handler: ToolHandler
}
