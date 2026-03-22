/**
 * Planning and thinking tool registrations
 *
 * Handles: think, plan, update_task, remember, done, web_search
 */

import { defineTool } from '../registry'

export function registerPlanningTools(): void {
  defineTool<{ thought: string }>(
    'think',
    'Express your reasoning or thinking process. Use this to plan before acting.',
    {
      type: 'object',
      properties: {
        thought: { type: 'string', description: 'Your thought or reasoning' },
      },
      required: ['thought'],
    },
    async (args, ctx) => {
      ctx.log(`[think] ${args.thought}`)
      return 'Thought recorded'
    },
    { category: 'planning' }
  )

  defineTool<{ tasks: string[] }>(
    'plan',
    'Create a task list for a complex operation. Each task will be shown in the log.',
    {
      type: 'object',
      properties: {
        tasks: {
          type: 'array',
          items: { type: 'string' },
          description: 'List of task descriptions'
        },
      },
      required: ['tasks'],
    },
    async (_args, _ctx) => {
      // Return unhandled so PixiCanvas.vue handles it with task state
      return `__UNHANDLED__:plan`
    },
    { category: 'planning' }
  )

  defineTool<{ task_index: number; status: string }>(
    'update_task',
    'Update the status of a task in the current plan.',
    {
      type: 'object',
      properties: {
        task_index: { type: 'number', description: 'Task index (0-based)' },
        status: { type: 'string', description: 'New status: "done", "in_progress", "failed", or custom text' },
      },
      required: ['task_index', 'status'],
    },
    async (_args, _ctx) => {
      // Return unhandled so PixiCanvas.vue handles it with task state
      return `__UNHANDLED__:update_task`
    },
    { category: 'planning' }
  )

  defineTool<{ message: string }>(
    'remember',
    'Store important information for future reference in this conversation.',
    {
      type: 'object',
      properties: {
        message: { type: 'string', description: 'Information to remember' },
      },
      required: ['message'],
    },
    async (_args, _ctx) => {
      // Return unhandled so PixiCanvas.vue handles it with memory state
      return `__UNHANDLED__:remember`
    },
    { category: 'planning' }
  )

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
    async (args, _ctx) => {
      return `__WEB_SEARCH__:${args.query}`
    },
    { category: 'utility' }
  )

  defineTool<{ summary: string; force?: boolean }>(
    'done',
    'Signal that the agent has completed all work. For graph tasks, include edges before calling done.',
    {
      type: 'object',
      properties: {
        summary: { type: 'string', description: 'Brief summary of what was accomplished' },
        force: { type: 'boolean', description: 'Set to true to complete without edges (for non-graph tasks)' },
      },
      required: ['summary'],
    },
    async (args, ctx) => {
      const nodes = ctx.store.filteredNodes
      const edges = ctx.store.filteredEdges

      // Only warn about missing edges if not forced and we have many nodes
      // This catches graph-creation tasks while allowing simple node creation
      if (!args.force && nodes.length > 3 && edges.length === 0) {
        return `NOTE: Graph has ${nodes.length} nodes but no edges. If this is a mindmap/hierarchy, use create_edges_batch to connect them. If standalone nodes are intended, call done(summary, force=true).`
      }

      return `AGENT_DONE: ${args.summary || 'completed'} (${nodes.length} nodes, ${edges.length} edges)`
    },
    { category: 'utility' }
  )
}
