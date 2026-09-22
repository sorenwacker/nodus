/**
 * Node Agent composable
 * Agent runner focused on a single node with web search and editing tools.
 *
 * Every tool call goes to the registry with a context composed for this run:
 * the note under edit as the `nodeDraft` service, plus `search` and `llm`.
 * The tools offered are those declaring the `node` mode
 * (PRODUCT_DESIGN.md > One implementation per tool, A tool declares its modes).
 */
import { ref, type Ref } from 'vue'
import type { ChatMessage } from '../../../llm/types'
import { llmQueue } from '../../../llm/queue'
import { errorLog } from '../../../llm/agentLog'
import { notifications$ } from '../../../composables/useNotifications'
import { llmStorage } from '../../../lib/storage'
import { toolRegistry, type NodeDraftService, type ToolContext } from '../../../llm/registry'
import { registerCoreTools } from '../../../llm/tools'
import { createSearchService } from '../../../llm/searchService'
import { escapeForPrompt } from '../../../lib/promptSecurity'

// Ensure tools are registered
registerCoreTools()

export interface NodeAgentContext {
  nodeId: string
  nodeTitle: string
  nodeContent: string
  connectedNodes: Array<{ title: string; content: string }>

  // Callbacks
  updateContent: (content: string) => Promise<void>
  updateTitle: (title: string) => Promise<void>
}

/** A note store the node-mode tools can read; they write through the draft */
const NO_GRAPH: ToolContext['store'] = {
  filteredNodes: [],
  filteredEdges: [],
  createNode: async () => {
    throw new Error('The node agent edits one note and creates no nodes')
  },
  createEdge: async () => {
    throw new Error('The node agent edits one note and creates no edges')
  },
  deleteNode: async () => {},
  deleteEdge: async () => {},
  updateNodePosition: async () => {},
  updateNodeContent: async () => {},
  updateNodeTitle: async () => {},
}

/** What a run returns once a newer run has superseded it. */
const SUPERSEDED = 'Superseded by a newer run'

