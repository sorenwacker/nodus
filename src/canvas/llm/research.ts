/**
 * Research Module
 *
 * Unified research across multiple sources:
 * - Local nodes (from current canvas)
 * - Web search (DuckDuckGo)
 * - Wikipedia (search + full articles)
 *
 * Supports deep research with:
 * - Multi-step iterative queries
 * - Cross-validation across sources
 * - Completeness checking
 */

import type { ResearchResult } from './types'
import type { Node } from '../../types'

export interface ResearchOptions {
  sources?: Array<'local' | 'web' | 'wikipedia'>
  maxResults?: number
  localNodes?: Node[]
}

export interface DeepResearchOptions extends ResearchOptions {
  depth?: 'quick' | 'moderate' | 'thorough' | 'exhaustive'
  validateClaims?: boolean
  extractConcepts?: boolean
}

export interface ResearchFinding {
  claim: string
  sources: Array<{ source: string; excerpt: string; url?: string }>
  confidence: 'high' | 'medium' | 'low'
  validated: boolean
}

export interface DeepResearchResult {
  topic: string
  summary: string
  findings: ResearchFinding[]
  concepts: string[]
  sources: ResearchResult[]
  completenessScore: number
  suggestedFollowUps: string[]
}

const DEFAULT_SOURCES: Array<'local' | 'web' | 'wikipedia'> = ['local', 'web', 'wikipedia']
const DEFAULT_MAX_RESULTS = 10

const DEPTH_CONFIG = {
  quick: { rounds: 1, resultsPerRound: 5, followUps: 0 },
  moderate: { rounds: 2, resultsPerRound: 8, followUps: 2 },
  thorough: { rounds: 3, resultsPerRound: 10, followUps: 4 },
  exhaustive: { rounds: 5, resultsPerRound: 15, followUps: 6 },
}

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
 * Search Wikipedia API
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
 * Fetch full Wikipedia article content
 */
export async function fetchWikipediaArticle(title: string): Promise<string | null> {
  try {
    const url = `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(title)}&prop=extracts&exintro=false&explaintext=true&format=json&origin=*`

    const resp = await fetch(url, { signal: AbortSignal.timeout(15000) })
    if (!resp.ok) return null

    const data = await resp.json()
    const pages = data.query?.pages

    if (pages) {
      const pageId = Object.keys(pages)[0]
      if (pageId && pageId !== '-1') {
        const extract = pages[pageId].extract
        // Limit to reasonable size (first ~5000 chars)
        return extract ? extract.slice(0, 5000) : null
      }
    }

    return null
  } catch (e) {
    console.error('[Research] Wikipedia article fetch error:', e)
    return null
  }
}

/**
 * Fetch Wikipedia article sections
 */
export async function fetchWikipediaSections(title: string): Promise<Array<{ title: string; content: string }>> {
  try {
    const url = `https://en.wikipedia.org/w/api.php?action=parse&page=${encodeURIComponent(title)}&prop=sections|text&format=json&origin=*`

    const resp = await fetch(url, { signal: AbortSignal.timeout(15000) })
    if (!resp.ok) return []

    const data = await resp.json()
    const sections: Array<{ title: string; content: string }> = []

    if (data.parse?.sections) {
      for (const section of data.parse.sections.slice(0, 10)) {
        sections.push({
          title: section.line,
          content: '', // Would need additional API call for full content
        })
      }
    }

    return sections
  } catch (e) {
    console.error('[Research] Wikipedia sections error:', e)
    return []
  }
}

/**
 * Extract key concepts from text
 */
