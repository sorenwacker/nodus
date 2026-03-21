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
  maxIterations: 100,
  toolWhitelist: [
    'read_graph',
    'query_nodes',
    'research',
    'deep_research',
    'fetch_wikipedia',
    'validate_claim',
    'check_completeness',
    'think',
    'done',
  ],
  systemPromptAddition: `
MODE: EXPLORE (Read-only Research)
You are in exploration mode. Your job is to gather comprehensive information.
You CANNOT make changes to the canvas in this mode.

For thorough research:
1. Use deep_research() for multi-round iterative research with cross-validation
2. Use fetch_wikipedia() to get full article content on specific topics
3. Use validate_claim() to cross-check facts across multiple sources
4. Use check_completeness() to assess if more research is needed

Keep researching iteratively until check_completeness() shows high coverage.
When you have gathered enough context, use done() to signal completion.`,
}

/**
 * Plan mode - design approach
 */
const planMode: AgentModeConfig = {
  name: 'plan',
  description: 'Design approach and create plans for user approval',
  maxIterations: 100,
  toolWhitelist: [
    'read_graph',
    'query_nodes',
    'research',
    'deep_research',
    'fetch_wikipedia',
    'validate_claim',
    'check_completeness',
    'think',
    'create_plan',
    'request_approval',
    'done',
  ],
  systemPromptAddition: `
MODE: PLAN (Design)
You are in planning mode. Your job is to research and design an approach.
You CANNOT make changes to the canvas yet - that happens after approval.

For research-heavy tasks:
1. Use deep_research() for comprehensive, multi-round research
2. Use fetch_wikipedia() for detailed information on specific topics
3. Use validate_claim() to cross-check important facts
4. Use check_completeness() to ensure thorough coverage

When research is complete:
1. Use think() to reason about the best approach
2. Use create_plan() to create a detailed step-by-step plan
3. Use request_approval() to pause for user review

The user will approve, reject, or modify your plan before execution begins.`,
}

/**
 * Execute mode - make changes
 */
const executeMode: AgentModeConfig = {
  name: 'execute',
  description: 'Execute approved plan and make changes',
  maxIterations: 500,
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
    'deep_research',
    'fetch_wikipedia',
    'validate_claim',
    'check_completeness',
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

For research tasks:
- Use deep_research() for thorough, iterative research with cross-validation
- Use fetch_wikipedia() to get detailed content from Wikipedia
- Use validate_claim() to verify facts across sources
- Use check_completeness() to ensure comprehensive coverage before finishing

Keep iterating until research is complete and validated.
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