export function useNodeAgent() {
  const isRunning = ref(false)
  const log: Ref<string[]> = ref([])
  const currentContent = ref('')

  function buildSystemPrompt(ctx: NodeAgentContext): string {
    // Truncate main content to fit within context limits
    // Reserve ~4000 chars for system prompt overhead, tools, and response
    const maxContentChars = llmStorage.getChainContextLimit() - 4000
    let nodeContent = ctx.nodeContent || '(empty)'
    let contentTruncated = false

    if (nodeContent.length > maxContentChars && maxContentChars > 500) {
      nodeContent = nodeContent.slice(0, maxContentChars) + '\n\n[... content truncated due to size ...]'
      contentTruncated = true
    }

    let connectedContext = ''
    if (ctx.connectedNodes.length > 0 && !contentTruncated) {
      // Only include connected nodes if main content wasn't truncated
      const maxChars = Math.max(0, maxContentChars - nodeContent.length)
      const notes: string[] = []
      let totalChars = 0

      for (const n of ctx.connectedNodes) {
        const noteText = `<note title="${escapeForPrompt(n.title)}">${escapeForPrompt(n.content)}</note>`
        if (totalChars + noteText.length > maxChars) {
          // Try truncated version
          const remaining = maxChars - totalChars - 100
          if (remaining > 200) {
            notes.push(`<note title="${escapeForPrompt(n.title)}">${escapeForPrompt(n.content.slice(0, remaining))}...</note>`)
          }
          break
        }
        notes.push(noteText)
        totalChars += noteText.length
      }

      if (notes.length > 0) {
        connectedContext = `\n\n<connected_notes count="${notes.length}" total="${ctx.connectedNodes.length}">\n` +
          notes.join('\n') +
          '\n</connected_notes>'
      }
    }

    return `You are a note editor agent working on <current_note_title>${escapeForPrompt(ctx.nodeTitle)}</current_note_title>.

CURRENT CONTENT:
${nodeContent}
${connectedContext}

TOOLS:
- web_search(query): Search the web for current information (OPTIONAL)
- fetch_url(url): Read full web page content (OPTIONAL)
- wikipedia_search(query): Search Wikipedia for matching articles (OPTIONAL)
- fetch_wikipedia(title): Read a Wikipedia article found by wikipedia_search (OPTIONAL)
- update_content(content): Replace note content - THIS SAVES YOUR WORK
- append_content(text): Add text to end of note
- update_title(title): Change note title
- format_math(): Reformat the note's math to Typst syntax (uses the model)
- node_done(summary): Signal completion

MATH FORMAT:
- Notes render math with Typst, NOT LaTeX. Write math in Typst syntax inside
  $...$ (inline) or $$...$$ (display). Examples: $a/b$, $sqrt(x)$, $x_(i+1)$,
  $sum_(i=0)^n i$, $alpha$, $mat(1, 2; 3, 4)$.
- If you write LaTeX (\\frac, \\alpha, \\sqrt, ...), call format_math() afterward
  to convert it to Typst.

CRITICAL RULES:
1. You can answer from your own knowledge OR use search tools - searching is OPTIONAL
2. You MUST call update_content(content) to save your answer to the note
3. The node_done() tool does NOT save anything - it only signals you're finished
4. Always call update_content() BEFORE node_done()

Example workflow:
- User asks "What is pi?"
- You write: update_content("# Pi\\n\\nPi is the ratio of a circle's circumference...")
- Then: node_done("Added explanation of pi")

DO NOT call node_done() without first calling update_content(). Your response will be lost.`
  }

  let runGeneration = 0

  async function run(prompt: string, ctx: NodeAgentContext): Promise<string> {
    // A restart supersedes the previous loop, which is still awaiting its
    // request. When that request rejects, the old loop must not write the new
    // run's state: it used to clear the new run's isRunning flag, push into the
    // log the new run had just reset, and let an in-flight tool call overwrite
    // the new content. useAgentRunner solves this with the same token
    // (PRODUCT_DESIGN.md > Superseding an agent run)
    if (isRunning.value) {
      llmQueue.cancelCurrent()
    }
    const generation = ++runGeneration
    const isCurrent = () => generation === runGeneration
    // Whether the model has already been asked to act rather than describe
    let hasBeenNudged = false

    isRunning.value = true
    const providerId = llmStorage.getProvider()
    const providerConfig = llmStorage.getProviderConfig(providerId)
    const modelName = String(providerConfig.model || 'unknown')
    log.value = [
      `> User: ${prompt}`,
      `> Provider: ${providerId} (${modelName})`,
    ]

    // Warn if content will be truncated
    const maxContentChars = llmStorage.getChainContextLimit() - 4000
    if (ctx.nodeContent && ctx.nodeContent.length > maxContentChars) {
      if (isCurrent()) log.value.push(`> Warning: Content truncated (${ctx.nodeContent.length} chars > ${maxContentChars} limit)`)
    }

    currentContent.value = ctx.nodeContent
    // Content and title live on the draft, which the node-edit tools write
    // through; `saved` is what node_done checks
    const draft: NodeDraftService = {
      content: ctx.nodeContent,
      title: ctx.nodeTitle,
      saved: false,
      updateContent: async content => {
        if (!isCurrent()) throw new Error(SUPERSEDED)
        draft.content = content
        currentContent.value = content
        await ctx.updateContent(content)
        draft.saved = true
      },
      updateTitle: async title => {
        if (!isCurrent()) throw new Error(SUPERSEDED)
        draft.title = title
        await ctx.updateTitle(title)
      },
    }
    const toolCtx: ToolContext = {
      store: NO_GRAPH,
      log: msg => {
        if (isCurrent()) log.value.push(msg)
      },
      screenToCanvas: (x, y) => ({ x, y }),
      snapToGrid: v => v,
      model: modelName,
      contextLength: llmStorage.getChainContextLimit(),
      llm: {
        generate: (p, sys, priority) => llmQueue.generate(p, sys, priority),
        isCancelled: () => !isCurrent(),
      },
      search: createSearchService(),
      nodeDraft: draft,
    }

    const messages: ChatMessage[] = [
      { role: 'system', content: buildSystemPrompt(ctx) },
      { role: 'user', content: prompt },
    ]

    const nodeTools = toolRegistry.getToolsForMode('node')
    const allowed = new Set(nodeTools.map(t => t.function.name))
    const maxIterations = 20

    for (let i = 0; i < maxIterations; i++) {
      // A superseded run stops working rather than only stopping its reports:
      // it makes no further request and no further change to the note
      // (PRODUCT_DESIGN.md > Superseding an agent run)
      if (!isCurrent()) return SUPERSEDED
      try {
        const data = await llmQueue.chat(messages, nodeTools)
        if (!isCurrent()) return SUPERSEDED
        const msg = data.message
        messages.push(msg)

        if (msg.tool_calls && msg.tool_calls.length > 0) {
          for (const tc of msg.tool_calls) {
            const name = tc.function.name
            let args: Record<string, unknown>
            try {
              args = typeof tc.function.arguments === 'string'
                ? JSON.parse(tc.function.arguments)
                : tc.function.arguments
            } catch {
              args = {}
            }

            if (!allowed.has(name)) {
              messages.push({
                role: 'tool',
                content: `Error: Unknown tool "${name}". Available tools: ${[...allowed].join(', ')}`,
                tool_call_id: tc.id,
              })
              continue
            }

            const outcome = await toolRegistry.execute(name, args, toolCtx)
            if (!isCurrent()) return SUPERSEDED
            if (/^error/i.test(outcome.text)) {
              if (isCurrent()) log.value.push(errorLog(outcome.text))
              notifications$.error(`${name} failed`, outcome.text.slice(0, 200))
            }
            messages.push({ role: 'tool', content: outcome.text, tool_call_id: tc.id })

            if (outcome.signal === 'node_done') {
              if (isCurrent()) isRunning.value = false
              return outcome.text
            }
          }
        } else if (msg.content) {
          // Whether the model has finished is what `node_done` is for. Matching
          // words like "done" ended the run on a message merely mentioning
          // them, and missed completions phrased any other way; the project
          // rule says not to read natural language with patterns
          // (PRODUCT_DESIGN.md > Deciding an agent run has ended).
          //
          // Ask once, then stop: a model that replies with prose twice has
          // stopped working, whatever the prose says.
          if (hasBeenNudged) {
            if (isCurrent()) log.value.push('> Ended without calling node_done')
            if (isCurrent()) isRunning.value = false
            return msg.content
          }
          hasBeenNudged = true
          messages.push({
            role: 'user',
            content: 'Use a tool to carry out the next step. Call node_done() when finished.',
          })
        }
      } catch (e: unknown) {
        const errorMsg = e instanceof Error ? e.message : String(e)

        if (errorMsg === SUPERSEDED) return SUPERSEDED
        if (errorMsg === 'Cancelled' || errorMsg.includes('AbortError')) {
          if (isCurrent()) log.value.push('> Stopped')
          if (isCurrent()) isRunning.value = false
          return 'Stopped by user'
        }

        // Show specific error to user
        if (isCurrent()) log.value.push(errorLog(errorMsg))

        if (errorMsg.includes('400')) {
          notifications$.error('LLM does not support tools', 'This model may not support function calling. Try a different model (e.g., GPT-4, Claude, or a local model with tool support).')
        } else if (errorMsg.includes('401') || errorMsg.includes('403')) {
          notifications$.error('API authentication failed', 'Check your API key in Settings.')
        } else if (errorMsg.includes('429')) {
          notifications$.error('Rate limit exceeded', 'Too many requests. Wait a moment and try again.')
        } else if (errorMsg.includes('maximum model length') || errorMsg.includes('context length') || errorMsg.includes('too long') || errorMsg.includes('token limit')) {
          notifications$.error('Context too large', 'The prompt exceeds the model\'s context limit. Try selecting fewer nodes or reduce node content.')
        } else if (errorMsg.includes('500') || errorMsg.includes('502') || errorMsg.includes('503')) {
          notifications$.error('LLM service error', errorMsg.slice(0, 200))
        } else {
          notifications$.error('Agent error', errorMsg)
        }

        if (isCurrent()) isRunning.value = false
        return `Error: ${errorMsg}`
      }
    }

    if (isCurrent()) isRunning.value = false
    if (!draft.saved) {
      if (isCurrent()) log.value.push('> Failed: Agent did not save any content')
      notifications$.error('Agent failed', 'The AI model failed to use update_content(). Try a different model or rephrase your request.')
    } else {
      if (isCurrent()) log.value.push('> Max iterations reached')
      notifications$.warning('Agent stopped', 'Maximum iterations reached.')
    }
    return 'Max iterations reached'
  }

  function stop() {
    // Stopping supersedes whatever is running, so it advances the generation:
    // the loop it cancelled must not then write over this state
    runGeneration++
    llmQueue.cancelCurrent()
    isRunning.value = false
    log.value.push('> Stopped')
  }

  return {
    isRunning,
    log,
    run,
    stop,
  }
}
