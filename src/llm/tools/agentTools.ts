/**
 * Agent tool registrations (interactive approval flow and research)
 *
 * Handles: create_plan, request_approval, research, deep_research, fetch_wikipedia,
 *          wikipedia_search, validate_claim, check_completeness
 */

import { defineTool } from '../registry'

export function registerAgentTools(): void {
  defineTool<{ title: string; steps: Array<{ description: string; details?: string }> }>(
    'create_plan',
    'Create a detailed plan with steps for user approval. IMPORTANT: Plans for graphs MUST include separate steps for: 1) Creating nodes, 2) Creating edges with labels, 3) Applying layout.',
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
              details: { type: 'string', description: 'Specific details (e.g., "Nodes: Cerebrum, Cerebellum, Brainstem, ...")' },
            },
          },
          description: 'REQUIRED STEPS FOR GRAPHS: 1) Create nodes (list specific nodes), 2) Create edges with labels (specify connections), 3) Apply layout, 4) Done',
        },
      },
      required: ['title', 'steps'],
    },
    async (args, _ctx) => {
      // Return marker for PixiCanvas to handle with plan state
      return `__CREATE_PLAN__:${JSON.stringify(args)}`
    },
    { category: 'agent' }
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
    async (args, _ctx) => {
      // Return marker for PixiCanvas to handle - pauses agent loop
      return `__REQUEST_APPROVAL__:${JSON.stringify(args)}`
    },
    { category: 'agent' }
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
    async (args, _ctx) => {
      // Return marker for PixiCanvas to handle with research module
      return `__RESEARCH__:${JSON.stringify(args)}`
    },
    { category: 'agent' }
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
    async (args, _ctx) => {
      return `__DEEP_RESEARCH__:${JSON.stringify(args)}`
    },
    { category: 'agent' }
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
    async (args, _ctx) => {
      return `__FETCH_WIKIPEDIA__:${JSON.stringify(args)}`
    },
    { category: 'agent' }
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
    async (args, _ctx) => {
      return `__WIKIPEDIA_SEARCH__:${JSON.stringify(args)}`
    },
    { category: 'agent' }
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
    async (args, _ctx) => {
      return `__VALIDATE_CLAIM__:${JSON.stringify(args)}`
    },
    { category: 'agent' }
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
    async (args, _ctx) => {
      return `__CHECK_COMPLETENESS__:${JSON.stringify(args)}`
    },
    { category: 'agent' }
  )
}
