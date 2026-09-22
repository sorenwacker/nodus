/**
 * Approval-flow tools (create_plan, request_approval) and the research tools
 * built on the `search` context service (research, deep_research,
 * fetch_wikipedia, wikipedia_search, validate_claim, check_completeness).
 */

import { defineTool } from '../registry'
import { assessCompleteness } from '../research'

export function registerAgentTools(): void {
  defineTool<{
    title: string
    steps: Array<{ description: string; action: string; targets?: string[]; details?: string }>
  }>(
    'create_plan',
    'Create a detailed plan with steps for user approval. Every step MUST declare its "action" so the user can see what will be created vs edited before approving. IMPORTANT: Plans for graphs MUST include separate steps for: 1) Creating nodes, 2) Creating edges with labels, 3) Applying layout.',
    {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Short title describing the plan goal' },
        steps: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              description: { type: 'string', description: 'Specific action (e.g., "Create 7 nodes for brain regions")' },
              action: {
                type: 'string',
                enum: ['create', 'edit', 'delete', 'connect', 'research', 'other'],
                description: 'Effect on the graph: "create" = new nodes, "edit" = change existing nodes, "delete" = remove, "connect" = edges, "research" = read-only, "other" = layout/color/etc.',
              },
              targets: {
                type: 'array',
                items: { type: 'string' },
                description: 'Titles of the nodes this step creates or edits, when known (e.g., ["Cerebrum", "Cerebellum"])',
              },
              details: { type: 'string', description: 'Specific details (e.g., "Nodes: Cerebrum, Cerebellum, Brainstem, ...")' },
            },
            required: ['description', 'action'],
          },
          description: 'REQUIRED STEPS FOR GRAPHS: 1) Create nodes (action="create", list node titles in targets), 2) Create edges with labels (action="connect"), 3) Apply layout (action="other"), 4) Done',
        },
      },
      required: ['title', 'steps'],
    },
    async (args, ctx) => {
      // The one place a plan is created from a tool call
      // (PRODUCT_DESIGN.md > One creator per plan)
      const steps = Array.isArray(args.steps) ? args.steps : []
      const plan = ctx.plan!.createPlan(args.title || 'Plan', steps)
      ctx.log(`> Plan created: ${plan.title} (${plan.steps.length} steps)`)
      return `Plan "${plan.title}" created with ${plan.steps.length} steps. Call request_approval to ask the user.`
    },
    { modes: ['plan'], mutates: false, requires: ['plan'] }
  )

  defineTool<{ plan_id?: string; message?: string }>(
    'request_approval',
    'Request user approval for the current plan. Agent will pause until user approves, rejects, or modifies.',
    {
      type: 'object',
      properties: {
        plan_id: { type: 'string', description: 'Optional plan ID (defaults to current plan)' },
        message: { type: 'string', description: 'Optional message to show user with approval request' },
      },
      required: [],
    },
    async (_args, ctx) => {
      const plan = ctx.plan!
      if (!plan.currentPlan()) {
        return 'Error: No plan to approve. Call create_plan first.'
      }
      // Requesting approval twice for the same plan opens one dialog
      if (!plan.isApprovalOpen()) {
        plan.requestApproval()
        ctx.log('> Requesting approval...')
      }
      return { text: 'Approval requested. Waiting for the user.', signal: 'await_approval' }
    },
    { modes: ['plan'], mutates: false, requires: ['plan'] }
  )

  defineTool<{ query: string; sources?: string[] }>(
    'research',
    'Research a topic across web and local nodes. Returns results with source attribution.',
    {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
        sources: {
          type: 'array',
          items: { type: 'string' },
          description: 'Sources to search: "local", "web", "wikipedia". Defaults to ["local", "web"]',
        },
      },
      required: ['query'],
    },
    async (args, ctx) => {
      const query = args.query || ''
      const sources = Array.isArray(args.sources)
        ? (args.sources as Array<'local' | 'web' | 'wikipedia'>)
        : (['local', 'web'] as Array<'local' | 'web' | 'wikipedia'>)
      ctx.log(`> Researching: ${query}`)
      try {
        const result = await ctx.search!.quickResearch(query, ctx.store.filteredNodes, sources)
        return result || 'No results found'
      } catch (e) {
        return `Research failed: ${e}`
      }
    },
    { modes: ['explore', 'plan', 'execute'], mutates: false, requires: ['search'] }
  )

  defineTool<{
    topic: string
    depth?: 'quick' | 'moderate' | 'thorough' | 'exhaustive'
    aspects?: string[]
  }>(
    'deep_research',
    'Perform deep, iterative research with cross-validation. Use for comprehensive research that needs multiple rounds of queries, Wikipedia article fetching, and source validation. Returns findings with confidence levels.',
    {
      type: 'object',
      properties: {
        topic: { type: 'string', description: 'Main research topic' },
        depth: {
          type: 'string',
          description: 'Research depth: "quick" (1 round), "moderate" (2 rounds), "thorough" (3 rounds), "exhaustive" (5 rounds). Default: moderate',
        },
        aspects: {
          type: 'array',
          items: { type: 'string' },
          description: 'Specific aspects to investigate (e.g., ["anatomy", "function", "disorders"])',
        },
      },
      required: ['topic'],
    },
    async (args, ctx) => {
      const topic = args.topic || ''
      const depth = args.depth || 'thorough'
      ctx.log(`> Deep research: ${topic} (depth: ${depth})`)
      try {
        const search = ctx.search!
        const result = await search.deepResearch(topic, {
          depth,
          localNodes: ctx.store.filteredNodes,
          validateClaims: true,
          extractConcepts: true,
          aspects: args.aspects || [],
          log: ctx.log,
        })
        ctx.log(
          `> Research complete: ${result.findings.length} findings, ${Math.round(result.completenessScore * 100)}% coverage`
        )
        return search.formatDeepResearchResults(result)
      } catch (e) {
        return `Deep research failed: ${e}`
      }
    },
    { modes: ['explore', 'plan', 'execute'], mutates: false, requires: ['search'] }
  )

  defineTool<{ title: string }>(
    'fetch_wikipedia',
    'Fetch full Wikipedia article content for a topic. Use to get detailed information on a specific subject.',
    {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Wikipedia article title (e.g., "Cerebral cortex")' },
      },
      required: ['title'],
    },
    async (args, ctx) => {
      const title = args.title || ''
      try {
        const content = await ctx.search!.fetchWikipediaArticle(title, ctx.log)
        if (!content) return `Wikipedia article "${title}" not found`
        ctx.log(`> Wikipedia: Got ${content.length} chars for "${title}"`)
        return `# Wikipedia: ${title}\n\n${content}`
      } catch (e) {
        return `Wikipedia fetch failed: ${e}`
      }
    },
    { modes: ['explore', 'plan', 'execute', 'node'], mutates: false, requires: ['search'] }
  )

  defineTool<{ query: string; limit?: number }>(
    'wikipedia_search',
    'Search Wikipedia for articles matching a query. Returns list of matching articles with snippets. Use this to discover relevant Wikipedia articles before fetching full content.',
    {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
        limit: { type: 'number', description: 'Max results (default: 5)' },
      },
      required: ['query'],
    },
    async (args, ctx) => {
      const query = args.query || ''
      ctx.log(`> Wikipedia search: "${query}"`)
      try {
        const found = await ctx.search!.searchWikipedia(query, args.limit || 5)
        ctx.log(`> Found ${found.length} Wikipedia articles`)
        if (found.length === 0) return `No Wikipedia articles found for "${query}"`
        const results = found.map(r => `**${r.title}**\n${r.content}\n[${r.url}]`)
        return `## Wikipedia Search: "${query}"\n\n${results.join('\n\n')}`
      } catch (e) {
        return `Wikipedia search failed: ${e}`
      }
    },
    { modes: ['explore', 'plan', 'execute', 'node'], mutates: false, requires: ['search'] }
  )

  defineTool<{ claim: string }>(
    'validate_claim',
    'Cross-validate a specific claim or fact across multiple sources. Returns confidence level and supporting sources.',
    {
      type: 'object',
      properties: {
        claim: { type: 'string', description: 'The claim or fact to validate' },
      },
      required: ['claim'],
    },
    async (args, ctx) => {
      const claim = args.claim || ''
      ctx.log(`> Validating: ${claim.slice(0, 50)}...`)
      try {
        const v = await ctx.search!.validateClaim(claim, ctx.store.filteredNodes)
        return `Claim: "${claim}"\nValidated: ${v.validated ? 'YES' : 'NO'}\nConfidence: ${v.confidence}\nSources: ${v.sources.join(', ') || 'none'}`
      } catch (e) {
        return `Validation failed: ${e}`
      }
    },
    { modes: ['explore', 'plan', 'execute'], mutates: false, requires: ['search'] }
  )

  defineTool<{ topic: string; findings: string[] }>(
    'check_completeness',
    'Assess if research on a topic is complete. Returns coverage score and suggests follow-up queries if gaps exist.',
    {
      type: 'object',
      properties: {
        topic: { type: 'string', description: 'The research topic' },
        findings: {
          type: 'array',
          items: { type: 'string' },
          description: 'List of findings/claims already discovered',
        },
      },
      required: ['topic', 'findings'],
    },
    async (args, ctx) => {
      const topic = args.topic || ''
      const findings = Array.isArray(args.findings) ? args.findings : []
      ctx.log(`> Checking completeness: ${topic}`)

      const assessment = assessCompleteness(
        topic,
        findings.map(f => ({ claim: f, sources: [], confidence: 'medium' as const, validated: false })),
        []
      )
      const response = [
        `Topic: ${topic}`,
        `Coverage Score: ${Math.round(assessment.score * 100)}%`,
        `Findings Analyzed: ${findings.length}`,
        '',
        assessment.score >= 0.8 ? 'Research appears COMPLETE.' : 'Research may be INCOMPLETE.',
      ]
      if (assessment.suggestions.length > 0) {
        response.push('', 'Suggested follow-up queries:')
        for (const s of assessment.suggestions) response.push(`- ${s}`)
      }
      return response.join('\n')
    },
    { modes: ['explore', 'plan', 'execute'], mutates: false }
  )
}
