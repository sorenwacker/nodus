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
    'web_search',
    'research',
    'deep_research',
    'fetch_wikipedia',
    'wikipedia_search',
    'validate_claim',
    'check_completeness',
    'think',
    'done',
  ],
  systemPromptAddition: `
MODE: EXPLORE (Read-only Research)
You are in exploration mode. Your job is to gather comprehensive information.
You CANNOT make changes to the canvas in this mode.

RESEARCH METHODOLOGY - ITERATE EXTENSIVELY:
1. Start with wikipedia_search() for the main topic
2. Call fetch_wikipedia() for EACH article found - read them thoroughly
3. Extract every key concept, person, term, region, etc.
4. For EACH concept: call wikipedia_search() again
5. Fetch those articles too with fetch_wikipedia()
6. Use research() for web searches on specific aspects
7. Call validate_claim() on important facts
8. Call check_completeness() - if < 90%, KEEP GOING
9. Repeat until you've explored all branches of the topic

EXPECT TO MAKE 30-100 TOOL CALLS for proper research.
Follow every interesting lead. Cross-reference sources.
Build a complete picture before signaling done().

When comprehensively researched, use done() with a full summary.`,
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
    'web_search',
    'research',
    'deep_research',
    'fetch_wikipedia',
    'wikipedia_search',
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

FOR RESEARCH TASKS - USE ITERATIVE APPROACH:
Do NOT just call deep_research once. Instead, iterate manually:

1. Start with wikipedia_search() to find key articles
2. Call fetch_wikipedia() for EACH relevant article found
3. Use research() or web_search() for additional queries
4. Extract concepts from results and search for THOSE
5. Call validate_claim() on important facts
6. Call check_completeness() - if score < 90%, KEEP RESEARCHING
7. Generate follow-up queries and repeat steps 1-6
8. Continue until completeness is HIGH or you've exhausted the topic

ITERATE MANY TIMES. Use 20-50+ tool calls for thorough research.
Each Wikipedia article, each web search, each validation is a separate call.

When research is complete:
1. Use think() to synthesize findings
2. Use create_plan() to create a detailed step-by-step plan
3. Use request_approval() to pause for user review`,
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
    'wikipedia_search',
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

FOR RESEARCH-HEAVY EXECUTION - ITERATE EXTENSIVELY:
Do NOT rely on single tool calls. For comprehensive research:

1. Call wikipedia_search() with different query variations
2. Call fetch_wikipedia() for EVERY relevant article - read them all
3. Extract key concepts from each article
4. Search for those concepts: more wikipedia_search(), more fetch_wikipedia()
5. Use research() for web results on specific subtopics
6. Call validate_claim() on key facts you discover
7. Call check_completeness() periodically
8. If completeness < 90%, generate new queries and CONTINUE
9. Keep going until you've thoroughly covered the topic

USE 50-100+ TOOL CALLS for exhaustive research.
Create nodes as you discover information.
Cross-reference and validate findings.
Do not stop until the topic is comprehensively covered.`,
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
