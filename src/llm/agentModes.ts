/**
 * Agent Modes Configuration
 *
 * Defines the three agent modes with their prompts and iteration caps:
 * - Explore: research and build the graph
 * - Plan: read-only; design a plan for approval
 * - Execute: carry out an approved plan
 *
 * Which tools a mode offers is declared on each tool and read from the
 * registry; no list of tool names lives here
 * (PRODUCT_DESIGN.md > A tool declares its modes).
 */

import type { AgentMode } from './types'
import { toolRegistry } from './registry'

/**
 * Mode configuration with prompt additions
 */
export interface AgentModeConfig {
  name: AgentMode
  description: string
  maxIterations: number
  systemPromptAddition: string
}

/**
 * Explore mode - research and build
 */
const exploreMode: AgentModeConfig = {
  name: 'explore',
  description: 'Research mode - gather information and build the graph',
  maxIterations: 200,
  systemPromptAddition: `
MODE: EXPLORE (Research & Build)
Research thoroughly AND build the graph as you discover information.

METHODOLOGY - RESEARCH AND CREATE SIMULTANEOUSLY:
1. wikipedia_search() for the main topic
2. fetch_wikipedia() for each article found
3. CREATE A NODE for each key concept as you discover it
4. CREATE EDGES to connect related concepts
5. Extract more concepts, search for those
6. Keep creating nodes as you learn
7. validate_claim() on important facts
8. check_completeness() - if < 90%, KEEP GOING
9. auto_layout() periodically to organize

BUILD THE GRAPH AS YOU RESEARCH - don't wait until the end.
Each Wikipedia article = potential nodes.
Each relationship discovered = an edge.

EXPECT 50-200 TOOL CALLS mixing research and creation.
When done, the graph should represent your research visually.`,
}

/**
 * Plan mode - design approach
 */
const planMode: AgentModeConfig = {
  name: 'plan',
  description: 'Research and read only, then propose a plan for approval',
  maxIterations: 200,
  systemPromptAddition: `
MODE: PLAN (Research, then propose)
Research and read ONLY. Do NOT modify the graph in this phase: you have no tools
to create, edit, delete, connect, or lay out nodes. Nothing happens to the user's
graph until they approve your plan.

METHODOLOGY:
1. read_graph() / query_nodes() to see what already exists
2. wikipedia_search(), fetch_wikipedia(), research() to gather information
3. validate_claim() / check_completeness() as needed
4. think() to synthesize
5. create_plan() - list concrete steps. For EVERY step set "action":
   - "create" for new nodes (put the node titles in "targets")
   - "edit" for changes to existing nodes (put their titles in "targets")
   - "connect" for edges, "delete" for removals, "other" for layout/color
6. request_approval()

The plan must let the user see exactly what will be created versus edited before
they approve. Do not over-research: propose a plan once you know enough to act.`,
}

/**
 * Execute mode - make changes
 */
const executeMode: AgentModeConfig = {
  name: 'execute',
  description: 'Execute approved plan and make changes',
  maxIterations: 500,
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
 * The tools a mode offers, from each tool's declaration
 */
export function toolsForMode(mode: AgentMode) {
  return toolRegistry.getToolsForMode(mode)
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
