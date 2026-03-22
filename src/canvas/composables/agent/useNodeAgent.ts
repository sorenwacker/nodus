/**
 * Node Agent composable
 * Agent runner focused on a single node with web search and editing tools
 */
import { ref, type Ref } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import type { ChatMessage } from '../../../llm/types'
import { llmQueue } from '../../../llm/queue'
import { notifications$ } from '../../../composables/useNotifications'
import { llmStorage } from '../../../lib/storage'
import { convertLatexDocument } from '../../../lib/latex-to-typst'

/**
 * Escape special characters that could be used for prompt injection
 */
function escapeForPrompt(text: string): string {
  return text
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\[INST\]/gi, '[_INST_]')
    .replace(/\[\/INST\]/gi, '[_/INST_]')
    .replace(/```/g, "'''")}

/**
 * Validate URL scheme to prevent SSRF attacks
 * Only allows http and https schemes
 */
function isValidFetchUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    // Only allow http/https schemes
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return false
    }
    // Block localhost and private IPs
    const hostname = parsed.hostname.toLowerCase()
    if (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '0.0.0.0' ||
      hostname.startsWith('192.168.') ||
      hostname.startsWith('10.') ||
      hostname.startsWith('172.16.') ||
      hostname.startsWith('172.17.') ||
      hostname.startsWith('172.18.') ||
      hostname.startsWith('172.19.') ||
      hostname.startsWith('172.20.') ||
      hostname.startsWith('172.21.') ||
      hostname.startsWith('172.22.') ||
      hostname.startsWith('172.23.') ||
      hostname.startsWith('172.24.') ||
      hostname.startsWith('172.25.') ||
      hostname.startsWith('172.26.') ||
      hostname.startsWith('172.27.') ||
      hostname.startsWith('172.28.') ||
      hostname.startsWith('172.29.') ||
      hostname.startsWith('172.30.') ||
      hostname.startsWith('172.31.') ||
      hostname === '[::1]'
    ) {
      return false
    }
    return true
  } catch {
    return false
  }
}

interface SearchResult {
  title: string
  url: string
  content: string
}

export interface NodeAgentContext {
  nodeId: string
  nodeTitle: string
  nodeContent: string
  connectedNodes: Array<{ title: string; content: string }>

  // Callbacks
  updateContent: (content: string) => Promise<void>
  updateTitle: (title: string) => Promise<void>
}

// Node-level tools (subset focused on editing + research)
const nodeTools = [
  {
    type: 'function' as const,
    function: {
      name: 'web_search',
      description: 'Search the web for any information - news, facts, organizations, people, current events, etc.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'fetch_url',
      description: 'Fetch and read the content of a web page. Use this after web_search to read full articles.',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'The URL to fetch' },
        },
        required: ['url'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'wikipedia_search',
      description: 'Search Wikipedia for encyclopedic information and definitions',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'update_content',
      description: 'Update the note content with new text',
      parameters: {
        type: 'object',
        properties: {
          content: { type: 'string', description: 'New content for the note (markdown)' },
        },
        required: ['content'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'append_content',
      description: 'Append text to the end of the note',
      parameters: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'Text to append' },
        },
        required: ['text'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'update_title',
      description: 'Change the note title',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'New title' },
        },
        required: ['title'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'done',
      description: 'Signal that the task is complete',
      parameters: {
        type: 'object',
        properties: {
          summary: { type: 'string', description: 'Brief summary of what was done' },
        },
        required: ['summary'],
      },
    },
  },
]

async function executeWebSearch(query: string): Promise<string> {
  try {
    const apiKey = llmStorage.getSearchApiKey()
    const results = await invoke<SearchResult[]>('web_search', { query, apiKey })
    if (results.length === 0) {
      throw new Error('No results found')
    }
    return results
      .map(r => `**${r.title}**\n${r.content}\nSource: ${r.url}`)
      .join('\n\n---\n\n')
  } catch (e) {
    throw new Error(`Web search failed: ${e instanceof Error ? e.message : String(e)}`)
  }
}

async function executeFetchUrl(url: string): Promise<string> {
  try {
    let content = await invoke<string>('fetch_url', { url })
    // Apply context limit from settings, with hard cap for model safety
    const userLimit = llmStorage.getChainContextLimit()
    const maxChars = Math.min(userLimit, 30000) // Hard cap at 30k chars (~7.5k tokens)
    if (content.length > maxChars) {
      // Keep start and end for better context
      const keepStart = Math.floor(maxChars * 0.8)
      const keepEnd = Math.floor(maxChars * 0.15)
      content = content.slice(0, keepStart) +
        '\n\n[... content truncated ...]\n\n' +
        content.slice(-keepEnd)
    }
    return content
  } catch (e) {
    throw new Error(`Failed to fetch URL: ${e instanceof Error ? e.message : String(e)}`)
  }
}

// Timeout for fetch requests (10 seconds)
const FETCH_TIMEOUT_MS = 10_000

/**
 * Fetch with timeout support
 */
async function fetchWithTimeout(url: string, timeoutMs = FETCH_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, { signal: controller.signal })
    return response
  } finally {
    clearTimeout(timeoutId)
  }
}

async function executeWikipediaSearch(query: string): Promise<string> {
  // First, search for the article
  try {
    const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&origin=*&srlimit=1`
    const searchResp = await fetchWithTimeout(searchUrl)
    if (searchResp.ok) {
      const searchData = await searchResp.json()
      if (searchData.query?.search?.length > 0) {
        const title = searchData.query.search[0].title

        // Fetch the full article content using TextExtracts API
        const contentUrl = `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(title)}&prop=extracts&explaintext=1&exsectionformat=plain&format=json&origin=*`
        const contentResp = await fetchWithTimeout(contentUrl)
        if (contentResp.ok) {
          const contentData = await contentResp.json()
          const pages = contentData.query?.pages
          if (pages) {
            const pageId = Object.keys(pages)[0]
            const extract = pages[pageId]?.extract
            if (extract) {
              // Use the context limit from settings (default 50k)
              const maxChars = llmStorage.getChainContextLimit()
              const content = maxChars > 0 && extract.length > maxChars
                ? extract.slice(0, maxChars) + '...\n\n[Content truncated]'
                : extract
              return `# ${title}\n\n${content}\n\nSource: https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`
            }
          }
        }
      }
    }
  } catch (e) {
    // Check if it was a timeout
    if (e instanceof Error && e.name === 'AbortError') {
      throw new Error(`Wikipedia search timed out for "${query}". Try again.`)
    }
    // Wikipedia search failed for other reasons
  }

  throw new Error(`Wikipedia search failed for "${query}". Try a different query.`)
}

