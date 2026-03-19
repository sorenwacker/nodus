/**
 * Agent runner composable
 * Handles the LLM agent loop for graph building
 * ALL LLM calls go through the queue
 */
import type { Ref } from 'vue'
import type { ChatMessage, AgentTask } from '../llm/types'
import { llmStorage, memoryStorage } from '../../lib/storage'
import { DEFAULT_AGENT_PROMPT } from '../llm/prompts'
import { llmQueue } from '../llm/queue'

export interface AgentContext {
  // Node store access
  filteredNodes: () => Array<{ id: string; title: string; canvas_x: number; canvas_y: number; markdown_content: string | null }>
  cleanupOrphanEdges: () => void
  workspaceId: () => string

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
 * Generate system prompt with current node state and memories
 */
function buildSystemPrompt(
  nodes: Array<{ title: string; canvas_x: number; canvas_y: number; markdown_content: string | null }>,
  workspaceId: string
): SystemPromptMessage {
  let nodeList = 'No nodes yet. Canvas is empty.'

  if (nodes.length > 0 && nodes.length <= 30) {
    nodeList = nodes.map((n, i) =>
      `${i+1}. "${n.title}" @(${Math.round(n.canvas_x)},${Math.round(n.canvas_y)})`
    ).join('\n')
  } else if (nodes.length > 30) {
    nodeList = nodes.slice(0, 20).map(n => n.title).join(', ') + `... (${nodes.length} total)`
  }

  const customRules = llmStorage.getAgentPrompt(DEFAULT_AGENT_PROMPT)

  // Load workspace memories
  const memories = memoryStorage.getMemories(workspaceId)
  const memorySection = memories.length > 0
    ? `\nMEMORY (from previous sessions):\n${memories.map(m => `- ${m}`).join('\n')}\n`
    : ''

  return {
    role: 'system',
    content: `You are a graph builder agent.

CANVAS: x right, y down.
${memorySection}
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
- for_each_node(action, template, filter?): action="set"|"append"|"llm". For "llm": template is the instruction (e.g., "clean up this text, remove references"), content is passed automatically. ALWAYS use this for bulk content processing/cleanup.
- batch_update(updates): Update multiple nodes. [{title, set_title?, set_content?, x?, y?}]. YOU generate the values.
- smart_move(instruction): Move nodes by semantic criteria. E.g., "car brands to left, animals to right".
- smart_color(instruction): Color nodes by semantic criteria. E.g., "males blue, females pink" or "urgent red".
- color_matching(pattern, color): Fast grep-style coloring. E.g., pattern="#department", color="#ef4444" (red). No LLM, instant.
- smart_connect(groups): Connect nodes within groups. E.g., "animals, car brands" connects animals together and cars together.
- web_search(query): Search web for information
- think(thought): Express your reasoning before acting. Use for complex tasks.
- plan(tasks): Create a task list for multi-step operations. tasks=["step 1", "step 2", ...]
- update_task(task_index, status): Update task status. status="done"|"in_progress"|"failed"
- remember(message): Store important info for this workspace's memory
- create_theme(name, description): Create a custom theme. E.g., "crazy-bananas", "bright tropical colors with yellow background"
- update_theme(name, changes): Modify a custom theme. E.g., "crazy-bananas", "make it darker"
- apply_theme(name): Switch to a theme. E.g., "light", "dark", "cyber", or custom theme name
- list_themes(): List available themes
- done(summary): Call when finished

WORKFLOW: For complex tasks, use think() to reason, then plan() to create steps, then execute each step and update_task() when done.

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

export function useAgentRunner(ctx: AgentContext) {
  /**
   * Stop the running agent
   */
  function stop() {
    llmQueue.cancelCurrent()
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

    ctx.isRunning.value = true
    ctx.tasks.value = []

    // Append new request to log
    if (ctx.log.value.length > 0) {
      ctx.log.value.push('---')
    }
    ctx.log.value.push(`User: ${userRequest}`)

    // Build initial messages with current node state and memories
    let messages: ChatMessage[] = [
      buildSystemPrompt(ctx.filteredNodes(), ctx.workspaceId()),
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
        // Use the queue for all LLM calls
        const data = await llmQueue.chat(messages as ChatMessage[], ctx.agentTools)
        const msg = data.message

        messages.push(msg)

        // Handle native tool calls
        if (msg.tool_calls && msg.tool_calls.length > 0) {
          for (const tc of msg.tool_calls) {
            const result = await ctx.executeAgentTool(tc.function.name, tc.function.arguments)
            messages.push({ role: 'tool', content: result, tool_call_id: tc.id })

            if (result.startsWith('AGENT_DONE:')) {
              ctx.conversationHistory.value.push({
                role: 'assistant',
                content: result.replace('AGENT_DONE:', '').trim()
              })
              ctx.isRunning.value = false
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
            return 'Done'
          }

          // Prompt to continue
          messages.push({ role: 'user', content: 'Use tools only. Call done() when finished.' })
          continue
        }
      } catch (e: any) {
        if (e.name === 'AbortError' || e.message === 'Cancelled') {
          ctx.log.value.push('> Agent stopped')
          ctx.isRunning.value = false
          return 'Agent stopped by user'
        }
        console.error('Agent error:', e)
        ctx.isRunning.value = false
        throw e
      }
    }

    ctx.isRunning.value = false
    return 'Agent reached max iterations'
  }

  return {
    run,
    stop,
  }
}
