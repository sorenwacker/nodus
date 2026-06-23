/**
 * LLM-related types
 */

export interface AgentTool {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: {
      type: 'object'
      properties: Record<string, {
        type: string
        description?: string
        items?: unknown
      }>
      required?: string[]
    }
  }
}

// Alias for use in composables
export type ToolDefinition = AgentTool

export interface AgentTask {
  id: string
  description: string
  status: 'pending' | 'running' | 'done' | 'error'
}

export interface ToolCall {
  name: string
  arguments: Record<string, unknown>
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  tool_calls?: Array<{
    id: string
    type: 'function'
    function: {
      name: string
      arguments: string
    }
  }>
  tool_call_id?: string
}

/**
 * Agent mode determines available tools and behavior
 */
export type AgentMode = 'explore' | 'plan' | 'execute'

/**
 * What a plan step does to the graph. Lets the approval UI tell the user, up
 * front, whether the agent will create new nodes or only change existing ones.
 */
export type PlanStepAction = 'create' | 'edit' | 'delete' | 'connect' | 'research' | 'other'

/**
 * A single step in an agent plan
 */
export interface PlanStep {
  id: string
  description: string
  status: 'pending' | 'approved' | 'rejected' | 'in_progress' | 'done' | 'error'
  details?: string
  /** Effect on the graph, declared by the agent when it builds the plan. */
  action?: PlanStepAction
  /** Node titles this step creates or edits, when known. */
  targets?: string[]
  toolCalls?: string[]
}

/**
 * An agent plan with steps requiring user approval
 */
export interface AgentPlan {
  id: string
  title: string
  steps: PlanStep[]
  status: 'draft' | 'pending_approval' | 'approved' | 'executing' | 'completed' | 'cancelled'
  createdAt: number
  approvedAt?: number
}

/**
 * Research result from web or local sources
 */
export interface ResearchResult {
  source: 'web' | 'local' | 'wikipedia'
  title: string
  content: string
  url?: string
  nodeId?: string
}

/**
 * Session memory for tracking current conversation goal and progress
 * Cleared when agent completes or user starts new task
 */
export interface SessionMemory {
  goal: string
  progress: number // 0-100
  completed: string[]
  current_step: string | null
  next_steps: string[]
  blockers: string[]
  started_at: string // ISO timestamp
}

/**
 * A task in the agent's todo stack (LIFO queue)
 */
export interface StackTask {
  id: string
  description: string
  priority: 'high' | 'medium' | 'low'
  context?: Record<string, unknown>
  created_at: string // ISO timestamp
}

/**
 * Combined agent memory structure
 */
export interface AgentMemory {
  session: SessionMemory | null
  stack: StackTask[]
  facts: string[] // existing memories
}
