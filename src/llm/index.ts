/**
 * LLM module
 * Provides LLM integration for the canvas
 */
export { useLLM } from './useLLM'
export { DEFAULT_SYSTEM_PROMPT, DEFAULT_AGENT_PROMPT } from './prompts'
export { cleanContent, evalMathExpr } from './utils'
export type { AgentTool, AgentTask, ToolCall, ChatMessage } from './types'

// Registry exports for plugin development
export {
  toolRegistry,
  defineTool,
  type ToolDefinition,
  type ToolHandler,
  type ToolContext,
  type INodeStore,
} from './registry'
export { registerCoreTools, getAgentTools, resetPositionCounter } from './tools'

// LLM Queue - all LLM calls MUST go through this
export { llmQueue } from './queue'
