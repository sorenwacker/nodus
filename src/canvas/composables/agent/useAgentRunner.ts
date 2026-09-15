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
import { describeToolCall } from '../../../lib/toolCallSummary'
import {
  appendUserTurn,
  appendAssistantText,
  recordAction,
  failCurrentTurn,
  type ChatTurn,
} from '../../../llm/chatTranscript'
import {
  filterToolsForMode,
  getModeMaxIterations,
  DEFAULT_AGENT_MODE,
} from '../../../llm/agentModes'
import { preflightCheck, estimateAgentTokens } from '../../../llm/tokenEstimator'
import { carriesCallMarkers, decodeCallSyntax } from '../../../llm/callSyntax'
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

/** Tools whose effect on the graph is worth a line in the log. */
const MUTATING_TOOLS = [
  'create_node',
  'create_nodes_batch',
  'create_edge',
  'create_edges_batch',
  'delete_node',
  'delete_matching',
]

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
  /** Visible chat transcript; the log stays the diagnostic surface */
  transcript: Ref<ChatTurn[]>

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

    // Build initial messages with current node state, memories, and mode
    // Include recent conversation history for context continuity
    const recentHistory = ctx.conversationHistory.value.slice(-6) // Last 3 exchanges
    const selectedIds = ctx.selectedNodeIds?.() || []
    const messages: ChatMessage[] = [
      buildSystemPrompt(ctx.filteredNodes(), ctx.filteredEdges(), ctx.workspaceId(), mode.value, currentPlan.value, selectedIds),
      ...recentHistory,
      { role: 'user', content: userRequest },
    ]
    pinnedMessageCount = messages.length

    // Add current request to conversation history (model context) and to the
    // transcript (what the user sees)
    ctx.conversationHistory.value.push({ role: 'user', content: userRequest })
    appendUserTurn(ctx.transcript.value, userRequest)

    const maxIterations = getModeMaxIterations(mode.value)
    const pruneEvery = 10

    return await runLoop(messages, 0, maxIterations, pruneEvery, ++runGeneration)
  }

  /**
   * Resume after pause (e.g., after approval)
   */
  async function resume(
    approvalResult?: { approved: boolean; message?: string },
    approvedPlan?: AgentPlan | null
  ): Promise<AgentRunResult> {
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

        // Resuming replays the messages this run saved, whose system prompt was
        // built in plan mode: it carries no plan and tells the model it has no
        // tools to change the graph. Rebuild it for the mode now in force, with
        // the plan the user approved
        // (PRODUCT_DESIGN.md > The prompt of an approved run carries its plan).
        currentPlan.value = approvedPlan ?? null
        savedMessages[0] = buildSystemPrompt(
          ctx.filteredNodes(),
          ctx.filteredEdges(),
          ctx.workspaceId(),
          mode.value,
          currentPlan.value,
          ctx.selectedNodeIds?.() || []
        )
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
   * Run one tool call, whatever shape it arrived in.
   *
   * A call recovered from the text of a reply used to be executed directly,
   * skipping the mode allow-list, the log and the transcript. Both paths come
   * through here (PRODUCT_DESIGN.md > One path for a tool call).
   */
  async function handleToolCall(
    name: string,
    args: Record<string, unknown>,
    allowed: Set<string>
  ): Promise<{ kind: 'refused'; message: string } | { kind: 'ran'; result: string }> {
    if (!allowed.has(name)) {
      ctx.log.value.push(`> Rejected: ${name} (not allowed in ${mode.value} mode)`)
      return {
        kind: 'refused',
        message: `Error: Tool "${name}" is not available in ${mode.value} mode. Use only the tools provided.`,
      }
    }

    // The log is where the user looks to see what the agent did, so every call
    // appears there with its arguments summarised
    // (PRODUCT_DESIGN.md > Agent log contents)
    ctx.log.value.push(`> ${describeToolCall(name, args)}`)

    const result = await ctx.executeAgentTool(name, args)
    recordAction(ctx.transcript.value, name)

    const outcome = String(result ?? '')
    if (/^error/i.test(outcome.trim())) {
      ctx.log.value.push(`  failed: ${outcome.trim().slice(0, 160)}`)
    }

    if (MUTATING_TOOLS.includes(name)) {
      const nodes = ctx.filteredNodes()
      const edges = ctx.filteredEdges()
      ctx.log.value.push(`  [Graph: ${nodes.length} nodes, ${edges.length} edges]`)
    }

    return { kind: 'ran', result }
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
    // Whether the model has already been asked to act rather than describe
    let hasBeenNudged = false

    for (let i = startIteration; i < maxIterations; i++) {
      // Get tools for current mode (refresh each iteration in case mode changed)
      const tools = getFilteredTools()
      const allowedToolNames = new Set(tools.map(t => t.function.name))
      // Stop when the user stopped the agent, or when a newer run superseded
      // this loop (isRunning alone is not enough: a restart sets it back to
      // true before the old loop observes the stop)
      if (!ctx.isRunning.value || generation !== runGeneration) {
        // Only the run the user stopped reports it; a superseded loop is
        // silent, because its replacement is already answering
        if (generation === runGeneration) {
          appendAssistantText(ctx.transcript.value, 'Stopped. Anything already done is on the canvas.')
        }
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
          for (const tc of msg.tool_calls) {
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
            const handled = await handleToolCall(tc.function.name, parsedArgs, allowedToolNames)
            if (handled.kind === 'refused') {
              messages.push({ role: 'tool', content: handled.message, tool_call_id: tc.id })
              continue
            }
            const result = handled.result
            messages.push({ role: 'tool', content: result, tool_call_id: tc.id })

            // Check for special markers
            if (result.startsWith('AGENT_DONE:')) {
              ctx.conversationHistory.value.push({
                role: 'assistant',
                content: result.replace('AGENT_DONE:', '').trim()
              })
              appendAssistantText(ctx.transcript.value, result.replace('AGENT_DONE:', '').trim())
              ctx.isRunning.value = false
              return { status: 'done', message: result.replace('AGENT_DONE:', '').trim() }
            }

            if (result.startsWith('__CREATE_PLAN__:')) {
              // Plan was created, continue loop
              ctx.log.value.push('> Plan created')
            }

            if (result.startsWith('__REQUEST_APPROVAL__:')) {
              // Pause for user approval. The transcript has to say so: a run
              // that stops silently is indistinguishable from a hung one
              // (PRODUCT_DESIGN.md > Chat transcript)
              ctx.log.value.push('> Waiting for approval...')
              appendAssistantText(
                ctx.transcript.value,
                'I have prepared a plan and am waiting for your approval before making the changes.'
              )
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
          // Models without native tool calling write the call into the text.
          // Recover it BEFORE anything else: the reply is not an answer to
          // show the user, and the wording of a tool's arguments must not be
          // read as a completion (PRODUCT_DESIGN.md > One path for a tool call)
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

          let embeddedCall: { name: string; args: Record<string, unknown> } | null = null

          // A model that writes calls in its own syntax rather than JSON: the
          // arguments are JSON once its string delimiters and bare keys are
          // repaired (PRODUCT_DESIGN.md > A reply that carries a tool call it
          // could not make)
          if (!toolJson) {
            const [decoded] = decodeCallSyntax(msg.content)
            if (decoded) embeddedCall = decoded
          }
          if (toolJson) {
            try {
              const parsed = JSON.parse(toolJson)
              if (parsed.name) {
                embeddedCall = {
                  name: parsed.name,
                  args: (parsed.arguments || parsed.parameters || {}) as Record<string, unknown>,
                }
              }
            } catch { /* Not valid tool JSON */ }
          }

          if (embeddedCall) {
            const handled = await handleToolCall(
              embeddedCall.name,
              embeddedCall.args,
              allowedToolNames
            )
            if (handled.kind === 'refused') {
              messages.push({ role: 'user', content: handled.message })
              continue
            }

            const result = handled.result
            messages.push({ role: 'assistant', content: `Executed: ${embeddedCall.name}` })
            messages.push({ role: 'user', content: `Tool result: ${result}\n\nContinue with the next action or call done if finished.` })

            if (result.startsWith('AGENT_DONE:')) {
              const answer = result.replace('AGENT_DONE:', '').trim()
              ctx.conversationHistory.value.push({ role: 'assistant', content: answer })
              appendAssistantText(ctx.transcript.value, answer)
              ctx.isRunning.value = false
              return { status: 'done', message: answer }
            }
            continue
          }

          // A reply carrying call markers nothing could decode is not an
          // answer. Showing it puts raw markup where the agent's words belong,
          // so say what to send instead and let the run continue; a second
          // unusable reply ends it, as an unusable prose reply already does
          // (PRODUCT_DESIGN.md > A reply that carries a tool call it could not
          // make)
          if (carriesCallMarkers(msg.content)) {
            ctx.log.value.push('> A tool call arrived in a form that could not be read')
            if (!hasBeenNudged) {
              hasBeenNudged = true
              messages.push({
                role: 'user',
                content:
                  'That tool call could not be read. Send it as the tool call itself, or as a JSON object with "name" and "arguments".',
              })
              continue
            }
            appendAssistantText(
              ctx.transcript.value,
              'The model sent a tool call I could not carry out.'
            )
            ctx.isRunning.value = false
            return { status: 'error', message: 'Unreadable tool call' }
          }

          // A reply with no tool call is an answer: the log keeps a short line
          // for diagnostics, the transcript keeps it in full, since a text-only
          // reply changes nothing on the canvas and would leave no trace
          ctx.log.value.push(`LLM: ${msg.content.slice(0, 80)}...`)
          appendAssistantText(ctx.transcript.value, msg.content)

          // Whether the model has finished is not something to infer from its
          // wording: matching words like "created" or "done" ended the run on a
          // message describing what the model was ABOUT to do, and missed
          // completions phrased any other way. The project rule says as much -
          // no regex over natural language
          // (PRODUCT_DESIGN.md > Deciding an agent run has ended).
          //
          // A question to the user ends the run, because the model is waiting
          // for an answer that this loop cannot supply.
          const asksQuestion = msg.content.includes('?') && msg.content.length < 200
          if (asksQuestion) {
            ctx.isRunning.value = false
            return { status: 'done', message: msg.content.slice(0, 200) }
          }

          // Otherwise ask it once to act or to say it is finished. A model that
          // replies with prose twice has stopped working, whatever it says.
          if (!hasBeenNudged) {
            hasBeenNudged = true
            messages.push({
              role: 'user',
              content:
                'Call a tool to carry out the next step, or call done if the work is complete.',
            })
            continue
          }

          ctx.isRunning.value = false
          return { status: 'done', message: msg.content.slice(0, 200) }
        }
      } catch (e: unknown) {
        const error = e as { name?: string; message?: string }
        const errorMsg = error.message || String(e)

        if (error.name === 'AbortError' || errorMsg === 'Cancelled') {
          ctx.log.value.push('> Agent stopped')
          appendAssistantText(ctx.transcript.value, 'Stopped. Anything already done is on the canvas.')
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
          const limitMessage = 'Context exceeds model limit. Select fewer nodes or reduce content.'
          failCurrentTurn(ctx.transcript.value, limitMessage)
          ctx.isRunning.value = false
          return { status: 'error', message: limitMessage }
        }

        console.error('Agent error:', e)
        ctx.log.value.push(errorLog(errorMsg))
        failCurrentTurn(ctx.transcript.value, errorMsg)
        ctx.isRunning.value = false
        return { status: 'error', message: errorMsg }
      }
    }

    ctx.isRunning.value = false
    appendAssistantText(
      ctx.transcript.value,
      'I reached my step limit for one request. Anything done so far is on the canvas; ask me to continue if there is more to do.'
    )
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
    getFilteredTools,
  }
}
