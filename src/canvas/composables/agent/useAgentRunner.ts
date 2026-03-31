/**
 * Agent runner composable
 * Handles the LLM agent loop for graph building
 * ALL LLM calls go through the queue
 *
 * Supports three modes:
 * - Explore: Read-only research
 * - Plan: Design approach for user approval
 * - Execute: Make changes after approval
 */
import { ref, type Ref } from 'vue'
import type { ChatMessage, AgentTask, ToolDefinition, AgentMode, AgentPlan } from '../../../llm/types'
import { llmStorage, memoryStorage } from '../../../lib/storage'
import { DEFAULT_AGENT_PROMPT } from '../../../llm/prompts'
import { llmQueue } from '../../../llm/queue'
import {
  filterToolsForMode,
  getModeSystemPrompt,
  getModeMaxIterations,
  DEFAULT_AGENT_MODE,
} from '../../../llm/agentModes'
import {
  shouldEnhancePrompt,
  enhancePrompt,
  detectIntent,
} from '../../../llm/promptEnhancer'

/**
 * Extract a balanced JSON object from a string starting with {
 * Handles nested braces correctly
 */
function extractBalancedJson(str: string): string | null {
  if (!str.startsWith('{')) return null
  let depth = 0
  let inString = false
  let escape = false

  for (let i = 0; i < str.length; i++) {
    const char = str[i]

    if (escape) {
      escape = false
      continue
    }

    if (char === '\\' && inString) {
      escape = true
      continue
    }

    if (char === '"') {
      inString = !inString
      continue
    }

    if (!inString) {
      if (char === '{') depth++
      else if (char === '}') {
        depth--
        if (depth === 0) {
          return str.slice(0, i + 1)
        }
      }
    }
  }

  return null // Unbalanced
}

import { escapeForPrompt } from '../../../lib/promptSecurity'

/** Truncate text to max length, adding ellipsis if truncated */
function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  return text.slice(0, maxLength - 3) + '...'
}

/** Max characters for node titles in system prompt */
const MAX_TITLE_LENGTH = 100

export interface AgentContext {
  // Node store access
  filteredNodes: () => Array<{ id: string; title: string; canvas_x: number; canvas_y: number; markdown_content: string | null }>
  filteredEdges: () => Array<{ source_node_id: string; target_node_id: string; label: string | null; link_type: string | null }>
  cleanupOrphanEdges: () => void
  workspaceId: () => string

  // LLM settings
  model: Ref<string>
  contextLength: Ref<number>
  getProviderId?: () => string

  // Agent state (shared with useLLM)
  isRunning: Ref<boolean>
  log: Ref<string[]>
  tasks: Ref<AgentTask[]>
  conversationHistory: Ref<ChatMessage[]>

  // Tools
  agentTools: ToolDefinition[]

  // Tool executor
  executeAgentTool: (name: string, args: Record<string, unknown>) => Promise<string>
}

interface SystemPromptMessage {
  role: 'system'
  content: string
}

/**
 * Generate system prompt with current node state and memories
 * Uses XML-like structured separators to prevent prompt injection
 */
