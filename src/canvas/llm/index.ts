/**
 * LLM module
 * Provides LLM integration for the canvas
 */
export { useLLM } from './useLLM'
export { agentTools } from './tools'
export { generate, chat, isAvailable } from './ollama'
export { cleanContent, parseToolArgs, evalMathExpr, extractNumber, pruneMessages } from './utils'
export type { AgentTool, AgentTask, OllamaSettings, ToolCall, ChatMessage } from './types'
