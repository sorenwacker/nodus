/**
 * Knowledge Base Builder Tools
 *
 * Iterative research with supervisor pattern:
 * - Phases: timeline, events, people, concepts, connections
 * - Supervisor checks completeness after each phase
 * - Automatically pushes for more if incomplete
 * - User checkpoints at milestones
 */

import { defineTool } from '../registry'
import { deepResearch, assessCompleteness, type DeepResearchResult } from '../research'

/** Phase configuration for knowledge base building */
interface PhaseConfig {
  name: string
  description: string
  aspects: string[]
  minNodes: number
  searchDepth: 'quick' | 'moderate' | 'thorough'
}

/** Default phases for historical topics */
const HISTORICAL_PHASES: PhaseConfig[] = [
  {
    name: 'timeline',
    description: 'Key dates and periods',
    aspects: ['timeline', 'chronology', 'periods', 'eras'],
    minNodes: 10,
    searchDepth: 'moderate',
  },
  {
    name: 'events',
    description: 'Major events and turning points',
    aspects: ['major events', 'battles', 'treaties', 'discoveries'],
    minNodes: 15,
    searchDepth: 'thorough',
  },
  {
    name: 'people',
    description: 'Key figures and leaders',
    aspects: ['key figures', 'leaders', 'rulers', 'influential people'],
    minNodes: 10,
    searchDepth: 'moderate',
  },
  {
    name: 'concepts',
    description: 'Ideas, institutions, and systems',
    aspects: ['institutions', 'systems', 'culture', 'society', 'economy'],
    minNodes: 10,
    searchDepth: 'moderate',
  },
  {
    name: 'connections',
    description: 'Relationships and causation',
    aspects: ['causes', 'effects', 'relationships', 'influences'],
    minNodes: 5,
    searchDepth: 'quick',
  },
]

/** Supervisor evaluation result */
interface SupervisorEvaluation {
  phase: string
  findingsCount: number
  coverageScore: number
  isComplete: boolean
  missingAspects: string[]
  recommendation: 'continue' | 'expand'
  message: string
}

/**
 * Evaluate phase completion.
 *
 * deepResearch only gathers findings; node creation happens later when the
 * agent processes the returned markers. The phase must therefore be judged on
 * the research output itself - a store-delta check would always read zero and
 * loop the first phase forever.
 */
function evaluatePhase(
  phase: PhaseConfig,
  researchResult?: DeepResearchResult
): SupervisorEvaluation {
  const findingsCount = researchResult?.findings?.length ?? 0
  const coverageScore = researchResult?.completenessScore ?? 0

  const hasEnoughFindings = findingsCount >= phase.minNodes
  const hasGoodCoverage = coverageScore >= 0.6

  const missingAspects = researchResult?.suggestedFollowUps?.slice(0, 3) ?? []

  let recommendation: SupervisorEvaluation['recommendation'] = 'continue'
  let message = ''

  if (!hasEnoughFindings) {
    recommendation = 'expand'
    message = `Phase "${phase.name}" incomplete: only ${findingsCount}/${phase.minNodes} findings. Need more research.`
  } else if (!hasGoodCoverage && missingAspects.length > 0) {
    recommendation = 'expand'
    message = `Phase "${phase.name}" coverage is ${Math.round(coverageScore * 100)}%. Missing: ${missingAspects.join(', ')}`
  } else {
    recommendation = 'continue'
    message = `Phase "${phase.name}" complete: ${findingsCount} findings, ${Math.round(coverageScore * 100)}% coverage.`
  }

  return {
    phase: phase.name,
    findingsCount,
    coverageScore,
    isComplete: recommendation === 'continue',
    missingAspects,
    recommendation,
    message,
  }
}

/**
 * Register knowledge base building tools
 */