function buildSystemPrompt(
  nodes: Array<{ id: string; title: string; canvas_x: number; canvas_y: number; markdown_content: string | null }>,
  edges: Array<{ source_node_id: string; target_node_id: string; label: string | null; link_type: string | null }>,
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
- color_matching(pattern, color): Fast grep-style node coloring.
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

IMPORTANT - YOU ALREADY HAVE THE NODE LIST ABOVE. Do not call read_graph.

"connect disconnected nodes" = Use create_edges_batch only. Do NOT create new nodes.
"for each node" = Use for_each_node directly.
"X is not Y" = Fix the edge/relationship.

${customRules}`,
  }
}

/**
 * Prune messages to manage context size
 */
function pruneMessages(messages: ChatMessage[], keepRecent: number = 6): ChatMessage[] {
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

/**
 * Agent runner result with pause capability
 */
export interface AgentRunResult {
  status: 'done' | 'paused' | 'error' | 'stopped' | 'max_iterations'
  message: string
  pauseReason?: 'approval_requested' | 'user_input_needed'
  planData?: { title: string; steps: Array<{ description: string; details?: string }> }
}

export function useAgentRunner(ctx: AgentContext) {
  // Current mode
  const mode = ref<AgentMode>(DEFAULT_AGENT_MODE)

  // Paused state
  const isPaused = ref(false)
  const pauseReason = ref<string | null>(null)

  // Saved state for resume
  let savedMessages: ChatMessage[] = []
  let savedIteration = 0

  // Current plan (for execute mode)
  const currentPlan = ref<AgentPlan | null>(null)

  /**
   * Stop the running agent
   */
  function stop() {
    llmQueue.cancelCurrent()
    ctx.isRunning.value = false
    isPaused.value = false
    pauseReason.value = null
    ctx.log.value.push('> Stopped by user')
  }

  /**
   * Set agent mode
   */
  function setMode(newMode: AgentMode) {
    mode.value = newMode
    ctx.log.value.push(`> Mode: ${newMode}`)
  }

  /**
   * Set plan for execution
   */
  function setPlan(plan: AgentPlan) {
    currentPlan.value = plan
  }

  /**
   * Get tools filtered for current mode
   */
  function getFilteredTools(): ToolDefinition[] {
    return filterToolsForMode(ctx.agentTools, mode.value) as ToolDefinition[]
  }

  /**
   * Run the agent with a user request
   */
  async function run(userRequest: string, startMode?: AgentMode): Promise<AgentRunResult> {
    // Singleton - stop any existing agent
    if (ctx.isRunning.value) {
      stop()
    }

    // Reset to default mode for new requests (not resumes)
    // This ensures each new request starts fresh in plan mode
    mode.value = startMode || DEFAULT_AGENT_MODE
    currentPlan.value = null

    // Auto-cleanup orphan edges
    ctx.cleanupOrphanEdges()

    ctx.isRunning.value = true
    isPaused.value = false
    pauseReason.value = null
    ctx.tasks.value = []

    // Append new request to log
    if (ctx.log.value.length > 0) {
      ctx.log.value.push('---')
    }
    ctx.log.value.push(`> User: ${userRequest}`)
    const providerId = ctx.getProviderId?.() || 'unknown'
    ctx.log.value.push(`> Provider: ${providerId} (${ctx.model.value})`)
    ctx.log.value.push(`> Mode: ${mode.value}`)

    // Enhance prompt if it's a graph creation request
    let enhancedRequest = userRequest
    if (shouldEnhancePrompt(userRequest)) {
      const intent = detectIntent(userRequest)
      ctx.log.value.push(`> Detected: ${intent.graphType} (${intent.domain})`)
      enhancedRequest = enhancePrompt(userRequest)
      // Log enhanced prompt in agent log
      ctx.log.value.push(`--- ENHANCED PROMPT ---`)
      for (const line of enhancedRequest.split('\n').slice(0, 20)) {
        ctx.log.value.push(line)
      }
      if (enhancedRequest.split('\n').length > 20) {
        ctx.log.value.push('... (truncated)')
      }
      ctx.log.value.push(`-----------------------`)
    }

    // Build initial messages with current node state, memories, and mode
    // Include recent conversation history for context continuity
    const recentHistory = ctx.conversationHistory.value.slice(-6) // Last 3 exchanges
    const messages: ChatMessage[] = [
      buildSystemPrompt(ctx.filteredNodes(), ctx.filteredEdges(), ctx.workspaceId(), mode.value, currentPlan.value),
      ...recentHistory,
      { role: 'user', content: enhancedRequest },
    ]

    // Add current request to conversation history
    ctx.conversationHistory.value.push({ role: 'user', content: userRequest })

    const maxIterations = getModeMaxIterations(mode.value)
    const pruneEvery = 10

    return await runLoop(messages, 0, maxIterations, pruneEvery)
  }

  /**
   * Resume after pause (e.g., after approval)
   */
  async function resume(approvalResult?: { approved: boolean; message?: string }): Promise<AgentRunResult> {
    if (!isPaused.value || savedMessages.length === 0) {
      return { status: 'error', message: 'No paused agent to resume' }
    }

    ctx.isRunning.value = true
    isPaused.value = false

    // Add approval result to messages
    if (approvalResult) {
      if (approvalResult.approved) {
        savedMessages.push({
          role: 'user',
          content: `Plan APPROVED. ${approvalResult.message || 'Proceed with execution.'}`,
        })
        // Switch to execute mode
        mode.value = 'execute'
        ctx.log.value.push('> Plan approved - switching to execute mode')
      } else {
        savedMessages.push({
          role: 'user',
          content: `Plan REJECTED. ${approvalResult.message || 'Please revise the plan.'}`,
        })
        ctx.log.value.push('> Plan rejected - revising')
      }
    }

    const maxIterations = getModeMaxIterations(mode.value)
    return await runLoop(savedMessages, savedIteration, maxIterations, 10)
  }

  /**
   * Main agent loop
   */
  async function runLoop(
    messages: ChatMessage[],
    startIteration: number,
    maxIterations: number,
    pruneEvery: number
  ): Promise<AgentRunResult> {
    for (let i = startIteration; i < maxIterations; i++) {
      // Get tools for current mode (refresh each iteration in case mode changed)
      const tools = getFilteredTools()
      // Check if we should stop
      if (!ctx.isRunning.value) {
        return { status: 'stopped', message: 'Agent stopped by user' }
      }

      // Prune context periodically
      if (i > 0 && i % pruneEvery === 0) {
        messages = pruneMessages(messages)
        ctx.log.value.push(`> Pruned context (${messages.length} messages)`)
      }

      try {
        // Use the queue for all LLM calls with filtered tools
        const data = await llmQueue.chat(messages as ChatMessage[], tools)
        const msg = data.message

        messages.push(msg)

        // Check if content has embedded tool calls that should be processed BEFORE native tool calls
        // Some models output both text with tool JSON AND a native done() call
        if (msg.content && msg.tool_calls?.length) {
          const hasEmbeddedTools = /<\|channel\|>.*?to=\w+/.test(msg.content) ||
                                   /<\|constrain\|>json<\|message\|>\{/.test(msg.content) ||
                                   /```json[\s\S]*?"name"\s*:/.test(msg.content)

          if (hasEmbeddedTools) {
            // Process content-based tools first, skip native calls this iteration
            ctx.log.value.push('> Processing embedded tool calls from content...')
            // Fall through to content processing below
          }
        }

        // Handle native tool calls (skip if we detected embedded tools above)
        const hasEmbeddedToolsInContent = msg.content && (
          /<\|channel\|>.*?to=\w+/.test(msg.content) ||
          /<\|constrain\|>json<\|message\|>\{/.test(msg.content)
        )

        if (msg.tool_calls && msg.tool_calls.length > 0 && !hasEmbeddedToolsInContent) {
          // Get allowed tools for current mode
          const allowedToolNames = new Set(tools.map(t => t.function.name))

          for (const tc of msg.tool_calls) {
            // Log tool call in agent log
            const argsPreview = typeof tc.function.arguments === 'string'
              ? tc.function.arguments.slice(0, 150)
              : JSON.stringify(tc.function.arguments).slice(0, 150)
            ctx.log.value.push(`> ${tc.function.name}(${argsPreview}${argsPreview.length >= 150 ? '...' : ''})`)

            // Validate tool is allowed in current mode
            if (!allowedToolNames.has(tc.function.name)) {
              ctx.log.value.push(`> Rejected: ${tc.function.name} (not allowed in ${mode.value} mode)`)
              messages.push({
                role: 'tool',
                content: `Error: Tool "${tc.function.name}" is not available in ${mode.value} mode. Use only the tools provided.`,
                tool_call_id: tc.id
              })
              continue
            }

            // Parse arguments from string to object
            let parsedArgs: Record<string, unknown> = {}
            try {
              parsedArgs = typeof tc.function.arguments === 'string'
                ? JSON.parse(tc.function.arguments)
                : (tc.function.arguments || {})
            } catch (e) {
              // Invalid JSON - log the error and malformed args for debugging
              const argsPreview = typeof tc.function.arguments === 'string'
                ? tc.function.arguments.slice(0, 100)
                : JSON.stringify(tc.function.arguments).slice(0, 100)
              console.error(`Failed to parse tool arguments for ${tc.function.name}:`, e)
              ctx.log.value.push(`> Warning: Malformed args for ${tc.function.name}: ${argsPreview}...`)
            }
            const result = await ctx.executeAgentTool(tc.function.name, parsedArgs)
            messages.push({ role: 'tool', content: result, tool_call_id: tc.id })

            // Check for special markers
            if (result.startsWith('AGENT_DONE:')) {
              ctx.conversationHistory.value.push({
                role: 'assistant',
                content: result.replace('AGENT_DONE:', '').trim()
              })
              ctx.isRunning.value = false
              return { status: 'done', message: result.replace('AGENT_DONE:', '').trim() }
            }

            if (result.startsWith('__CREATE_PLAN__:')) {
              // Plan was created, continue loop
              ctx.log.value.push('> Plan created')
            }

            if (result.startsWith('__REQUEST_APPROVAL__:')) {
              // Pause for user approval
              ctx.log.value.push('> Waiting for approval...')
              isPaused.value = true
              pauseReason.value = 'approval_requested'
              savedMessages = messages
              savedIteration = i + 1
              ctx.isRunning.value = false

              // Extract plan data if present
              let planData: { title: string; steps: Array<{ description: string; details?: string }> } | undefined
              try {
                const jsonStr = result.replace('__REQUEST_APPROVAL__:', '')
                const data = JSON.parse(jsonStr)
                if (data.planData) {
                  planData = data.planData
                }
              } catch {
                // No plan data in result
              }

              return {
                status: 'paused',
                message: 'Waiting for user approval',
                pauseReason: 'approval_requested',
                planData,
              }
            }

            if (result.startsWith('AGENT_PAUSED:')) {
              // Generic pause
              isPaused.value = true
              pauseReason.value = result.replace('AGENT_PAUSED:', '').trim()
              savedMessages = messages
              savedIteration = i + 1
              ctx.isRunning.value = false
              return { status: 'paused', message: pauseReason.value }
            }
          }
        } else if (msg.content) {
          ctx.log.value.push(`LLM: ${msg.content.slice(0, 80)}...`)

          // If LLM asks a question or says it's done, stop
          if (msg.content.includes('?') || /done|complete|finished|empty/i.test(msg.content)) {
            ctx.isRunning.value = false
            return { status: 'done', message: msg.content.slice(0, 200) }
          }

          // Try to parse tool calls from text (fallback for models without native tool calling)
          let toolJson: string | null = null

          const jsonMatch = msg.content.match(/```json\s*([\s\S]*?)\s*```/)
          if (jsonMatch) toolJson = jsonMatch[1]

          const pythonTagMatch = msg.content.match(/<\|python_tag\|>\s*(\{[\s\S]*\})/)
          if (!toolJson && pythonTagMatch) toolJson = pythonTagMatch[1]

          // Handle Ollama/Qwen channel format: <|channel|>commentary to=XXX<|message|>{...}
          // or: <|channel|>...to=XXX<|constrain|>json<|message|>{...}
          const channelMatch = msg.content.match(/<\|channel\|>.*?to=(\w+).*?<\|message\|>(\{[\s\S]*)/)
          if (!toolJson && channelMatch) {
            const funcName = channelMatch[1]
            // Extract JSON by finding balanced braces
            const jsonStr = channelMatch[2]
            const extracted = extractBalancedJson(jsonStr)
            if (extracted) {
              try {
                toolJson = JSON.stringify({ name: funcName, arguments: JSON.parse(extracted) })
              } catch {
                ctx.log.value.push(`> Failed to parse channel JSON`)
              }
            }
          }

          const rawJsonMatch = msg.content.match(/^\s*(\{"name"\s*:[\s\S]*\})/)
          if (!toolJson && rawJsonMatch) toolJson = rawJsonMatch[1]

          if (toolJson) {
            try {
              const parsed = JSON.parse(toolJson)
              const toolName = parsed.name
              const toolArgs = parsed.arguments || parsed.parameters || {}

              if (toolName) {
                const result = await ctx.executeAgentTool(toolName, toolArgs)
                messages.push({ role: 'assistant', content: `Executed: ${toolName}` })
                messages.push({ role: 'user', content: `Tool result: ${result}\n\nContinue with the next action or call done if finished.` })

                if (result.startsWith('AGENT_DONE:')) {
                  ctx.conversationHistory.value.push({
                    role: 'assistant',
                    content: result.replace('AGENT_DONE:', '').trim()
                  })
                  ctx.isRunning.value = false
                  return { status: 'done', message: result.replace('AGENT_DONE:', '').trim() }
                }
                continue
              }
            } catch { /* Not valid tool JSON */ }
          }

          // Check if LLM thinks it's done
          const looksComplete = /now shows|complete|finished|created|done|successfully/i.test(msg.content)
          if (looksComplete) {
            ctx.isRunning.value = false
            return { status: 'done', message: 'Done' }
          }

          // Prompt to continue
          messages.push({ role: 'user', content: 'Use tools only. Call done() when finished.' })
          continue
        }
      } catch (e: unknown) {
        const error = e as { name?: string; message?: string }
        const errorMsg = error.message || String(e)

        if (error.name === 'AbortError' || errorMsg === 'Cancelled') {
          ctx.log.value.push('> Agent stopped')
          ctx.isRunning.value = false
          return { status: 'stopped', message: 'Agent stopped by user' }
        }

        // Detect token/context limit errors
        const isTokenLimitError = errorMsg.includes('maximum model length') ||
          errorMsg.includes('context length') ||
          errorMsg.includes('too long') ||
          errorMsg.includes('token limit') ||
          errorMsg.includes('decoder prompt')

        if (isTokenLimitError) {
          ctx.log.value.push(`> ERROR: Context too large - ${errorMsg}`)
          ctx.log.value.push('> Tip: Select fewer nodes or reduce node content')
          ctx.isRunning.value = false
          return { status: 'error', message: 'Context exceeds model limit. Select fewer nodes or reduce content.' }
        }

        console.error('Agent error:', e)
        ctx.log.value.push(`> ERROR: ${errorMsg}`)
        ctx.isRunning.value = false
        return { status: 'error', message: errorMsg }
      }
    }

    ctx.isRunning.value = false
    return { status: 'max_iterations', message: 'Agent reached max iterations' }
  }

  return {
    // State
    mode,
    isPaused,
    pauseReason,
    currentPlan,

    // Actions
    run,
    resume,
    stop,
    setMode,
    setPlan,
    getFilteredTools,
  }
}
