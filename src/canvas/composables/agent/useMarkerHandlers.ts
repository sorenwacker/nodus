/**
 * Marker Handlers Composable
 *
 * Handles async marker processing after executeTool() returns.
 * Markers are special prefixes in tool results that trigger additional actions.
 */

import type { Ref } from 'vue'
import type { Node } from '../../../types'
import type { AgentPlan } from '../../../llm/types'
import { stripHtmlTags } from '../../../lib/sanitize'
import {
  quickResearch,
  deepResearch,
  formatDeepResearchResults,
  fetchWikipediaArticle,
  validateClaim,
  assessCompleteness,
} from '../../../llm/research'

/**
 * Plan state interface (subset of usePlanState return type)
 */
export interface PlanStateInterface {
  currentPlan: Ref<AgentPlan | null>
  showApprovalModal: Ref<boolean>
  createPlan: (title: string, steps: Array<{ description: string; details?: string }>) => AgentPlan
  requestApproval: () => boolean
}

/**
 * Context for marker handlers
 */
export interface MarkerHandlerContext {
  planState: PlanStateInterface
  nodes: Ref<Node[]>
  log: (msg: string) => void
}

/**
 * Marker handler composable
 */
export function useMarkerHandlers(ctx: MarkerHandlerContext) {
  const { planState, nodes, log } = ctx

  /**
   * Handle markers in tool results
   * Returns processed result or null if no marker found
   */
  async function handleMarker(result: string): Promise<string | null> {
    // Plan creation marker
    if (result.startsWith('__CREATE_PLAN__:')) {
      try {
        const data = JSON.parse(result.replace('__CREATE_PLAN__:', ''))
        const plan = planState.createPlan(data.title || 'Plan', data.steps || [])
        log(`> Plan created: ${plan.title} (${plan.steps.length} steps)`)
      } catch (e) {
        console.error('[MarkerHandlers] Failed to parse create_plan:', e)
      }
      return result
    }

    // Approval request marker
    if (result.startsWith('__REQUEST_APPROVAL__:')) {
      if (planState.currentPlan.value) {
        planState.requestApproval()
        log('> Requesting approval...')
      }
      return result
    }

    // Research marker
    if (result.startsWith('__RESEARCH__:')) {
      try {
        const data = JSON.parse(result.replace('__RESEARCH__:', ''))
        const query = data.query || ''
        const sources = Array.isArray(data.sources)
          ? (data.sources as Array<'local' | 'web' | 'wikipedia'>)
          : (['local', 'web'] as Array<'local' | 'web' | 'wikipedia'>)

        log(`> Researching: ${query}`)
        const researchResult = await quickResearch(query, nodes.value, sources)
        return researchResult || 'No results found'
      } catch (e) {
        console.error('[MarkerHandlers] Research error:', e)
        return `Research failed: ${e}`
      }
    }

    // Deep research marker
    if (result.startsWith('__DEEP_RESEARCH__:')) {
      try {
        const data = JSON.parse(result.replace('__DEEP_RESEARCH__:', ''))
        const topic = data.topic || ''
        const depth = data.depth || 'thorough'
        const aspects = data.aspects || []

        log(`> Deep research: ${topic} (depth: ${depth})`)

        const deepResult = await deepResearch(topic, {
          depth: depth as 'quick' | 'moderate' | 'thorough' | 'exhaustive',
          localNodes: nodes.value,
          validateClaims: true,
          extractConcepts: true,
          aspects,
          log: (msg: string) => log(msg),
        })

        log(
          `> Research complete: ${deepResult.findings.length} findings, ${Math.round(deepResult.completenessScore * 100)}% coverage`
        )

        return formatDeepResearchResults(deepResult)
      } catch (e) {
        console.error('[MarkerHandlers] Deep research error:', e)
        return `Deep research failed: ${e}`
      }
    }

    // Wikipedia search marker
    if (result.startsWith('__WIKIPEDIA_SEARCH__:')) {
      try {
        const data = JSON.parse(result.replace('__WIKIPEDIA_SEARCH__:', ''))
        const query = data.query || ''
        const limit = data.limit || 5

        log(`> Wikipedia search: "${query}"`)

        const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&origin=*&srlimit=${limit}`
        const resp = await fetch(searchUrl, { signal: AbortSignal.timeout(10000) })

        if (!resp.ok) {
          return `Wikipedia search failed: ${resp.status}`
        }

        const respData = await resp.json()
        const results: string[] = []

        if (respData.query?.search) {
          for (const item of respData.query.search) {
            const cleanSnippet = stripHtmlTags(item.snippet)
            const url = `https://en.wikipedia.org/wiki/${encodeURIComponent(item.title.replace(/ /g, '_'))}`
            results.push(`**${item.title}**\n${cleanSnippet}\n[${url}]`)
          }
        }

        log(`> Found ${results.length} Wikipedia articles`)

        if (results.length === 0) {
          return `No Wikipedia articles found for "${query}"`
        }

        return `## Wikipedia Search: "${query}"\n\n${results.join('\n\n')}`
      } catch (e) {
        console.error('[MarkerHandlers] Wikipedia search error:', e)
        return `Wikipedia search failed: ${e}`
      }
    }

    // Wikipedia article fetch marker
    if (result.startsWith('__FETCH_WIKIPEDIA__:')) {
      try {
        const data = JSON.parse(result.replace('__FETCH_WIKIPEDIA__:', ''))
        const title = data.title || ''

        const content = await fetchWikipediaArticle(title, (msg) => log(msg))
        if (content) {
          log(`> Wikipedia: Got ${content.length} chars for "${title}"`)
          return `# Wikipedia: ${title}\n\n${content}`
        }
        return `Wikipedia article "${title}" not found`
      } catch (e) {
        console.error('[MarkerHandlers] Wikipedia fetch error:', e)
        return `Wikipedia fetch failed: ${e}`
      }
    }

    // Claim validation marker
    if (result.startsWith('__VALIDATE_CLAIM__:')) {
      try {
        const data = JSON.parse(result.replace('__VALIDATE_CLAIM__:', ''))
        const claim = data.claim || ''

        log(`> Validating: ${claim.slice(0, 50)}...`)

        const validation = await validateClaim(claim, nodes.value)

        return `Claim: "${claim}"\nValidated: ${validation.validated ? 'YES' : 'NO'}\nConfidence: ${validation.confidence}\nSources: ${validation.sources.join(', ') || 'none'}`
      } catch (e) {
        console.error('[MarkerHandlers] Validation error:', e)
        return `Validation failed: ${e}`
      }
    }

    // Completeness check marker
    if (result.startsWith('__CHECK_COMPLETENESS__:')) {
      try {
        const data = JSON.parse(result.replace('__CHECK_COMPLETENESS__:', ''))
        const topic = data.topic || ''
        const findings = data.findings || []

        log(`> Checking completeness: ${topic}`)

        // Convert findings to the format expected
        const findingsForAssess = findings.map((f: string) => ({
          claim: f,
          sources: [],
          confidence: 'medium' as const,
          validated: false,
        }))

        const assessment = assessCompleteness(topic, findingsForAssess, [])

        const response = [
          `Topic: ${topic}`,
          `Coverage Score: ${Math.round(assessment.score * 100)}%`,
          `Findings Analyzed: ${findings.length}`,
          '',
          assessment.score >= 0.8 ? 'Research appears COMPLETE.' : 'Research may be INCOMPLETE.',
        ]

        if (assessment.suggestions.length > 0) {
          response.push('', 'Suggested follow-up queries:')
          for (const s of assessment.suggestions) {
            response.push(`- ${s}`)
          }
        }

        return response.join('\n')
      } catch (e) {
        console.error('[MarkerHandlers] Completeness check error:', e)
        return `Completeness check failed: ${e}`
      }
    }

    // No marker found
    return null
  }

  return {
    handleMarker,
  }
}

export type UseMarkerHandlersReturn = ReturnType<typeof useMarkerHandlers>
