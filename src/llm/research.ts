/**
 * Research Module - Deep Iterative Research with Cross-Validation
 *
 * Sources:
 * - Local nodes (from current canvas)
 * - Web search (Tavily API via Tauri backend)
 * - Wikipedia (full articles + search)
 *
 * Features:
 * - Multi-round iterative queries
 * - Concept extraction and follow-up
 * - Cross-validation across sources
 * - Completeness assessment
 */

import { invoke } from '@tauri-apps/api/core'
import type { ResearchResult } from './types'
import type { Node } from '../types'

// Tavily search result from backend
interface TavilyResult {
  title: string
  url: string
  content: string
}

export interface ResearchOptions {
  sources?: Array<'local' | 'web' | 'wikipedia'>
  maxResults?: number
  localNodes?: Node[]
  log?: (msg: string) => void
}

export interface DeepResearchOptions extends ResearchOptions {
  depth?: 'quick' | 'moderate' | 'thorough' | 'exhaustive'
  validateClaims?: boolean
  extractConcepts?: boolean
  aspects?: string[]
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
  queriesPerformed: string[]
}

const DEFAULT_SOURCES: Array<'local' | 'web' | 'wikipedia'> = ['local', 'web', 'wikipedia']

const DEPTH_CONFIG = {
  quick: { rounds: 1, searchesPerRound: 2, followUps: 1, wikiArticles: 1 },
  moderate: { rounds: 2, searchesPerRound: 3, followUps: 3, wikiArticles: 2 },
  thorough: { rounds: 3, searchesPerRound: 4, followUps: 5, wikiArticles: 4 },
  exhaustive: { rounds: 5, searchesPerRound: 5, followUps: 8, wikiArticles: 6 },
}

/**
 * Get the Tavily API key from storage
 */
function getApiKey(): string | null {
  // Key is stored directly, not in a JSON object
  return localStorage.getItem('nodus_search_api_key') || null
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

    if (titleLower.includes(queryLower)) score += 100
    if (contentLower.includes(queryLower)) score += 50

    for (const term of queryTerms) {
      if (titleLower.includes(term)) score += 10
      if (contentLower.includes(term)) score += 5
    }

    const termCount = queryTerms.filter(t => fullText.includes(t)).length
    score += (termCount / queryTerms.length) * 20

    if (score > 0) {
      scored.push({ node, score })
    }
  }

  scored.sort((a, b) => b.score - a.score)

  return scored.slice(0, maxResults).map(({ node }) => ({
    source: 'local' as const,
    title: node.title,
    content: (node.markdown_content || '').slice(0, 500),
    nodeId: node.id,
  }))
}

/**
 * Search web using Tavily API (via Tauri backend)
 */
async function searchWebTavily(
  query: string,
  log?: (msg: string) => void
): Promise<ResearchResult[]> {
  try {
    const apiKey = await getApiKey()
    if (!apiKey) {
      log?.('> Web search: No API key configured')
      return []
    }

    log?.(`> Web search: "${query}"`)

    const results = await invoke<TavilyResult[]>('web_search', {
      query,
      apiKey,
    })

    return results.map(r => ({
      source: 'web' as const,
      title: r.title,
      content: r.content,
      url: r.url,
    }))
  } catch (e) {
    console.error('[Research] Tavily search error:', e)
    log?.(`> Web search failed: ${e}`)
    return []
  }
}

/**
 * Search Wikipedia
 */
