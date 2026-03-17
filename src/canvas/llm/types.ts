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
