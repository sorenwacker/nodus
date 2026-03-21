/**
 * Agent Modes Configuration
 *
 * Defines the three agent modes with their tool whitelists and system prompts:
 * - Explore: Read-only research mode
 * - Plan: Design approach and create plans
 * - Execute: Make changes after approval
 */

import type { AgentMode } from './types'

/**
 * Mode configuration with tool filtering and prompt additions
 */
export interface AgentModeConfig {
  name: AgentMode
  description: string
  maxIterations: number
  toolWhitelist: string[]
  systemPromptAddition: string
}

/**
 * Explore mode - read-only research
 */
const exploreMode: AgentModeConfig = {
  name: 'explore',
  description: 'Read-only research mode for gathering context',
  maxIterations: 30,
  toolWhitelist: [
    'read_graph',
    'query_nodes',
    'research',
    'think',
    'done',
  ],
  systemPromptAddition: `
MODE: EXPLORE (Read-only)
You are in exploration mode. Your job is to gather information and context.
You CANNOT make changes to the canvas in this mode.
Available actions: query existing nodes, research topics, think through problems.
When you have gathered enough context, use done() to signal completion.`,
}

/**
 * Plan mode - design approach
 */
const planMode: AgentModeConfig = {
  name: 'plan',
  description: 'Design approach and create plans for user approval',
  maxIterations: 50,
  toolWhitelist: [
    'read_graph',
    'query_nodes',
    'research',
    'think',
    'create_plan',
    'request_approval',
    'done',
  ],
  systemPromptAddition: `
MODE: PLAN (Design)
You are in planning mode. Your job is to design an approach for the user's request.
You CANNOT make changes to the canvas yet - that happens after approval.
Steps:
1. Use query_nodes and research to understand the current state
2. Use think() to reason about the best approach
3. Use create_plan() to create a detailed step-by-step plan
4. Use request_approval() to pause for user review

The user will approve, reject, or modify your plan before execution begins.`,
}

/**
 * Execute mode - make changes
 */
const executeMode: AgentModeConfig = {
  name: 'execute',
  description: 'Execute approved plan and make changes',
  maxIterations: 200,
  toolWhitelist: [
    // All tools available
    'read_graph',
    'create_node',
    'create_edge',
    'create_edges_batch',
    'delete_node',
    'delete_edges',
    'delete_matching',
    'update_node',
    'move_node',
    'batch_update',
    'generate_sequence',
    'create_nodes_batch',
    'auto_layout',
    'query_nodes',
    'for_each_node',
    'smart_move',
    'smart_connect',
    'smart_color',
    'color_matching',
    'web_search',
    'research',
    'think',
    'plan',
    'update_task',
    'remember',
    'create_theme',
    'update_theme',
    'apply_theme',
    'list_themes',
    'done',
  ],
  systemPromptAddition: `
MODE: EXECUTE (Approved)
You are executing an approved plan. Make the changes as specified.
Work through each step methodically. Use update_task() to mark progress.
If you encounter issues, document them but continue with other steps if possible.`,
}

/**
 * Get mode configuration by name
 */
export function getAgentMode(mode: AgentMode): AgentModeConfig {
  switch (mode) {
    case 'explore':
      return exploreMode
    case 'plan':
      return planMode
    case 'execute':
      return executeMode
    default:
      return executeMode
  }
}

/**
 * Filter tools based on current mode
 */
export function filterToolsForMode<T extends { function: { name: string } }>(
  tools: T[],
  mode: AgentMode
): T[] {
  const config = getAgentMode(mode)
  const whitelist = new Set(config.toolWhitelist)
  return tools.filter(tool => whitelist.has(tool.function.name))
}

/**
 * Get system prompt addition for mode
 */
export function getModeSystemPrompt(mode: AgentMode): string {
  return getAgentMode(mode).systemPromptAddition
}

/**
 * Get max iterations for mode
 */
export function getModeMaxIterations(mode: AgentMode): number {
  return getAgentMode(mode).maxIterations
}

/**
 * Default starting mode for new agent sessions
 */
export const DEFAULT_AGENT_MODE: AgentMode = 'plan'
