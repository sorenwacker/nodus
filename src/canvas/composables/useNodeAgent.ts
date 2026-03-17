/**
 * Node Agent composable
 * Agent runner focused on a single node with web search and editing tools
 */
import { ref, type Ref } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import type { ChatMessage } from '../llm/types'
import { llmQueue } from '../llm/queue'
import { notifications$ } from '../../composables/useNotifications'
import { llmStorage } from '../../lib/storage'

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
    // Apply context limit from settings
    const maxChars = llmStorage.getChainContextLimit()
    if (maxChars > 0 && content.length > maxChars) {
      content = content.slice(0, maxChars) + '...\n\n[Content truncated]'
    }
    return content
  } catch (e) {
    throw new Error(`Failed to fetch URL: ${e instanceof Error ? e.message : String(e)}`)
  }
}

async function executeWikipediaSearch(query: string): Promise<string> {
  // First, search for the article
  try {
    const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&origin=*&srlimit=1`
    const searchResp = await fetch(searchUrl)
    if (searchResp.ok) {
      const searchData = await searchResp.json()
      if (searchData.query?.search?.length > 0) {
        const title = searchData.query.search[0].title

        // Fetch the full article content using TextExtracts API
        const contentUrl = `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(title)}&prop=extracts&explaintext=1&exsectionformat=plain&format=json&origin=*`
        const contentResp = await fetch(contentUrl)
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
    // Wikipedia search failed
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
      connectedContext = '\n\nCONNECTED NOTES:\n' +
        ctx.connectedNodes.slice(0, 5).map(n => `- ${n.title}: ${n.content.slice(0, 200)}...`).join('\n')
    }

    return `You are a note editor agent working on "${ctx.nodeTitle}".

CURRENT CONTENT:
${ctx.nodeContent || '(empty)'}
${connectedContext}

TOOLS:
- web_search(query): Search the web, returns titles + snippets + URLs
- fetch_url(url): Read the full content of a web page (use after web_search to get details)
- wikipedia_search(query): Search Wikipedia for encyclopedic definitions
- update_content(content): Replace note content
- append_content(text): Add text to end of note
- update_title(title): Change note title
- done(summary): Signal completion

RULES:
1. Use web_search to find relevant pages, then fetch_url to read the content
2. Use update_content to save your findings
3. Format in markdown. For references, use REAL URLs as markdown links: [Source Name](https://actual-url.com)
4. Do NOT invent fake wikilinks like [[Wikipedia:X]] - use actual URLs from your search results
5. Call done() when finished`
  }

  async function run(prompt: string, ctx: NodeAgentContext): Promise<string> {
    if (isRunning.value) {
      llmQueue.cancelCurrent()
    }

    isRunning.value = true
    log.value = [`> ${prompt}`]
    currentContent.value = ctx.nodeContent

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

              case 'fetch_url':
                log.value.push(`  Fetching: ${args.url}`)
                try {
                  result = await executeFetchUrl(args.url as string)
                  log.value.push(`  Got content (${result.length} chars)`)
                } catch (e) {
                  const errorMsg = e instanceof Error ? e.message : 'Fetch failed'
                  log.value.push(`  ERROR: ${errorMsg}`)
                  notifications$.error('URL fetch failed', errorMsg)
                  result = `Error: ${errorMsg}`
                }
                break

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

              case 'update_content':
                currentContent.value = args.content as string
                await ctx.updateContent(args.content as string)
                result = 'Content updated'
                log.value.push(`  Updated content (${(args.content as string).length} chars)`)
                break

              case 'append_content':
                currentContent.value += '\n' + (args.text as string)
                await ctx.updateContent(currentContent.value)
                result = 'Text appended'
                log.value.push(`  Appended text`)
                break

              case 'update_title':
                await ctx.updateTitle(args.title as string)
                result = `Title changed to "${args.title}"`
                log.value.push(`  Title: ${args.title}`)
                break

              case 'done':
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
    log.value.push('> Max iterations reached')
    notifications$.warning('Agent stopped', 'Maximum iterations reached without completion.')
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