async function searchWikipedia(
  query: string,
  maxResults: number,
  log?: (msg: string) => void
): Promise<ResearchResult[]> {
  try {
    log?.(`> Wikipedia search: "${query}"`)

    const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&origin=*&srlimit=${maxResults}`

    const resp = await fetch(searchUrl, { signal: AbortSignal.timeout(10000) })
    if (!resp.ok) return []

    const data = await resp.json()
    const results: ResearchResult[] = []

    if (data.query?.search) {
      for (const item of data.query.search) {
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
export async function fetchWikipediaArticle(
  title: string,
  log?: (msg: string) => void
): Promise<string | null> {
  try {
    log?.(`> Fetching Wikipedia article: "${title}"`)

    const url = `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(title)}&prop=extracts&exintro=false&explaintext=true&format=json&origin=*`

    const resp = await fetch(url, { signal: AbortSignal.timeout(15000) })
    if (!resp.ok) return null

    const data = await resp.json()
    const pages = data.query?.pages

    if (pages) {
      const pageId = Object.keys(pages)[0]
      if (pageId && pageId !== '-1') {
        const extract = pages[pageId].extract
        return extract ? extract.slice(0, 8000) : null
      }
    }

    return null
  } catch (e) {
    console.error('[Research] Wikipedia article fetch error:', e)
    return null
  }
}

/**
 * Extract key concepts from text using simple NLP
 */
function extractConcepts(text: string): string[] {
  // Extract capitalized phrases and technical terms
  const words = text.split(/\s+/)
  const conceptCounts = new Map<string, number>()

  // Pattern for potential concepts (capitalized, multi-word allowed)
  for (let i = 0; i < words.length; i++) {
    const word = words[i].replace(/[^a-zA-Z-]/g, '')

    // Single capitalized words (3+ chars)
    if (word.length >= 3 && /^[A-Z][a-z]+/.test(word)) {
      conceptCounts.set(word, (conceptCounts.get(word) || 0) + 1)
    }

    // Two-word phrases
    if (i < words.length - 1) {
      const next = words[i + 1].replace(/[^a-zA-Z-]/g, '')
      if (/^[A-Z][a-z]+/.test(word) && /^[a-z]+/.test(next) && next.length >= 3) {
        const phrase = `${word} ${next}`
        conceptCounts.set(phrase, (conceptCounts.get(phrase) || 0) + 1)
      }
    }
  }

  // Return concepts that appear at least twice, sorted by frequency
  return Array.from(conceptCounts.entries())
    .filter(([_, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([concept]) => concept)
}

/**
 * Generate follow-up queries based on topic and discovered concepts
 */
function generateFollowUpQueries(
  topic: string,
  concepts: string[],
  aspects: string[],
  queriesUsed: Set<string>
): string[] {
  const followUps: string[] = []

  // Add aspect-based queries
  for (const aspect of aspects) {
    const q = `${topic} ${aspect}`
    if (!queriesUsed.has(q.toLowerCase())) {
      followUps.push(q)
    }
  }

  // Add concept-based queries
  for (const concept of concepts) {
    // Skip if concept is too similar to topic
    if (topic.toLowerCase().includes(concept.toLowerCase())) continue

    const q = `${concept} ${topic}`
    if (!queriesUsed.has(q.toLowerCase())) {
      followUps.push(q)
    }
  }

  // Add standard research queries
  const standardQueries = [
    `${topic} anatomy structure`,
    `${topic} function purpose`,
    `${topic} research findings`,
    `${topic} scientific overview`,
  ]

  for (const q of standardQueries) {
    if (!queriesUsed.has(q.toLowerCase())) {
      followUps.push(q)
    }
  }

  return followUps
}

/**
 * Cross-validate a claim across sources
 */
export async function validateClaim(
  claim: string,
  localNodes: Node[] = [],
  log?: (msg: string) => void
): Promise<{ validated: boolean; confidence: 'high' | 'medium' | 'low'; sources: string[] }> {
  log?.(`> Validating claim: "${claim.slice(0, 50)}..."`)

  const results: ResearchResult[] = []

  // Search web
  const webResults = await searchWebTavily(claim, log)
  results.push(...webResults)

  // Search Wikipedia
  const wikiResults = await searchWikipedia(claim, 3, log)
  results.push(...wikiResults)

  // Search local
  const localResults = searchLocalNodes(claim, localNodes, 3)
  results.push(...localResults)

  const matchingSources: string[] = []
  const claimTerms = claim.toLowerCase().split(/\s+/).filter(t => t.length > 3)

  for (const result of results) {
    const contentLower = result.content.toLowerCase()
    const matchCount = claimTerms.filter(term => contentLower.includes(term)).length
    const matchRatio = matchCount / claimTerms.length

    if (matchRatio > 0.4) {
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
  const coveredAspects = new Set<string>()
  const allContent = findings.map(f => f.claim.toLowerCase()).join(' ')

  for (const aspect of expectedAspects) {
    if (allContent.includes(aspect.toLowerCase())) {
      coveredAspects.add(aspect)
    }
  }

  // Score based on:
  // - Number of findings (more = better, up to 20)
  // - Aspect coverage
  // - High-confidence findings
  const findingsScore = Math.min(findings.length / 20, 1) * 0.4
  const aspectScore = expectedAspects.length > 0
    ? (coveredAspects.size / expectedAspects.length) * 0.3
    : 0.3
  const confidenceScore = (findings.filter(f => f.confidence === 'high').length / Math.max(findings.length, 1)) * 0.3

  const score = findingsScore + aspectScore + confidenceScore

  const missing = expectedAspects.filter(a => !coveredAspects.has(a))
  const suggestions = missing.map(aspect => `${topic} ${aspect}`)

  if (findings.length < 10) {
    suggestions.push(`${topic} comprehensive overview`)
    suggestions.push(`${topic} detailed analysis`)
  }

  return {
    score: Math.min(1, score),
    missing,
    suggestions: suggestions.slice(0, 5),
  }
}

/**
 * Perform basic research across sources
 */
export async function research(
  query: string,
  options: ResearchOptions = {}
): Promise<ResearchResult[]> {
  const sources = options.sources || DEFAULT_SOURCES
  const maxResults = options.maxResults || 10
  const localNodes = options.localNodes || []
  const log = options.log

  const results: ResearchResult[] = []

  if (sources.includes('local') && localNodes.length > 0) {
    const local = searchLocalNodes(query, localNodes, Math.ceil(maxResults / 3))
    results.push(...local)
  }

  if (sources.includes('web')) {
    const web = await searchWebTavily(query, log)
    results.push(...web)
  }

  if (sources.includes('wikipedia')) {
    const wiki = await searchWikipedia(query, Math.ceil(maxResults / 3), log)
    results.push(...wiki)
  }

  return results.slice(0, maxResults)
}

/**
 * Deep research with multiple iterative rounds and cross-validation
 */
export async function deepResearch(
  topic: string,
  options: DeepResearchOptions = {}
): Promise<DeepResearchResult> {
  const depth = options.depth || 'moderate'
  const config = DEPTH_CONFIG[depth]
  const localNodes = options.localNodes || []
  const shouldValidate = options.validateClaims !== false
  const aspects = options.aspects || []
  const log = options.log || console.log

  const allResults: ResearchResult[] = []
  const findings: ResearchFinding[] = []
  const concepts = new Set<string>()
  const queriesUsed = new Set<string>()
  const wikiArticlesFetched = new Set<string>()

  log(`[Deep Research] Starting: "${topic}" (depth: ${depth})`)
  log(`[Deep Research] Config: ${config.rounds} rounds, ${config.searchesPerRound} searches/round, ${config.wikiArticles} wiki articles`)

  // === ROUND 1: Initial broad searches ===
  log(`\n[Round 1] Initial research...`)

  // Primary topic search
  queriesUsed.add(topic.toLowerCase())
  const primaryResults = await research(topic, {
    sources: ['web', 'wikipedia', 'local'],
    maxResults: 8,
    localNodes,
    log,
  })
  allResults.push(...primaryResults)

  // Extract initial concepts
  const initialText = primaryResults.map(r => `${r.title} ${r.content}`).join(' ')
  for (const c of extractConcepts(initialText)) {
    concepts.add(c)
  }

  log(`[Round 1] Found ${primaryResults.length} results, extracted ${concepts.size} concepts`)

  // Fetch Wikipedia articles for key topics from initial results
  const wikiTitles = primaryResults
    .filter(r => r.source === 'wikipedia')
    .slice(0, Math.ceil(config.wikiArticles / 2))
    .map(r => r.title)

  for (const title of wikiTitles) {
    if (wikiArticlesFetched.has(title)) continue
    wikiArticlesFetched.add(title)

    const content = await fetchWikipediaArticle(title, log)
    if (content) {
      allResults.push({
        source: 'wikipedia',
        title: `${title} (full article)`,
        content: content.slice(0, 3000),
        url: `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`,
      })

      // Extract more concepts from full article
      for (const c of extractConcepts(content)) {
        concepts.add(c)
      }
    }
  }

  // === SUBSEQUENT ROUNDS: Follow-up queries ===
  for (let round = 2; round <= config.rounds; round++) {
    log(`\n[Round ${round}] Follow-up research...`)

    // Generate follow-up queries
    const followUps = generateFollowUpQueries(
      topic,
      Array.from(concepts),
      aspects,
      queriesUsed
    ).slice(0, config.followUps)

    let searchesThisRound = 0

    for (const query of followUps) {
      if (searchesThisRound >= config.searchesPerRound) break

      queriesUsed.add(query.toLowerCase())

      // Web search
      const webResults = await searchWebTavily(query, log)
      allResults.push(...webResults)
      searchesThisRound++

      // Wikipedia search every other query
      if (searchesThisRound % 2 === 0) {
        const wikiResults = await searchWikipedia(query, 3, log)
        allResults.push(...wikiResults)

        // Fetch full article for top result
        if (wikiResults.length > 0 && wikiArticlesFetched.size < config.wikiArticles) {
          const title = wikiResults[0].title
          if (!wikiArticlesFetched.has(title)) {
            wikiArticlesFetched.add(title)
            const content = await fetchWikipediaArticle(title, log)
            if (content) {
              allResults.push({
                source: 'wikipedia',
                title: `${title} (full article)`,
                content: content.slice(0, 3000),
                url: `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`,
              })

              for (const c of extractConcepts(content)) {
                concepts.add(c)
              }
            }
          }
        }
      }

      // Extract concepts from new results
      const newText = webResults.map(r => `${r.title} ${r.content}`).join(' ')
      for (const c of extractConcepts(newText)) {
        concepts.add(c)
      }
    }

    log(`[Round ${round}] Performed ${searchesThisRound} searches, now have ${allResults.length} total results`)
  }

  // === CREATE FINDINGS ===
  log(`\n[Processing] Creating findings from ${allResults.length} results...`)

  const seenClaims = new Set<string>()

  for (const result of allResults) {
    const claimKey = result.title.toLowerCase().slice(0, 50)
    if (seenClaims.has(claimKey)) continue
    seenClaims.add(claimKey)

    const finding: ResearchFinding = {
      claim: result.title,
      sources: [{
        source: result.source,
        excerpt: result.content.slice(0, 300),
        url: result.url,
      }],
      confidence: 'medium',
      validated: false,
    }

    // Add sources from other results with similar titles
    for (const other of allResults) {
      if (other === result) continue
      const otherKey = other.title.toLowerCase().slice(0, 50)
      if (otherKey.includes(claimKey) || claimKey.includes(otherKey)) {
        finding.sources.push({
          source: other.source,
          excerpt: other.content.slice(0, 200),
          url: other.url,
        })
      }
    }

    // Set confidence based on source diversity
    const uniqueSourceTypes = new Set(finding.sources.map(s => s.source))
    if (uniqueSourceTypes.size >= 3) {
      finding.confidence = 'high'
    } else if (uniqueSourceTypes.size === 1) {
      finding.confidence = 'low'
    }

    findings.push(finding)
  }

  // === VALIDATION ===
  if (shouldValidate && findings.length > 0) {
    log(`\n[Validation] Cross-validating top findings...`)

    const toValidate = findings
      .filter(f => f.confidence !== 'high')
      .slice(0, 5)

    for (const finding of toValidate) {
      const validation = await validateClaim(finding.claim, localNodes, log)
      finding.validated = validation.validated
      if (validation.validated && validation.confidence === 'high') {
        finding.confidence = 'high'
      }
    }
  }

  // === COMPLETENESS ASSESSMENT ===
  const completeness = assessCompleteness(topic, findings, aspects)

  log(`\n[Complete] ${findings.length} findings, ${Math.round(completeness.score * 100)}% coverage`)

  // Generate summary
  const highConfidence = findings.filter(f => f.confidence === 'high').length
  const validated = findings.filter(f => f.validated).length
  const summary = `Deep research on "${topic}" completed with ${config.rounds} rounds of queries. ` +
    `Found ${findings.length} unique findings from ${allResults.length} sources. ` +
    `${highConfidence} findings have high confidence, ${validated} were cross-validated. ` +
    `Coverage: ${Math.round(completeness.score * 100)}%.`

  return {
    topic,
    summary,
    findings,
    concepts: Array.from(concepts),
    sources: allResults,
    completenessScore: completeness.score,
    suggestedFollowUps: completeness.suggestions,
    queriesPerformed: Array.from(queriesUsed),
  }
}

/**
 * Format research results for display
 */
export function formatResearchResults(results: ResearchResult[]): string {
  if (results.length === 0) return 'No results found.'

  const bySource = new Map<string, ResearchResult[]>()
  for (const r of results) {
    if (!bySource.has(r.source)) bySource.set(r.source, [])
    bySource.get(r.source)!.push(r)
  }

  const sections: string[] = []

  for (const [source, sourceResults] of bySource) {
    const header = source === 'local' ? 'Local Nodes' :
                   source === 'web' ? 'Web Results' :
                   source === 'wikipedia' ? 'Wikipedia' : source

    const items = sourceResults.map((r, i) => {
      const ref = r.nodeId ? `[node:${r.nodeId}]` : r.url ? `[${r.url}]` : ''
      return `${i + 1}. **${r.title}** ${ref}\n   ${r.content.slice(0, 300)}...`
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

  sections.push(`# Deep Research: ${result.topic}\n`)
  sections.push(result.summary)
  sections.push('')

  // Stats
  sections.push(`**Queries performed:** ${result.queriesPerformed.length}`)
  sections.push(`**Total sources:** ${result.sources.length}`)
  sections.push(`**Unique findings:** ${result.findings.length}`)
  sections.push('')

  // Key findings (top 20)
  sections.push('## Key Findings\n')
  for (const finding of result.findings.slice(0, 20)) {
    const conf = finding.confidence === 'high' ? '[HIGH]' :
                 finding.confidence === 'medium' ? '[MED]' : '[LOW]'
    const val = finding.validated ? ' (validated)' : ''
    const sources = finding.sources.map(s => s.source).join(', ')
    sections.push(`- **${finding.claim}** ${conf}${val}`)
    sections.push(`  Sources: ${sources}`)
  }

  // Concepts
  if (result.concepts.length > 0) {
    sections.push('\n## Key Concepts Discovered\n')
    sections.push(result.concepts.slice(0, 20).join(', '))
  }

  // Completeness
  sections.push(`\n## Research Completeness: ${Math.round(result.completenessScore * 100)}%`)

  if (result.suggestedFollowUps.length > 0 && result.completenessScore < 0.9) {
    sections.push('\n## Suggested Follow-up Research')
    for (const suggestion of result.suggestedFollowUps) {
      sections.push(`- ${suggestion}`)
    }
  }

  // Queries used
  sections.push('\n## Queries Performed')
  for (const q of result.queriesPerformed.slice(0, 15)) {
    sections.push(`- ${q}`)
  }

  return sections.join('\n')
}

/**
 * Quick search - simple formatted string result
 */
export async function quickResearch(
  query: string,
  localNodes: Node[] = [],
  sources: Array<'local' | 'web' | 'wikipedia'> = DEFAULT_SOURCES
): Promise<string> {
  const results = await research(query, { localNodes, sources, maxResults: 8 })
  return formatResearchResults(results)
}
