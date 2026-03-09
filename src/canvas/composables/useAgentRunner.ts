/**
 * Agent runner composable
 * Handles the LLM agent loop for graph building
 */
import type { Ref } from 'vue'
import type { ChatMessage, AgentTask } from '../llm/types'

export interface AgentContext {
  // Node store access
  filteredNodes: () => Array<{ id: string; title: string; canvas_x: number; canvas_y: number; markdown_content: string | null }>
  cleanupOrphanEdges: () => void

  // LLM settings
  model: Ref<string>
  contextLength: Ref<number>

  // Agent state (shared with useLLM)
  isRunning: Ref<boolean>
  log: Ref<string[]>
  tasks: Ref<AgentTask[]>
  conversationHistory: Ref<ChatMessage[]>

  // Tools
  agentTools: any[]

  // Tool executor
  executeAgentTool: (name: string, args: any) => Promise<string>
}

interface SystemPromptMessage {
  role: 'system'
  content: string
}

/**
 * Generate system prompt with current node state
 */
function buildSystemPrompt(nodes: Array<{ title: string; canvas_x: number; canvas_y: number; markdown_content: string | null }>): SystemPromptMessage {
  let nodeList = 'No nodes yet. Canvas is empty.'

  if (nodes.length > 0 && nodes.length <= 30) {
    nodeList = nodes.map((n, i) =>
      `${i+1}. "${n.title}" @(${Math.round(n.canvas_x)},${Math.round(n.canvas_y)})`
    ).join('\n')
  } else if (nodes.length > 30) {
    nodeList = nodes.slice(0, 20).map(n => n.title).join(', ') + `... (${nodes.length} total)`
  }

  return {
    role: 'system',
    content: `You are a graph builder agent.

RULES:
- ONLY do what user asks. Do NOT add extra actions.
- For SEMANTIC tasks (categories like "animals", "car brands"): USE smart_move, smart_color, or smart_connect.
- After smart_move, smart_color, or smart_connect: call done() immediately. These tools are complete operations.

CANVAS: x right, y down.

NODES (${nodes.length}):
${nodeList}

TOOLS:
- create_node(title, content): Create one node
- generate_sequence(count, title_pattern, content_pattern?, layout?, connect?): Generate N nodes. {n}=number. connect=true links 1→2→3...
- create_nodes_batch(nodes): Create/update up to ~50 nodes. nodes=[{title, content}]. Updates existing.
- create_edge(from_title, to_title): Connect two nodes
- delete_edges(filter): Delete edges. filter="all" or node title
- update_node(title, new_content): Edit a node's content
- delete_node(title): Remove a single node
- delete_matching(filter): Delete multiple nodes. filter="all"|"even"|"odd"|"empty"|term
- auto_layout("grid"|"horizontal"|"vertical"|"circle"|"clock"|"star"): Arrange all nodes
- query_nodes(filter): Query DB. filter="all"|"empty"|"has_content"|"search term". Returns node list.
- for_each_node(action, template, filter?): action="set"|"append"|"search"|"llm". {title}, {n}. llm=ask LLM to generate content per node.
- batch_update(updates): Update multiple nodes. [{title, set_title?, set_content?, x?, y?}]. YOU generate the values.
- smart_move(instruction): Move nodes by semantic criteria. E.g., "car brands to left, animals to right".
- smart_color(instruction): Color nodes by semantic criteria. E.g., "males blue, females pink" or "urgent red".
- smart_connect(groups): Connect nodes within groups. E.g., "animals, car brands" connects animals together and cars together.
- web_search(query): Search web for information
- done(summary): Call when finished

CONTENT RULES:
- Title = label, Content = substance
- No meta-commentary ("This node contains...", "Here is...")
- Be concise: data, definitions, or markdown only

RULES:
- Use create_nodes_batch for 3+ nodes
- Do EXACTLY what user asks - no more, no less
- Do NOT add extra operations (don't move nodes unless asked, don't connect unless asked)
- ALWAYS call done() when finished
- Never output plain text - only use tools`,
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

export function useAgentRunner(ctx: AgentContext) {
  let abortController: AbortController | null = null

  /**
   * Stop the running agent
   */
  function stop() {
    if (abortController) {
      abortController.abort()
      abortController = null
    }
    ctx.isRunning.value = false
    ctx.log.value.push('> Stopped by user')
  }

  /**
   * Run the agent with a user request
   */
  async function run(userRequest: string): Promise<string> {
    // Singleton - stop any existing agent
    if (ctx.isRunning.value) {
      stop()
    }

    // Auto-cleanup orphan edges
    ctx.cleanupOrphanEdges()

    abortController = new AbortController()
    ctx.isRunning.value = true
    ctx.tasks.value = []

    // Append new request to log
    if (ctx.log.value.length > 0) {
      ctx.log.value.push('---')
    }
    ctx.log.value.push(`User: ${userRequest}`)

    // Build initial messages with current node state
    let messages: ChatMessage[] = [
      buildSystemPrompt(ctx.filteredNodes()),
      { role: 'user', content: userRequest },
    ]

    const maxIterations = 200
    const pruneEvery = 10

    for (let i = 0; i < maxIterations; i++) {
      // Prune context periodically
      if (i > 0 && i % pruneEvery === 0) {
        messages = pruneMessages(messages)
        ctx.log.value.push(`> Pruned context (${messages.length} messages)`)
      }

      try {
        const response = await fetch('http://localhost:11434/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: ctx.model.value,
            messages,
            tools: ctx.agentTools,
            stream: false,
            options: { num_ctx: ctx.contextLength.value },
          }),
          signal: abortController?.signal,
        })

        if (!response.ok) throw new Error(`Ollama error: ${response.status}`)
        const data = await response.json()
        const msg = data.message

        messages.push(msg)

        // Handle native tool calls
        if (msg.tool_calls && msg.tool_calls.length > 0) {
          for (const tc of msg.tool_calls) {
            const result = await ctx.executeAgentTool(tc.function.name, tc.function.arguments)
            messages.push({ role: 'tool', content: result })

            if (result.startsWith('AGENT_DONE:')) {
              ctx.conversationHistory.value.push({
                role: 'assistant',
                content: result.replace('AGENT_DONE:', '').trim()
              })
              ctx.isRunning.value = false
              abortController = null
              return result.replace('AGENT_DONE:', '').trim()
            }
          }
        } else if (msg.content) {
          ctx.log.value.push(`LLM: ${msg.content.slice(0, 80)}...`)

          // If LLM asks a question or says it's done, stop
          if (msg.content.includes('?') || /done|complete|finished|empty/i.test(msg.content)) {
            ctx.isRunning.value = false
            return msg.content.slice(0, 200)
          }

          // Try to parse tool calls from text (fallback for models without native tool calling)
          let toolJson: string | null = null

          const jsonMatch = msg.content.match(/```json\s*([\s\S]*?)\s*```/)
          if (jsonMatch) toolJson = jsonMatch[1]

          const pythonTagMatch = msg.content.match(/<\|python_tag\|>\s*(\{[\s\S]*\})/)
          if (!toolJson && pythonTagMatch) toolJson = pythonTagMatch[1]

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
                  return result.replace('AGENT_DONE:', '').trim()
                }
                continue
              }
            } catch { /* Not valid tool JSON */ }
          }

          // Check if LLM thinks it's done
          const looksComplete = /now shows|complete|finished|created|done|successfully/i.test(msg.content)
          if (looksComplete) {
            ctx.isRunning.value = false
            abortController = null
            return 'Done'
          }

          // Prompt to continue
          messages.push({ role: 'user', content: 'Use tools only. Call done() when finished.' })
          continue
        }
      } catch (e: any) {
        if (e.name === 'AbortError') {
          ctx.log.value.push('> Agent stopped')
          ctx.isRunning.value = false
          abortController = null
          return 'Agent stopped by user'
        }
        console.error('Agent error:', e)
        ctx.isRunning.value = false
        throw e
      }
    }

    ctx.isRunning.value = false
    abortController = null
    return 'Agent reached max iterations'
  }

  return {
    run,
    stop,
  }
}