export function useNodeAgent() {
  const isRunning = ref(false)
  const log: Ref<string[]> = ref([])
  const currentContent = ref('')

  function buildSystemPrompt(ctx: NodeAgentContext): string {
    let connectedContext = ''
    if (ctx.connectedNodes.length > 0) {
      connectedContext = '\n\n<connected_notes>\n' +
        ctx.connectedNodes.slice(0, 5).map(n =>
          `<note title="${escapeForPrompt(n.title)}">${escapeForPrompt(n.content.slice(0, 200))}...</note>`
        ).join('\n') +
        '\n</connected_notes>'
    }

    return `You are a note editor agent working on <current_note_title>${escapeForPrompt(ctx.nodeTitle)}</current_note_title>.

CURRENT CONTENT:
${ctx.nodeContent || '(empty)'}
${connectedContext}

TOOLS:
- web_search(query): Search the web for current information (OPTIONAL)
- fetch_url(url): Read full web page content (OPTIONAL)
- wikipedia_search(query): Search Wikipedia (OPTIONAL)
- update_content(content): Replace note content - THIS SAVES YOUR WORK
- append_content(text): Add text to end of note
- update_title(title): Change note title
- done(summary): Signal completion

CRITICAL RULES:
1. You can answer from your own knowledge OR use search tools - searching is OPTIONAL
2. You MUST call update_content(content) to save your answer to the note
3. The done() tool does NOT save anything - it only signals you're finished
4. Always call update_content() BEFORE done()

Example workflow:
- User asks "What is pi?"
- You write: update_content("# Pi\\n\\nPi is the ratio of a circle's circumference...")
- Then: done("Added explanation of pi")

DO NOT call done() without first calling update_content(). Your response will be lost.`
  }

  async function run(prompt: string, ctx: NodeAgentContext): Promise<string> {
    if (isRunning.value) {
      llmQueue.cancelCurrent()
    }

    isRunning.value = true
    log.value = [`> ${prompt}`]
    currentContent.value = ctx.nodeContent
    let contentWasUpdated = false // Track if update_content was called

    const messages: ChatMessage[] = [
      { role: 'system', content: buildSystemPrompt(ctx) },
      { role: 'user', content: prompt },
    ]

    const maxIterations = 20

    for (let i = 0; i < maxIterations; i++) {
      try {
        const data = await llmQueue.chat(messages, nodeTools)
        const msg = data.message
        messages.push(msg)

        if (msg.tool_calls && msg.tool_calls.length > 0) {
          for (const tc of msg.tool_calls) {
            const name = tc.function.name
            const toolCallId = tc.id
            let args: Record<string, unknown>
            try {
              args = typeof tc.function.arguments === 'string'
                ? JSON.parse(tc.function.arguments)
                : tc.function.arguments
            } catch {
              args = {}
            }

            log.value.push(`> ${name}`)
            let result = ''

            switch (name) {
              case 'web_search':
                log.value.push(`  Searching: ${args.query}`)
                try {
                  result = await executeWebSearch(args.query as string)
                  log.value.push(`  Found results`)
                } catch (e) {
                  const errorMsg = e instanceof Error ? e.message : 'Search failed'
                  log.value.push(`  ERROR: ${errorMsg}`)
                  notifications$.error('Web search failed', errorMsg)
                  result = `Error: ${errorMsg}`
                }
                break

              case 'fetch_url': {
                const urlToFetch = args.url as string
                log.value.push(`  Fetching: ${urlToFetch}`)
                // Validate URL before fetching
                if (!isValidFetchUrl(urlToFetch)) {
                  const errorMsg = 'Invalid URL: only http/https URLs to public hosts are allowed'
                  log.value.push(`  ERROR: ${errorMsg}`)
                  result = `Error: ${errorMsg}`
                  break
                }
                try {
                  result = await executeFetchUrl(urlToFetch)
                  log.value.push(`  Got content (${result.length} chars)`)
                } catch (e) {
                  const errorMsg = e instanceof Error ? e.message : 'Fetch failed'
                  log.value.push(`  ERROR: ${errorMsg}`)
                  notifications$.error('URL fetch failed', errorMsg)
                  result = `Error: ${errorMsg}`
                }
                break
              }

              case 'wikipedia_search':
                log.value.push(`  Wikipedia: ${args.query}`)
                try {
                  result = await executeWikipediaSearch(args.query as string)
                  log.value.push(`  Found results`)
                } catch (e) {
                  const errorMsg = e instanceof Error ? e.message : 'Search failed'
                  log.value.push(`  ERROR: ${errorMsg}`)
                  notifications$.error('Wikipedia search failed', errorMsg)
                  result = `Error: ${errorMsg}`
                }
                break

              case 'update_content': {
                // Convert LaTeX math to Typst format
                const rawContent = args.content as string
                const convertedContent = convertLatexDocument(rawContent)
                currentContent.value = convertedContent
                await ctx.updateContent(convertedContent)
                contentWasUpdated = true
                result = 'Content updated and saved'
                const mathConverted = rawContent !== convertedContent ? ' (math converted to Typst)' : ''
                log.value.push(`  Updated content (${convertedContent.length} chars)${mathConverted}`)
                break
              }

              case 'append_content': {
                // Convert LaTeX math to Typst format
                const rawText = args.text as string
                const convertedText = convertLatexDocument(rawText)
                currentContent.value += '\n' + convertedText
                await ctx.updateContent(currentContent.value)
                contentWasUpdated = true
                result = 'Text appended and saved'
                log.value.push(`  Appended text`)
                break
              }

              case 'update_title':
                await ctx.updateTitle(args.title as string)
                result = `Title changed to "${args.title}"`
                log.value.push(`  Title: ${args.title}`)
                break

              case 'done':
                // Check if content was actually updated
                if (!contentWasUpdated) {
                  log.value.push(`  WARNING: No content saved yet!`)
                  result = `REJECTED: You cannot call done() yet because you have not saved any content to the note.

YOUR NEXT STEP: Call update_content with your answer. Example:
update_content("# Pi\\n\\nPi (π) is a mathematical constant equal to approximately 3.14159...")

After update_content succeeds, then you may call done().`
                  break
                }
                log.value.push(`> Done: ${args.summary}`)
                isRunning.value = false
                return args.summary as string

              default:
                log.value.push(`  Unknown tool: ${name}`)
                result = `Error: Unknown tool "${name}". Available tools: web_search, wikipedia_search, update_content, append_content, update_title, done`
            }

            messages.push({ role: 'tool', content: result, tool_call_id: toolCallId })
          }
        } else if (msg.content) {
          // Check for completion signals
          if (/done|complete|finished/i.test(msg.content) && msg.content.length < 100) {
            log.value.push(`> Complete`)
            isRunning.value = false
            return msg.content
          }
          // Prompt to use tools
          messages.push({ role: 'user', content: 'Use tools. Call done() when finished.' })
        }
      } catch (e: unknown) {
        const errorMsg = e instanceof Error ? e.message : String(e)

        if (errorMsg === 'Cancelled' || errorMsg.includes('AbortError')) {
          log.value.push('> Stopped')
          isRunning.value = false
          return 'Stopped by user'
        }

        // Show specific error to user
        log.value.push(`> ERROR: ${errorMsg}`)

        if (errorMsg.includes('400')) {
          notifications$.error('LLM does not support tools', 'This model may not support function calling. Try a different model (e.g., GPT-4, Claude, or a local model with tool support).')
        } else if (errorMsg.includes('401') || errorMsg.includes('403')) {
          notifications$.error('API authentication failed', 'Check your API key in Settings.')
        } else if (errorMsg.includes('429')) {
          notifications$.error('Rate limit exceeded', 'Too many requests. Wait a moment and try again.')
        } else if (errorMsg.includes('500') || errorMsg.includes('502') || errorMsg.includes('503')) {
          notifications$.error('LLM service error', 'The LLM service is temporarily unavailable.')
        } else {
          notifications$.error('Agent error', errorMsg)
        }

        isRunning.value = false
        return `Error: ${errorMsg}`
      }
    }

    isRunning.value = false
    if (!contentWasUpdated) {
      log.value.push('> Failed: Agent did not save any content')
      notifications$.error('Agent failed', 'The AI model failed to use update_content(). Try a different model or rephrase your request.')
    } else {
      log.value.push('> Max iterations reached')
      notifications$.warning('Agent stopped', 'Maximum iterations reached.')
    }
    return 'Max iterations reached'
  }

  function stop() {
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
