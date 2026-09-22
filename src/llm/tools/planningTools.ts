/**
 * Planning tools: think, plan, update_task, done.
 *
 * `plan` and `update_task` write the task list the panel shows through the
 * `plan` context service. `done` ends the run with a typed signal
 * (PRODUCT_DESIGN.md > Tool signals).
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
    { modes: ['explore', 'plan', 'execute'], mutates: false }
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
    async (args, ctx) => {
      const taskList = Array.isArray(args.tasks) ? args.tasks : []
      if (taskList.length === 0) return 'No tasks provided'

      ctx.plan!.setTasks(taskList)
      ctx.log('--- PLAN ---')
      taskList.forEach((t, i) => ctx.log(`[ ] ${i + 1}. ${t}`))
      ctx.log('------------')
      return `Created plan with ${taskList.length} tasks`
    },
    { modes: ['execute'], mutates: false, requires: ['plan'] }
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
    async (args, ctx) => {
      const plan = ctx.plan!
      const index = typeof args.task_index === 'number' ? args.task_index : -1
      if (index < 0 || index >= plan.taskCount()) return `Invalid task index: ${index}`

      const status = args.status === 'done' ? 'done' : args.status === 'failed' ? 'failed' : 'in_progress'
      plan.updateTaskStatus(index, status)

      const icon = status === 'done' ? '[x]' : status === 'failed' ? '[!]' : '[>]'
      ctx.log(`${icon} Task ${index + 1}: ${plan.taskDescription(index)} -> ${status}`)
      return `Task ${index + 1} updated: ${status}`
    },
    { modes: ['execute'], mutates: false, requires: ['plan'] }
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
      return {
        text: `${args.summary || 'completed'} (${nodes.length} nodes, ${edges.length} edges)`,
        signal: 'done',
      }
    },
    { modes: ['explore', 'plan', 'execute'], mutates: false }
  )
}
