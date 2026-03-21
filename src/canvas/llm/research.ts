/**
 * Research Module
 *
 * Unified research across multiple sources:
 * - Local nodes (from current canvas)
 * - Web search (DuckDuckGo)
 * - Wikipedia
 *
 * Returns results with source attribution.
 */

import type { ResearchResult } from './types'
import type { Node } from '../../types'

export interface ResearchOptions {
  sources?: Array<'local' | 'web' | 'wikipedia'>
  maxResults?: number
  localNodes?: Node[]
}

const DEFAULT_SOURCES: Array<'local' | 'web' | 'wikipedia'> = ['local', 'web']
const DEFAULT_MAX_RESULTS = 10

/**
 * Search local nodes for matching content
 */
function searchLocalNodes(
  query: string,
  nodes: Node[],
  maxResults: number
): ResearchResult[] {
  const queryLower = query.toLowerCase()
  const queryTerms = queryLower.split(/\s+/).filter(t => t.length > 2)

  const scored: Array<{ node: Node; score: number }> = []

  for (const node of nodes) {
    const titleLower = node.title.toLowerCase()
    const contentLower = (node.markdown_content || '').toLowerCase()
    const fullText = `${titleLower} ${contentLower}`

    let score = 0

    // Exact phrase match in title (highest priority)
    if (titleLower.includes(queryLower)) {
      score += 100
    }

    // Exact phrase match in content
    if (contentLower.includes(queryLower)) {
      score += 50
    }

    // Individual term matches
    for (const term of queryTerms) {
      if (titleLower.includes(term)) score += 10
      if (contentLower.includes(term)) score += 5
    }

    // Term density
    const termCount = queryTerms.filter(t => fullText.includes(t)).length
    score += (termCount / queryTerms.length) * 20

    if (score > 0) {
      scored.push({ node, score })
    }
  }

  // Sort by score descending
  scored.sort((a, b) => b.score - a.score)

  return scored.slice(0, maxResults).map(({ node }) => ({
    source: 'local' as const,
    title: node.title,
    content: (node.markdown_content || '').slice(0, 500),
    nodeId: node.id,
  }))
}

/**
 * Search web using DuckDuckGo Instant Answer API
 */
async function searchWeb(query: string, maxResults: number): Promise<ResearchResult[]> {
  try {
    const ddgUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1`
    const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(ddgUrl)}`

    const resp = await fetch(proxyUrl, { signal: AbortSignal.timeout(10000) })
    if (!resp.ok) return []

    const data = await resp.json()
    const results: ResearchResult[] = []

    // Abstract (main answer)
    if (data.Abstract && data.AbstractText) {
      results.push({
        source: 'web',
        title: data.Heading || query,
        content: data.AbstractText,
        url: data.AbstractURL,
      })
    }

    // Related topics
    if (data.RelatedTopics && Array.isArray(data.RelatedTopics)) {
      for (const topic of data.RelatedTopics.slice(0, maxResults - results.length)) {
        if (topic.Text) {
          results.push({
            source: 'web',
            title: topic.FirstURL?.split('/').pop()?.replace(/_/g, ' ') || 'Related',
            content: topic.Text,
            url: topic.FirstURL,
          })
        }
      }
    }

    return results.slice(0, maxResults)
  } catch (e) {
    console.error('[Research] Web search error:', e)
    return []
  }
}

/**
 * Search Wikipedia API directly
 */
async function searchWikipedia(query: string, maxResults: number): Promise<ResearchResult[]> {
  try {
    const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&origin=*&srlimit=${maxResults}`

    const resp = await fetch(searchUrl, { signal: AbortSignal.timeout(10000) })
    if (!resp.ok) return []

    const data = await resp.json()
    const results: ResearchResult[] = []

    if (data.query?.search) {
      for (const item of data.query.search) {
        // Strip HTML tags from snippet
        const cleanSnippet = item.snippet.replace(/<[^>]+>/g, '')
        results.push({
          source: 'wikipedia',
          title: item.title,
          content: cleanSnippet,
          url: `https://en.wikipedia.org/wiki/${encodeURIComponent(item.title.replace(/ /g, '_'))}`,
        })
      }
    }

    return results
  } catch (e) {
    console.error('[Research] Wikipedia search error:', e)
    return []
  }
}

/**
 * Perform unified research across sources
 */
export async function research(
  query: string,
  options: ResearchOptions = {}
): Promise<ResearchResult[]> {
  const sources = options.sources || DEFAULT_SOURCES
  const maxResults = options.maxResults || DEFAULT_MAX_RESULTS
  const localNodes = options.localNodes || []

  const results: ResearchResult[] = []
  const perSourceLimit = Math.ceil(maxResults / sources.length)

  // Run searches in parallel
  const searches: Promise<ResearchResult[]>[] = []

  if (sources.includes('local') && localNodes.length > 0) {
    searches.push(Promise.resolve(searchLocalNodes(query, localNodes, perSourceLimit)))
  }

  if (sources.includes('web')) {
    searches.push(searchWeb(query, perSourceLimit))
  }

  if (sources.includes('wikipedia')) {
    searches.push(searchWikipedia(query, perSourceLimit))
  }

  const searchResults = await Promise.all(searches)

  for (const sourceResults of searchResults) {
    results.push(...sourceResults)
  }

  // Return up to maxResults total
  return results.slice(0, maxResults)
}

/**
 * Format research results for LLM context
 */
export function formatResearchResults(results: ResearchResult[]): string {
  if (results.length === 0) {
    return 'No results found.'
  }

  const sections: string[] = []

  // Group by source
  const bySource = new Map<string, ResearchResult[]>()
  for (const r of results) {
    if (!bySource.has(r.source)) bySource.set(r.source, [])
    bySource.get(r.source)!.push(r)
  }

  // Format each source section
  for (const [source, sourceResults] of bySource) {
    const header = source === 'local' ? 'Local Nodes' :
                   source === 'web' ? 'Web Results' :
                   source === 'wikipedia' ? 'Wikipedia' : source

    const items = sourceResults.map((r, i) => {
      const ref = r.nodeId ? `[node:${r.nodeId}]` :
                  r.url ? `[${r.url}]` : ''
      return `${i + 1}. **${r.title}** ${ref}\n   ${r.content.slice(0, 200)}${r.content.length > 200 ? '...' : ''}`
    }).join('\n')

    sections.push(`### ${header}\n${items}`)
  }

  return sections.join('\n\n')
}

/**
 * Quick search - just returns formatted string
 */
export async function quickResearch(
  query: string,
  localNodes: Node[] = [],
  sources: Array<'local' | 'web' | 'wikipedia'> = DEFAULT_SOURCES
): Promise<string> {
  const results = await research(query, { localNodes, sources, maxResults: 8 })
  return formatResearchResults(results)
}
