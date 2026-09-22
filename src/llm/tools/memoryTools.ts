/**
 * Memory tools: remember, and the session and stack tools.
 *
 * All storage arrives as the `memory` context service. The session and stack
 * tools are registered but offered in no mode: create_plan covers the same
 * ground with user approval, and the overlap is unresolved
 * (PRODUCT_DESIGN.md > A tool declares its modes).
 */

import { defineTool, type MemoryService, type ToolDeclaration } from '../registry'

const UNEXPOSED: ToolDeclaration = {
  modes: [],
  mutates: false,
  requires: ['memory'],
  unexposedReason:
    'The task and goal stack predates create_plan, which covers the same ground with user approval; kept until the overlap is resolved',
}

function workspaceOf(memory: MemoryService): string {
  return memory.workspaceId() || 'default'
}

export function registerMemoryTools(): void {
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
    async (args, ctx) => {
      const message = args.message || ''
      if (!message) return 'Nothing to remember'
      const memory = ctx.memory!
      memory.addFact(workspaceOf(memory), message)
      ctx.log(`[memory] ${message}`)
      return `Remembered for this workspace: ${message}`
    },
    { modes: ['execute'], mutates: false, requires: ['memory'] }
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
    async (args, ctx) => {
      const goal = args.goal || ''
      const steps = Array.isArray(args.steps) ? args.steps : []
      if (!goal) return 'No goal provided'
      const memory = ctx.memory!
      memory.setSession(workspaceOf(memory), {
        goal,
        progress: 0,
        completed: [],
        current_step: steps.length > 0 ? steps[0] : null,
        next_steps: steps.slice(1),
        blockers: [],
        started_at: new Date().toISOString(),
      })
      ctx.log(`[session] Goal set: ${goal}`)
      return `Goal set: ${goal}${steps.length > 0 ? ` (${steps.length} steps planned)` : ''}`
    },
    UNEXPOSED
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
    async (args, ctx) => {
      const progress = typeof args.progress === 'number' ? args.progress : 0
      const completedAction = args.completed_action || undefined
      const memory = ctx.memory!
      const workspaceId = workspaceOf(memory)
      if (!memory.getSession(workspaceId)) return 'No active goal session'
      memory.updateProgress(workspaceId, progress, completedAction)
      ctx.log(`[session] Progress: ${progress}%${completedAction ? ` (${completedAction})` : ''}`)
      return `Progress updated to ${progress}%${completedAction ? ` - completed: ${completedAction}` : ''}`
    },
    UNEXPOSED
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
    async (args, ctx) => {
      const summary = args.summary || 'Goal completed'
      const memory = ctx.memory!
      const workspaceId = workspaceOf(memory)
      const session = memory.getSession(workspaceId)
      if (!session) return 'No active goal session'
      // Store completion as a fact for future reference
      memory.addFact(workspaceId, `Completed: ${session.goal} - ${summary}`)
      memory.clearSession(workspaceId)
      ctx.log(`[session] Goal completed: ${summary}`)
      return `Goal completed: ${summary}`
    },
    UNEXPOSED
  )

  // Stack (todo queue) tools
  defineTool<{ description: string; priority?: string; context?: unknown }>(
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
    async (args, ctx) => {
      const description = args.description || ''
      if (!description) return 'Task description required'

      const validPriorities = ['low', 'medium', 'high'] as const
      const priority = validPriorities.includes(args.priority as 'low' | 'medium' | 'high')
        ? (args.priority as 'low' | 'medium' | 'high')
        : 'medium'

      // Declared as an object in the schema, so it arrives as one; accept JSON
      // text too, from a model that sent a string
      // (PRODUCT_DESIGN.md > Reporting what a batch did)
      const rawContext = args.context
      let context: Record<string, unknown> | undefined
      if (rawContext && typeof rawContext === 'object' && !Array.isArray(rawContext)) {
        context = rawContext as Record<string, unknown>
      } else if (typeof rawContext === 'string' && rawContext) {
        try {
          const decoded = JSON.parse(rawContext)
          context = typeof decoded === 'object' && decoded !== null ? decoded : undefined
        } catch {
          context = undefined
        }
      }

      const memory = ctx.memory!
      const task = memory.pushTask(workspaceOf(memory), { description, priority, context })
      ctx.log(`[stack] Pushed: ${description}`)
      return `Task added to stack: ${task.description} (id: ${task.id})`
    },
    UNEXPOSED
  )

  defineTool<Record<string, never>>(
    'pop_task',
    'Get and remove the top task from the stack.',
    {
      type: 'object',
      properties: {},
      required: [],
    },
    async (_args, ctx) => {
      const memory = ctx.memory!
      const task = memory.popTask(workspaceOf(memory))
      if (!task) return 'Stack is empty'
      ctx.log(`[stack] Popped: ${task.description}`)
      // Serialised to be read: interpolating the object printed "[object Object]"
      // (PRODUCT_DESIGN.md > Showing a task's stored context)
      return `Popped task: ${task.description}${task.context ? `\nContext: ${JSON.stringify(task.context)}` : ''}`
    },
    UNEXPOSED
  )

  defineTool<Record<string, never>>(
    'peek_stack',
    'View the task stack without removing tasks.',
    {
      type: 'object',
      properties: {},
      required: [],
    },
    async (_args, ctx) => {
      const memory = ctx.memory!
      const task = memory.peekTask(workspaceOf(memory))
      if (!task) return 'Stack is empty'
      return `Next task: ${task.description}${task.context ? `\nContext: ${JSON.stringify(task.context)}` : ''}\nPriority: ${task.priority}`
    },
    UNEXPOSED
  )

  defineTool<Record<string, never>>(
    'clear_stack',
    'Clear all tasks from the stack.',
    {
      type: 'object',
      properties: {},
      required: [],
    },
    async (_args, ctx) => {
      const memory = ctx.memory!
      const workspaceId = workspaceOf(memory)
      const count = memory.getStack(workspaceId).length
      memory.clearStack(workspaceId)
      ctx.log(`[stack] Cleared ${count} tasks`)
      return `Cleared ${count} tasks from stack`
    },
    UNEXPOSED
  )
}
