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
import { llmQueue } from '../../../llm/queue'
import { errorLog } from '../../../llm/agentLog'
import {
  filterToolsForMode,
  getModeMaxIterations,
  DEFAULT_AGENT_MODE,
} from '../../../llm/agentModes'
import {
  shouldEnhancePrompt,
  enhancePrompt,
  detectIntent,
} from '../../../llm/promptEnhancer'
import { preflightCheck, estimateAgentTokens } from '../../../llm/tokenEstimator'
import { buildSystemPrompt, pruneMessages } from './systemPrompt'

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

export interface AgentContext {
  // Node store access
  filteredNodes: () => Array<{ id: string; title: string; canvas_x: number; canvas_y: number; markdown_content: string | null }>
  filteredEdges: () => Array<{ source_node_id: string; target_node_id: string; label: string | null; link_type: string | null }>
  cleanupOrphanEdges: () => void
  workspaceId: () => string

  // Selection state for selection-aware tools
  selectedNodeIds?: () => string[]

  // LLM settings (read-only refs; useLLM provides computeds)
  model: Readonly<Ref<string>>
  contextLength: Readonly<Ref<number>>
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

  // Incremented on every run/stop so a restarted agent invalidates the
  // previous loop even after isRunning flips back to true
  let runGeneration = 0

  // Leading messages (system prompt + restored history + user request) that
  // pruning must never drop; set by run() which knows the message layout
  let pinnedMessageCount = 2

  // Current plan (for execute mode)
  const currentPlan = ref<AgentPlan | null>(null)

  /**
   * Stop the running agent
   */
  function stop() {
    runGeneration++
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

    // Pre-flight token check
    const nodes = ctx.filteredNodes()
    const edges = ctx.filteredEdges()
    const contextLimit = ctx.contextLength.value || 8192

    const tokenWarning = preflightCheck(
      nodes.map(n => ({ title: n.title, markdown_content: n.markdown_content })),
      edges,
      userRequest,
      contextLimit
    )

    if (tokenWarning) {
      // Log warning but don't block - let user decide
      const estimate = estimateAgentTokens(
        nodes.map(n => ({ title: n.title, markdown_content: n.markdown_content })),
        edges,
        userRequest,
        [],
        contextLimit
      )
      ctx.log.value.push(`> Warning: ${tokenWarning}`)
      ctx.log.value.push(`> Estimated usage: ${estimate.usagePercent}% of ${contextLimit} tokens`)
    }

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
    const selectedIds = ctx.selectedNodeIds?.() || []
    const messages: ChatMessage[] = [
      buildSystemPrompt(ctx.filteredNodes(), ctx.filteredEdges(), ctx.workspaceId(), mode.value, currentPlan.value, selectedIds),
      ...recentHistory,
      { role: 'user', content: enhancedRequest },
    ]
    pinnedMessageCount = messages.length

    // Add current request to conversation history
    ctx.conversationHistory.value.push({ role: 'user', content: userRequest })

    const maxIterations = getModeMaxIterations(mode.value)
    const pruneEvery = 10

    return await runLoop(messages, 0, maxIterations, pruneEvery, ++runGeneration)
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
    return await runLoop(savedMessages, savedIteration, maxIterations, 10, ++runGeneration)
  }

  /**
   * Main agent loop
   */
  async function runLoop(
    messages: ChatMessage[],
    startIteration: number,
    maxIterations: number,
    pruneEvery: number,
    generation: number
  ): Promise<AgentRunResult> {
    for (let i = startIteration; i < maxIterations; i++) {
      // Get tools for current mode (refresh each iteration in case mode changed)
      const tools = getFilteredTools()
      // Stop when the user stopped the agent, or when a newer run superseded
      // this loop (isRunning alone is not enough: a restart sets it back to
      // true before the old loop observes the stop)
      if (!ctx.isRunning.value || generation !== runGeneration) {
        return { status: 'stopped', message: 'Agent stopped by user' }
      }

      // Prune context periodically
      if (i > 0 && i % pruneEvery === 0) {
        messages = pruneMessages(messages, 6, pinnedMessageCount)
        ctx.log.value.push(`> Pruned context (${messages.length} messages)`)
      }

      try {
        // Use the queue for all LLM calls with filtered tools
        const data = await llmQueue.chat(messages as ChatMessage[], tools)
        const msg = data.message

        messages.push(msg)

        // Some models output both text with embedded tool JSON AND native tool
        // calls (e.g. a spurious done()). When that happens, process the
        // content-based tools and skip the native calls this iteration.
        const hasEmbeddedToolsInContent = Boolean(
          msg.content &&
            msg.tool_calls?.length &&
            (/<\|channel\|>.*?to=\w+/.test(msg.content) ||
              /<\|constrain\|>json<\|message\|>\{/.test(msg.content) ||
              /```json[\s\S]*?"name"\s*:/.test(msg.content))
        )

        if (hasEmbeddedToolsInContent) {
          ctx.log.value.push('> Processing embedded tool calls from content...')
          // The assistant message carrying the skipped native tool_calls is
          // already in history; answer each so no tool call is left dangling
          for (const tc of msg.tool_calls || []) {
            messages.push({
              role: 'tool',
              content: 'Skipped: superseded by the tool call embedded in the message content.',
              tool_call_id: tc.id,
            })
          }
        }

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
              // Invalid JSON - report the failure back to the model instead of
              // executing the tool with empty arguments
              const argsPreview = typeof tc.function.arguments === 'string'
                ? tc.function.arguments.slice(0, 100)
                : JSON.stringify(tc.function.arguments).slice(0, 100)
              console.error(`Failed to parse tool arguments for ${tc.function.name}:`, e)
              ctx.log.value.push(`> Warning: Malformed args for ${tc.function.name}: ${argsPreview}...`)
              messages.push({
                role: 'tool',
                content: `Error: arguments for ${tc.function.name} were not valid JSON. Repeat the call with valid JSON arguments.`,
                tool_call_id: tc.id,
              })
              continue
            }
            const result = await ctx.executeAgentTool(tc.function.name, parsedArgs)
            messages.push({ role: 'tool', content: result, tool_call_id: tc.id })

            // Log graph state after mutations
            if (['create_node', 'create_nodes_batch', 'create_edge', 'create_edges_batch', 'delete_node', 'delete_matching'].includes(tc.function.name)) {
              const nodes = ctx.filteredNodes()
              const edges = ctx.filteredEdges()
              ctx.log.value.push(`  [Graph: ${nodes.length} nodes, ${edges.length} edges]`)
            }

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

          // Try to parse tool calls from text FIRST (fallback for models
          // without native tool calling). The done/question heuristics below
          // must not fire on messages that contain tool JSON: words like
          // "complete" inside tool arguments would otherwise end the run
          // without executing the tool.
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

          // No tool JSON found: apply the done/question heuristics. A question
          // only counts when the whole message is short - a '?' buried in a
          // longer answer is not a question to the user.
          const asksQuestion = msg.content.includes('?') && msg.content.length < 200
          const looksComplete =
            /now shows|complete|finished|created|done|successfully|empty/i.test(msg.content)
          if (asksQuestion || looksComplete) {
            ctx.isRunning.value = false
            return { status: 'done', message: msg.content.slice(0, 200) }
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
          ctx.log.value.push(errorLog(`Context too large - ${errorMsg}`))
          ctx.log.value.push('> Tip: Select fewer nodes or reduce node content')
          ctx.isRunning.value = false
          return { status: 'error', message: 'Context exceeds model limit. Select fewer nodes or reduce content.' }
        }

        console.error('Agent error:', e)
        ctx.log.value.push(errorLog(errorMsg))
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
