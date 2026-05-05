/**
 * System prompt building for agent runner
 *
 * Extracted from useAgentRunner.ts to reduce file size and improve maintainability.
 */

import type { AgentMode, AgentPlan, ChatMessage } from '../../../llm/types'
import { llmStorage, memoryStorage } from '../../../lib/storage'
import { DEFAULT_AGENT_PROMPT } from '../../../llm/prompts'
import { getModeSystemPrompt } from '../../../llm/agentModes'
import { escapeForPrompt } from '../../../lib/promptSecurity'

/** Max characters for node titles in system prompt */
const MAX_TITLE_LENGTH = 100

/** Truncate text to max length, adding ellipsis if truncated */
function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  return text.slice(0, maxLength - 3) + '...'
}

interface SystemPromptMessage {
  role: 'system'
  content: string
}

interface NodeInfo {
  id: string
  title: string
  canvas_x: number
  canvas_y: number
  markdown_content: string | null
}

interface EdgeInfo {
  source_node_id: string
  target_node_id: string
  label: string | null
  link_type: string | null
}

/**
 * Generate system prompt with current node state and memories
 * Uses XML-like structured separators to prevent prompt injection
 */
export function buildSystemPrompt(
  nodes: NodeInfo[],
  edges: EdgeInfo[],
  workspaceId: string,
  mode: AgentMode,
  plan?: AgentPlan | null
): SystemPromptMessage {
  let nodeList = 'No nodes yet. Canvas is empty.'

  // Build node ID to title map for edge display (truncated for prompt safety)
  const nodeIdToTitle = new Map<string, string>()
  for (const n of nodes) {
    nodeIdToTitle.set(n.id, truncateText(n.title, MAX_TITLE_LENGTH))
  }

  if (nodes.length > 0 && nodes.length <= 30) {
    // Escape and truncate node titles to prevent prompt injection and token overflow
    nodeList = nodes.map((n, i) =>
      `${i+1}. <node_title>${escapeForPrompt(truncateText(n.title, MAX_TITLE_LENGTH))}</node_title> @(${Math.round(n.canvas_x)},${Math.round(n.canvas_y)})`
    ).join('\n')
  } else if (nodes.length > 30) {
    nodeList = nodes.slice(0, 20).map(n => `<node_title>${escapeForPrompt(truncateText(n.title, MAX_TITLE_LENGTH))}</node_title>`).join(', ') + `... (${nodes.length} total)`
  }

  // Build edge list showing connections
  let edgeList = 'No edges yet.'
  if (edges.length > 0 && edges.length <= 50) {
    edgeList = edges.map(e => {
      const sourceTitle = nodeIdToTitle.get(e.source_node_id) || '?'
      const targetTitle = nodeIdToTitle.get(e.target_node_id) || '?'
      const label = e.label || e.link_type || 'related'
      return `"${escapeForPrompt(sourceTitle)}" --[${label}]--> "${escapeForPrompt(targetTitle)}"`
    }).join('\n')
  } else if (edges.length > 50) {
    edgeList = edges.slice(0, 30).map(e => {
      const sourceTitle = nodeIdToTitle.get(e.source_node_id) || '?'
      const targetTitle = nodeIdToTitle.get(e.target_node_id) || '?'
      return `"${escapeForPrompt(sourceTitle)}" --> "${escapeForPrompt(targetTitle)}"`
    }).join('\n') + `\n... (${edges.length} total edges)`
  }

  // Identify disconnected nodes (nodes with no edges)
  const connectedNodeIds = new Set<string>()
  for (const e of edges) {
    connectedNodeIds.add(e.source_node_id)
    connectedNodeIds.add(e.target_node_id)
  }
  const disconnectedNodes = nodes.filter(n => !connectedNodeIds.has(n.id))
  const disconnectedList = disconnectedNodes.length > 0
    ? `\nDISCONNECTED NODES (${disconnectedNodes.length}): ${disconnectedNodes.map(n => `"${escapeForPrompt(truncateText(n.title, MAX_TITLE_LENGTH))}"`).join(', ')}`
    : ''

  const customRules = llmStorage.getAgentPrompt(DEFAULT_AGENT_PROMPT)

  // Load workspace memories
  const memories = memoryStorage.getMemories(workspaceId)
  const memorySection = memories.length > 0
    ? `\nMEMORY (from previous sessions):\n${memories.map(m => `- ${m}`).join('\n')}\n`
    : ''

  // Get mode-specific prompt addition
  const modePrompt = getModeSystemPrompt(mode)

  // Include plan context if executing
  let planSection = ''
  if (plan && mode === 'execute') {
    const stepsList = plan.steps.map((s, i) => {
      const status = s.status === 'done' ? '[x]' :
                     s.status === 'in_progress' ? '[>]' :
                     s.status === 'error' ? '[!]' : '[ ]'
      return `${status} ${i + 1}. ${s.description}`
    }).join('\n')
    planSection = `\nAPPROVED PLAN: ${plan.title}\n${stepsList}\n`
  }

  return {
    role: 'system',
    content: `You are a graph builder agent.
${modePrompt}
${planSection}
CANVAS: x right, y down.
${memorySection}
NODES (${nodes.length}):
${nodeList}

EDGES (${edges.length}):
${edgeList}${disconnectedList}

TOOLS:
- create_node(title, content): Create one node
- generate_sequence(count, title_pattern, content_pattern?, layout?, connect?): Generate N nodes. {n}=number. connect=true links 1->2->3...
- create_nodes_batch(nodes): Create/update up to ~50 nodes. nodes=[{title, content}]. Updates existing.
- create_edge(from_title, to_title, label?, color?): Connect two nodes with semantic label
- create_edges_batch(edges): Create multiple edges. edges=[{from_title, to_title, label?, color?}]. ALWAYS include labels!
- delete_edges(filter): Delete edges. filter="all" or node title
- update_node(title, new_content): Edit a node's content
- delete_node(title): Remove a single node
- delete_matching(filter): Delete multiple nodes. filter="all"|"even"|"odd"|"empty"|term
- auto_layout("grid"|"horizontal"|"vertical"|"circle"|"clock"|"star"|"force"): Arrange nodes. "force" uses edge-based physics.
- query_nodes(filter): Query DB. filter="all"|"empty"|"has_content"|"search term". Returns node list.
- read_graph(): Read current graph state with nodes, content, and edges
- for_each_node(action, template, filter?): UPDATE existing nodes. action="llm" generates content. template="What is {title}?" uses variables.
- batch_update(updates): Update multiple nodes. [{title, set_title?, set_content?, x?, y?}].
- smart_move(instruction): Move nodes by semantic criteria.
- smart_color(instruction): Color nodes by semantic criteria.
- color_matching(pattern, color): SEMANTIC coloring - classify by meaning (e.g., "person", "question", "organization"). NOT for text patterns.
- color_regex(regex, color, field?): REGEX coloring - match text patterns on title. Use ^x for "starts with x", x$ for "ends with x", foo for "contains foo".
- reset_edge_colors(): Reset all edge colors to default.
- smart_connect(groups): Connect nodes within groups.
- research(query, sources?): Research topic across web + local nodes. sources=["local","web","wikipedia"]
- create_plan(title, steps): Create a plan for user approval. steps=[{description, details?}]
- request_approval(plan_id?, message?): Request user approval for current plan.
- think(thought): Express your reasoning before acting.
- plan(tasks): Create a task list for multi-step operations.
- update_task(task_index, status): Update task status.
- remember(message): Store important info for this workspace's memory
- done(summary): Call when finished

EDGE LABELS (always use one):
- Hierarchy: "contains", "part of", "includes", "has"
- Relations: "connects to", "related to", "associated with"
- Causation: "causes", "leads to", "produces", "regulates"
- Types: "type of", "instance of", "example of"

AVOID creating nodes for: categories, types, generic terms, placeholders. Only create nodes for specific entities.

IMPORTANT - YOU ALREADY HAVE THE NODE LIST ABOVE. Do not call read_graph unless explicitly needed.
- smart_color, smart_move, color_matching, color_regex: Already iterate through all nodes internally - DO NOT call read_graph first.
- smart_connect: Already has access to nodes - DO NOT call read_graph first.
- These tools work on ALL nodes automatically - just call them directly with your instruction.

COLOR TOOL SELECTION:
- "color nodes starting with X" → color_regex(regex="^X", color)  // ^X = starts with
- "color nodes ending with .md" → color_regex(regex="\\.md$", color)  // $ = ends with
- "color nodes containing foo" → color_regex(regex="foo", color)
- "color people/organizations/questions" → color_matching(pattern="person", color)  // semantic meaning

"connect disconnected nodes" = Use create_edges_batch only. Do NOT create new nodes.
"for each node" = Use for_each_node directly.
"X is not Y" = Fix the edge/relationship.

${customRules}`,
  }
}

/**
 * Prune messages to manage context size
 */
export function pruneMessages(messages: ChatMessage[], keepRecent: number = 6): ChatMessage[] {
  if (messages.length <= keepRecent + 2) return messages

  const systemPrompt = messages[0]
  const userRequest = messages[1]
  const recentMessages = messages.slice(-keepRecent)

  const prunedCount = messages.length - keepRecent - 2
  const summary: ChatMessage = {
    role: 'assistant',
    content: `[Completed ${prunedCount} previous actions successfully. Continue with remaining work.]`
  }

  return [systemPrompt, userRequest, summary, ...recentMessages]
}