export function registerKnowledgeBaseTools(): void {
  // Main knowledge base builder
  defineTool<{
    topic: string
    scope?: string
    target_nodes?: number
    phases?: string[]
  }>(
    'build_knowledge_base',
    'Build a comprehensive knowledge graph about a topic. Runs multiple research phases with supervisor checks. Use for "create a knowledge base about X" requests.',
    {
      type: 'object',
      properties: {
        topic: {
          type: 'string',
          description: 'Main topic (e.g., "Middle Ages", "French Revolution")',
        },
        scope: {
          type: 'string',
          description: 'Scope constraints (e.g., "Europe only", "1000-1300 CE", "focus on politics")',
        },
        target_nodes: {
          type: 'number',
          description: 'Target number of nodes (default: 50)',
        },
        phases: {
          type: 'array',
          items: { type: 'string' },
          description: 'Custom phases to run (default: timeline, events, people, concepts, connections)',
        },
      },
      required: ['topic'],
    },
    async (args, ctx) => {
      const topic = args.topic
      const scope = args.scope || ''
      const targetNodes = args.target_nodes || 50
      const requestedPhases = args.phases || ['timeline', 'events', 'people', 'concepts', 'connections']

      // Filter to requested phases
      const phases = HISTORICAL_PHASES.filter(p => requestedPhases.includes(p.name))
      if (phases.length === 0) {
        return 'Error: No valid phases specified. Available: timeline, events, people, concepts, connections'
      }

      const fullTopic = scope ? `${topic} (${scope})` : topic

      ctx.log(`\n=== KNOWLEDGE BASE BUILDER ===`)
      ctx.log(`Topic: ${fullTopic}`)
      ctx.log(`Target: ${targetNodes} nodes`)
      ctx.log(`Phases: ${phases.map(p => p.name).join(', ')}`)
      ctx.log(`==============================\n`)

      const phaseResults: SupervisorEvaluation[] = []
      let totalResearchResult: DeepResearchResult | undefined

      // Run each phase
      for (let i = 0; i < phases.length; i++) {
        const phase = phases[i]

        ctx.log(`\n[Phase ${i + 1}/${phases.length}] ${phase.name.toUpperCase()}: ${phase.description}`)

        // Build phase-specific query
        const phaseQuery = `${fullTopic} - ${phase.aspects.join(', ')}`

        // Run deep research for this phase
        try {
          const result = await deepResearch(phaseQuery, {
            depth: phase.searchDepth,
            localNodes: ctx.store.filteredNodes,
            aspects: phase.aspects,
            log: ctx.log,
          })

          totalResearchResult = result

          const evaluation = evaluatePhase(phase, result)
          phaseResults.push(evaluation)

          ctx.log(`[Supervisor] ${evaluation.message}`)

          // If phase incomplete, return marker for agent to continue
          if (!evaluation.isComplete) {
            const instruction = `Research more about: ${evaluation.missingAspects.join(', ')}`

            return `__KB_PHASE_INCOMPLETE__:${JSON.stringify({
              phase: phase.name,
              evaluation,
              instruction,
              findings: result.findings.slice(0, 10),
              concepts: result.concepts.slice(0, 20),
            })}`
          }
        } catch (e) {
          ctx.log(`[Phase ${phase.name}] Error: ${e}`)
          // Continue to next phase on error
        }

        // Check if we've hit target
        if (ctx.store.filteredNodes.length >= targetNodes) {
          ctx.log(`\n[Supervisor] Target reached: ${ctx.store.filteredNodes.length}/${targetNodes} nodes`)
          break
        }
      }

      // Final evaluation
      const totalNodes = ctx.store.filteredNodes.length
      const totalEdges = ctx.store.filteredEdges.length
      const edgeRatio = totalNodes > 0 ? totalEdges / totalNodes : 0

      ctx.log(`\n=== KNOWLEDGE BASE COMPLETE ===`)
      ctx.log(`Total nodes: ${totalNodes}`)
      ctx.log(`Total edges: ${totalEdges}`)
      ctx.log(`Edge ratio: ${edgeRatio.toFixed(2)}`)
      ctx.log(`================================\n`)

      // Return summary with findings for agent to create nodes
      return `__KB_BUILD_COMPLETE__:${JSON.stringify({
        topic: fullTopic,
        totalNodes,
        totalEdges,
        phases: phaseResults,
        findings: totalResearchResult?.findings?.slice(0, 30) || [],
        concepts: totalResearchResult?.concepts || [],
        suggestedFollowUps: totalResearchResult?.suggestedFollowUps || [],
      })}`
    },
    { category: 'research' }
  )

  // Supervisor check tool - agent can call to get feedback
  defineTool<{ topic?: string }>(
    'check_progress',
    'Ask the supervisor to evaluate current knowledge graph progress. Returns recommendations.',
    {
      type: 'object',
      properties: {
        topic: { type: 'string', description: 'Topic being researched (for context)' },
      },
      required: [],
    },
    async (args, ctx) => {
      const nodes = ctx.store.filteredNodes
      const edges = ctx.store.filteredEdges
      const topic = args.topic || 'current topic'

      // Analyze graph structure
      const nodeCount = nodes.length
      const edgeCount = edges.length
      const edgeRatio = nodeCount > 0 ? edgeCount / nodeCount : 0

      // Find disconnected nodes
      const connectedIds = new Set<string>()
      for (const e of edges) {
        connectedIds.add(e.source_node_id)
        connectedIds.add(e.target_node_id)
      }
      const disconnectedNodes = nodes.filter(n => !connectedIds.has(n.id))
      const disconnectedCount = disconnectedNodes.length

      // Assess completeness based on title coverage
      const findings = nodes.map(n => ({
        claim: n.title,
        sources: [],
        confidence: 'medium' as const,
        validated: false,
      }))
      const assessment = assessCompleteness(topic, findings, [])

      // Build recommendation
      const issues: string[] = []
      const actions: string[] = []

      if (nodeCount < 10) {
        issues.push(`Only ${nodeCount} nodes - need more content`)
        actions.push('Use research_topic or create_nodes_batch to add more nodes')
      }

      if (edgeRatio < 0.5) {
        issues.push(`Low edge ratio (${edgeRatio.toFixed(2)}) - graph is sparse`)
        actions.push('Use create_edges_batch to connect related nodes')
      }

      if (disconnectedCount > 3) {
        issues.push(`${disconnectedCount} disconnected nodes`)
        actions.push(`Connect these orphans: ${disconnectedNodes.slice(0, 5).map(n => `"${n.title}"`).join(', ')}`)
      }

      if (assessment.score < 0.6) {
        issues.push(`Coverage score: ${Math.round(assessment.score * 100)}%`)
        if (assessment.suggestions.length > 0) {
          actions.push(`Research these aspects: ${assessment.suggestions.slice(0, 3).join(', ')}`)
        }
      }

      const isComplete = issues.length === 0

      return JSON.stringify({
        status: isComplete ? 'COMPLETE' : 'INCOMPLETE',
        nodeCount,
        edgeCount,
        edgeRatio: edgeRatio.toFixed(2),
        disconnectedCount,
        coverageScore: Math.round(assessment.score * 100),
        issues,
        actions,
        verdict: isComplete
          ? `Knowledge graph looks good! ${nodeCount} nodes, ${edgeCount} edges, well-connected.`
          : `Knowledge graph needs work. Priority: ${actions[0] || 'Continue research'}`,
      }, null, 2)
    },
    { category: 'research' }
  )

  // Continue research tool - for iterative expansion
  defineTool<{ aspect: string; depth?: string }>(
    'expand_aspect',
    'Expand the knowledge graph by researching a specific aspect. Use after check_progress identifies gaps.',
    {
      type: 'object',
      properties: {
        aspect: { type: 'string', description: 'Aspect to research (e.g., "military campaigns", "economic systems")' },
        depth: { type: 'string', description: 'Research depth: quick, moderate, thorough (default: moderate)' },
      },
      required: ['aspect'],
    },
    async (args, ctx) => {
      const aspect = args.aspect
      const depth = (args.depth as 'quick' | 'moderate' | 'thorough') || 'moderate'

      ctx.log(`\n[Expand] Researching aspect: ${aspect} (depth: ${depth})`)

      try {
        const result = await deepResearch(aspect, {
          depth,
          localNodes: ctx.store.filteredNodes,
          aspects: [aspect],
          log: ctx.log,
        })

        ctx.log(`[Expand] Found ${result.findings.length} findings, ${result.concepts.length} concepts`)

        return `__EXPAND_ASPECT__:${JSON.stringify({
          aspect,
          findings: result.findings.slice(0, 20),
          concepts: result.concepts.slice(0, 15),
          suggestedFollowUps: result.suggestedFollowUps,
          coverageScore: Math.round(result.completenessScore * 100),
        })}`
      } catch (e) {
        return `Error researching "${aspect}": ${e}`
      }
    },
    { category: 'research' }
  )
}
