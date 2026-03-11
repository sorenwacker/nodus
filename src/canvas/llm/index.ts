/**
 * LLM module
 * Provides LLM integration for the canvas
 */
export { useLLM } from './useLLM'
export { agentTools } from './tools'
export { DEFAULT_SYSTEM_PROMPT, DEFAULT_AGENT_PROMPT } from './prompts'
export { cleanContent, parseToolArgs, evalMathExpr, extractNumber, pruneMessages } from './utils'
export { executeTool, resetPositionCounter, getAgentTools, hasTool, type ToolContext } from './toolExecutor'
export type { AgentTool, AgentTask, ToolCall, ChatMessage } from './types'

// Registry exports for plugin development
export { toolRegistry, defineTool, type ToolDefinition, type ToolHandler, type INodeStore } from './registry'
export { registerCoreTools } from './coreTools'
