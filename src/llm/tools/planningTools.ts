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
    async (_args, _ctx) => {
      return `__UNHANDLED__:web_search`
    },
    { category: 'utility' }
  )

  defineTool<{ summary: string; force?: boolean }>(
    'done',
    'Signal completion. BLOCKED if graph has nodes but no edges - you MUST create edges first with create_edges_batch.',
    {
      type: 'object',
      properties: {
        summary: { type: 'string', description: 'Brief summary of what was accomplished' },
        force: { type: 'boolean', description: 'ONLY for non-graph tasks like answering questions. NEVER use for knowledge base or research tasks.' },
      },
      required: ['summary'],
    },
    async (args, ctx) => {
      const nodes = ctx.store.filteredNodes
      const edges = ctx.store.filteredEdges
      const edgeRatio = nodes.length > 0 ? edges.length / nodes.length : 1

      // Find disconnected nodes
      const connectedIds = new Set<string>()
      for (const e of edges) {
        connectedIds.add(e.source_node_id)
        connectedIds.add(e.target_node_id)
      }
      const disconnected = nodes.filter(n => !connectedIds.has(n.id))

      // Skip edge checks if force=true (user explicitly requested action like deleting edges)
      if (!args.force) {
        // BLOCK completion if graph has many nodes but few edges
        if (nodes.length >= 5 && edgeRatio < 0.3) {
          ctx.log(`> BLOCKED: Cannot complete - graph needs edges (${nodes.length} nodes, ${edges.length} edges)`)

          // List disconnected nodes
          const disconnectedList = disconnected.length > 0
            ? `\n\nDISCONNECTED NODES (${disconnected.length}):\n${disconnected.slice(0, 20).map(n => `- "${n.title}"`).join('\n')}${disconnected.length > 20 ? `\n... and ${disconnected.length - 20} more` : ''}`
            : ''

          return `ERROR: Cannot complete. You created ${nodes.length} nodes but only ${edges.length} edges.
${disconnectedList}

Connect these nodes using create_edges_batch:
- Timeline events: "leads to", "followed by", "preceded"
- People to events: "participated in", "caused", "led"
- Concepts: "related to", "part of", "influences"

Example:
create_edges_batch({edges: [
  {from_title: "${disconnected[0]?.title || 'Node A'}", to_title: "${disconnected[1]?.title || 'Node B'}", label: "related to"},
  {from_title: "${disconnected[2]?.title || 'Node C'}", to_title: "${nodes[0]?.title || 'Node D'}", label: "influences"},
  ...
]})

Create at least ${Math.ceil(nodes.length * 0.5)} edges, then call done() again. Use force=true ONLY if user explicitly requested deletion.`
        }

        // Warn about low edge ratio
        if (nodes.length >= 3 && edgeRatio < 0.5) {
          ctx.log(`> Warning: Low edge ratio (${edgeRatio.toFixed(2)})`)
          const disconnectedList = disconnected.length > 0
            ? ` Disconnected: ${disconnected.slice(0, 10).map(n => `"${n.title}"`).join(', ')}${disconnected.length > 10 ? ` (+${disconnected.length - 10} more)` : ''}`
            : ''
          return `WARNING: Graph has ${nodes.length} nodes but only ${edges.length} edges.${disconnectedList} Add connections with create_edges_batch.`
        }
      }

      ctx.log(`> Completed: ${nodes.length} nodes, ${edges.length} edges`)
      return `AGENT_DONE: ${args.summary || 'completed'} (${nodes.length} nodes, ${edges.length} edges)`
    },
    { category: 'utility' }
  )

  // Session memory tools
  defineTool<{ goal: string; steps?: string[] }>(
    'set_goal',
    'Start tracking a new goal. Clears previous session memory.',
    {
      type: 'object',
      properties: {
        goal: { type: 'string', description: 'The goal to accomplish' },
        steps: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional list of planned steps'
        },
      },
      required: ['goal'],
    },
    async (_args, _ctx) => {
      return `__UNHANDLED__:set_goal`
    },
    { category: 'planning' }
  )

  defineTool<{ progress: number; completed_action?: string }>(
    'update_progress',
    'Update progress on current goal (0-100%).',
    {
      type: 'object',
      properties: {
        progress: { type: 'number', description: 'Progress percentage (0-100)' },
        completed_action: { type: 'string', description: 'Description of action just completed' },
      },
      required: ['progress'],
    },
    async (_args, _ctx) => {
      return `__UNHANDLED__:update_progress`
    },
    { category: 'planning' }
  )

  defineTool<{ summary: string }>(
    'complete_goal',
    'Mark current goal as complete and clear session memory.',
    {
      type: 'object',
      properties: {
        summary: { type: 'string', description: 'Summary of what was accomplished' },
      },
      required: ['summary'],
    },
    async (_args, _ctx) => {
      return `__UNHANDLED__:complete_goal`
    },
    { category: 'planning' }
  )

  // Stack (todo queue) tools
  defineTool<{ description: string; priority?: string; context?: Record<string, unknown> }>(
    'push_task',
    'Add a task to the todo stack for later. Tasks are processed LIFO (last in, first out).',
    {
      type: 'object',
      properties: {
        description: { type: 'string', description: 'Task description' },
        priority: { type: 'string', description: 'Priority: high, medium, low (default: medium)' },
        context: { type: 'object', description: 'Optional context data for the task' },
      },
      required: ['description'],
    },
    async (_args, _ctx) => {
      return `__UNHANDLED__:push_task`
    },
    { category: 'planning' }
  )

  defineTool<Record<string, never>>(
    'pop_task',
    'Get and remove the top task from the stack.',
    {
      type: 'object',
      properties: {},
      required: [],
    },
    async (_args, _ctx) => {
      return `__UNHANDLED__:pop_task`
    },
    { category: 'planning' }
  )

  defineTool<Record<string, never>>(
    'peek_stack',
    'View the task stack without removing tasks.',
    {
      type: 'object',
      properties: {},
      required: [],
    },
    async (_args, _ctx) => {
      return `__UNHANDLED__:peek_stack`
    },
    { category: 'planning' }
  )

  defineTool<Record<string, never>>(
    'clear_stack',
    'Clear all tasks from the stack.',
    {
      type: 'object',
      properties: {},
      required: [],
    },
    async (_args, _ctx) => {
      return `__UNHANDLED__:clear_stack`
    },
    { category: 'planning' }
  )
}