function extractConcepts(text: string): string[] {
  // Simple extraction: find capitalized phrases and repeated terms
  const words = text.split(/\s+/)
  const conceptCounts = new Map<string, number>()

  // Look for capitalized words (potential proper nouns/concepts)
  const capitalizedPattern = /^[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*$/

  for (let i = 0; i < words.length; i++) {
    const word = words[i].replace(/[^a-zA-Z]/g, '')
    if (word.length > 3 && capitalizedPattern.test(word)) {
      conceptCounts.set(word, (conceptCounts.get(word) || 0) + 1)
    }

    // Bigrams
    if (i < words.length - 1) {
      const bigram = `${words[i]} ${words[i + 1]}`.replace(/[^a-zA-Z\s]/g, '')
      if (capitalizedPattern.test(bigram)) {
        conceptCounts.set(bigram, (conceptCounts.get(bigram) || 0) + 1)
      }
    }
  }

  // Return top concepts by frequency
  return Array.from(conceptCounts.entries())
    .filter(([_, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([concept]) => concept)
}

/**
 * Cross-validate a claim across sources
 */
export async function validateClaim(
  claim: string,
  localNodes: Node[] = []
): Promise<{ validated: boolean; confidence: 'high' | 'medium' | 'low'; sources: string[] }> {
  const results = await research(claim, {
    sources: ['web', 'wikipedia', 'local'],
    maxResults: 6,
    localNodes,
  })

  const matchingSources: string[] = []
  const claimTerms = claim.toLowerCase().split(/\s+/).filter(t => t.length > 3)

  for (const result of results) {
    const contentLower = result.content.toLowerCase()
    const matchCount = claimTerms.filter(term => contentLower.includes(term)).length
    const matchRatio = matchCount / claimTerms.length

    if (matchRatio > 0.5) {
      matchingSources.push(result.source)
    }
  }

  const uniqueSources = [...new Set(matchingSources)]

  return {
    validated: uniqueSources.length >= 2,
    confidence: uniqueSources.length >= 3 ? 'high' : uniqueSources.length >= 2 ? 'medium' : 'low',
    sources: uniqueSources,
  }
}

/**
 * Assess research completeness
 */
export function assessCompleteness(
  topic: string,
  findings: ResearchFinding[],
  expectedAspects: string[] = []
): { score: number; missing: string[]; suggestions: string[] } {
  // Check how many aspects are covered
  const coveredAspects = new Set<string>()
  const allContent = findings.map(f => f.claim.toLowerCase()).join(' ')

  for (const aspect of expectedAspects) {
    if (allContent.includes(aspect.toLowerCase())) {
      coveredAspects.add(aspect)
    }
  }

  const coverage = expectedAspects.length > 0
    ? coveredAspects.size / expectedAspects.length
    : findings.length / 10 // Default: expect ~10 findings

  const missing = expectedAspects.filter(a => !coveredAspects.has(a))

  // Generate suggestions based on missing aspects
  const suggestions = missing.map(aspect => `${topic} ${aspect}`)

  // Also add general follow-up suggestions
  if (findings.length < 5) {
    suggestions.push(`${topic} overview`, `${topic} key concepts`)
  }

  return {
    score: Math.min(1, coverage),
    missing,
    suggestions: suggestions.slice(0, 5),
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
 * Deep research with multiple rounds and cross-validation
 */
export async function deepResearch(
  topic: string,
  options: DeepResearchOptions = {}
): Promise<DeepResearchResult> {
  const depth = options.depth || 'moderate'
  const config = DEPTH_CONFIG[depth]
  const localNodes = options.localNodes || []
  const shouldValidate = options.validateClaims !== false
  const shouldExtractConcepts = options.extractConcepts !== false

  const allResults: ResearchResult[] = []
  const findings: ResearchFinding[] = []
  const concepts = new Set<string>()
  const queriesUsed = new Set<string>()

  console.log(`[Research] Starting deep research on "${topic}" (depth: ${depth})`)

  // Round 1: Initial broad search
  queriesUsed.add(topic)
  const initialResults = await research(topic, {
    sources: ['web', 'wikipedia', 'local'],
    maxResults: config.resultsPerRound,
    localNodes,
  })
  allResults.push(...initialResults)

  // Extract concepts for follow-up queries
  if (shouldExtractConcepts) {
    const allText = initialResults.map(r => r.content).join(' ')
    for (const concept of extractConcepts(allText)) {
      concepts.add(concept)
    }
  }

  // Additional rounds with follow-up queries
  for (let round = 1; round < config.rounds; round++) {
    // Generate follow-up queries from concepts
    const followUpConcepts = Array.from(concepts).slice(0, config.followUps)

    for (const concept of followUpConcepts) {
      const followUpQuery = `${topic} ${concept}`
      if (queriesUsed.has(followUpQuery)) continue
      queriesUsed.add(followUpQuery)

      console.log(`[Research] Follow-up query: "${followUpQuery}"`)

      const results = await research(followUpQuery, {
        sources: ['web', 'wikipedia'],
        maxResults: Math.ceil(config.resultsPerRound / 2),
        localNodes,
      })

      allResults.push(...results)

      // Extract more concepts
      if (shouldExtractConcepts) {
        const text = results.map(r => r.content).join(' ')
        for (const c of extractConcepts(text)) {
          concepts.add(c)
        }
      }
    }
  }

  // Fetch full Wikipedia articles for key topics
  const wikiResults = allResults.filter(r => r.source === 'wikipedia').slice(0, 3)
  for (const wiki of wikiResults) {
    const fullContent = await fetchWikipediaArticle(wiki.title)
    if (fullContent) {
      wiki.content = fullContent.slice(0, 2000)
    }
  }

  // Create findings from results
  const seenClaims = new Set<string>()
  for (const result of allResults) {
    // Use title as claim identifier
    const claimKey = result.title.toLowerCase()
    if (seenClaims.has(claimKey)) continue
    seenClaims.add(claimKey)

    const finding: ResearchFinding = {
      claim: result.title,
      sources: [{
        source: result.source,
        excerpt: result.content.slice(0, 200),
        url: result.url,
      }],
      confidence: 'medium',
      validated: false,
    }

    // Add sources from other results with same/similar title
    for (const other of allResults) {
      if (other === result) continue
      if (other.title.toLowerCase().includes(claimKey) ||
          claimKey.includes(other.title.toLowerCase())) {
        finding.sources.push({
          source: other.source,
          excerpt: other.content.slice(0, 200),
          url: other.url,
        })
      }
    }

    // Update confidence based on source count
    if (finding.sources.length >= 3) {
      finding.confidence = 'high'
    } else if (finding.sources.length === 1) {
      finding.confidence = 'low'
    }

    findings.push(finding)
  }

  // Cross-validate findings if enabled
  if (shouldValidate) {
    for (const finding of findings.slice(0, 5)) { // Validate top 5
      const validation = await validateClaim(finding.claim, localNodes)
      finding.validated = validation.validated
      if (validation.confidence === 'high') {
        finding.confidence = 'high'
      }
    }
  }

  // Assess completeness
  const expectedAspects = Array.from(concepts).slice(0, 5)
  const completeness = assessCompleteness(topic, findings, expectedAspects)

  // Generate summary
  const summary = `Research on "${topic}" found ${findings.length} key findings from ${allResults.length} sources. ` +
    `${findings.filter(f => f.confidence === 'high').length} findings have high confidence. ` +
    `Coverage score: ${Math.round(completeness.score * 100)}%.`

  return {
    topic,
    summary,
    findings,
    concepts: Array.from(concepts),
    sources: allResults,
    completenessScore: completeness.score,
    suggestedFollowUps: completeness.suggestions,
  }
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
      return `${i + 1}. **${r.title}** ${ref}\n   ${r.content.slice(0, 300)}${r.content.length > 300 ? '...' : ''}`
    }).join('\n')

    sections.push(`### ${header}\n${items}`)
  }

  return sections.join('\n\n')
}

/**
 * Format deep research results
 */
export function formatDeepResearchResults(result: DeepResearchResult): string {
  const sections: string[] = []

  sections.push(`# Research: ${result.topic}\n`)
  sections.push(result.summary)
  sections.push('')

  // Key findings
  sections.push('## Key Findings\n')
  for (const finding of result.findings.slice(0, 15)) {
    const confidence = finding.confidence === 'high' ? '[HIGH]' :
                       finding.confidence === 'medium' ? '[MED]' : '[LOW]'
    const validated = finding.validated ? ' (validated)' : ''
    sections.push(`- **${finding.claim}** ${confidence}${validated}`)
    if (finding.sources.length > 0) {
      sections.push(`  Sources: ${finding.sources.map(s => s.source).join(', ')}`)
    }
  }

  // Concepts discovered
  if (result.concepts.length > 0) {
    sections.push('\n## Related Concepts\n')
    sections.push(result.concepts.slice(0, 15).join(', '))
  }

  // Completeness
  sections.push(`\n## Completeness: ${Math.round(result.completenessScore * 100)}%`)

  if (result.suggestedFollowUps.length > 0) {
    sections.push('\n## Suggested Follow-up Research')
    for (const suggestion of result.suggestedFollowUps) {
      sections.push(`- ${suggestion}`)
    }
  }

  return sections.join('\n')
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
