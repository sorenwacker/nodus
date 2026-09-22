/**
 * Web tools shared by the graph agent and the node agent: web_search and
 * fetch_url. Both go through the `search` context service.
 */

import { defineTool } from '../registry'
import { isValidFetchUrl } from '../../lib/promptSecurity'

export function registerResearchTools(): void {
  defineTool<{ query: string }>(
    'web_search',
    'Search the web for information. Use this to research topics before creating nodes.',
    {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
      },
      required: ['query'],
    },
    async (args, ctx) => {
      const query = args.query || ''
      ctx.log(`> Web search: "${query}"`)
      try {
        const results = await ctx.search!.webSearch(query)
        ctx.log(`> Web search: Found ${results.length} results`)
        if (results.length === 0) return `No web results for "${query}"`
        const formatted = results
          .map((r, i) => `${i + 1}. **${r.title}**\n${r.content}\n[${r.url}]`)
          .join('\n\n')
        return `## Web Search: "${query}"\n\n${formatted}`
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e)
        ctx.log(`> Web search failed: ${message}`)
        return `Error: Web search failed: ${message}`
      }
    },
    { modes: ['explore', 'plan', 'execute', 'node'], mutates: false, requires: ['search'] }
  )

  defineTool<{ url: string }>(
    'fetch_url',
    'Fetch and read the content of a web page. Use this after web_search to read full articles.',
    {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'The URL to fetch' },
      },
      required: ['url'],
    },
    async (args, ctx) => {
      const url = args.url || ''
      ctx.log(`> Fetching: ${url}`)
      if (!isValidFetchUrl(url)) {
        return 'Error: Invalid URL: only http/https URLs to public hosts are allowed'
      }
      try {
        const content = await ctx.search!.fetchUrl(url)
        ctx.log(`> Got content (${content.length} chars)`)
        return content
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e)
        ctx.log(`> Fetch failed: ${message}`)
        return `Error: Failed to fetch URL: ${message}`
      }
    },
    { modes: ['node'], mutates: false, requires: ['search'] }
  )
}
