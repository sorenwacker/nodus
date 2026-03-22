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
 * A single step in an agent plan
 */
export interface PlanStep {
  id: string
  description: string
  status: 'pending' | 'approved' | 'rejected' | 'in_progress' | 'done' | 'error'
  details?: string
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
