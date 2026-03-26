/**
 * Research tool registrations
 *
 * Shared research tools used by both graph agent and node agent:
 * - web_search: Search the web using Tavily API
 * - fetch_url: Fetch and parse URL content
 * - wikipedia_search: Search Wikipedia for encyclopedic information
 *
 * These tools return markers that are handled by the agent runners.
 */

import { defineTool } from '../registry'

export function registerResearchTools(): void {
  // Note: web_search is already registered in planningTools.ts for the graph agent
  // This registration provides the same tool for node agent compatibility
  // The actual execution is handled by the agent runners via markers

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
    async (args, _ctx) => {
      return `__FETCH_URL__:${args.url}`
    },
    { category: 'research' }
  )
}
