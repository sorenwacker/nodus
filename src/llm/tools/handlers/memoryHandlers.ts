/**
 * Memory Tool Handlers
 *
 * Handles session memory, goals, progress tracking, and task stack.
 */

import type { ToolHandler, ToolContext } from './types'
import { parseToolArgs, getStringArg, getNumberArg, getArrayArg } from '../../../lib/parsing'

/**
 * Remember something for the current workspace
 */
export const rememberHandler: ToolHandler = async (
  args: Record<string, unknown>,
  ctx: ToolContext
): Promise<string> => {
  const parsed = parseToolArgs(args)
  const message = getStringArg(parsed, 'message', '')

  if (!message) return 'Nothing to remember'

  const workspaceId = ctx.store.currentWorkspaceId || 'default'
  ctx.memoryStorage.addMemory(workspaceId, message)

  ctx.log(`[memory] ${message}`)
  return `Remembered for this workspace: ${message}`
}

/**
 * Set a goal with optional steps
 */
export const setGoalHandler: ToolHandler = async (
  args: Record<string, unknown>,
  ctx: ToolContext
): Promise<string> => {
  const parsed = parseToolArgs(args)
  const goal = getStringArg(parsed, 'goal', '')
  const steps = getArrayArg<string>(parsed, 'steps', [])

  if (!goal) return 'No goal provided'

  const workspaceId = ctx.store.currentWorkspaceId || 'default'
  ctx.agentMemoryStorage.setSession(workspaceId, {
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
}

/**
 * Update progress on current goal
 */
export const updateProgressHandler: ToolHandler = async (
  args: Record<string, unknown>,
  ctx: ToolContext
): Promise<string> => {
  const parsed = parseToolArgs(args)
  const progress = getNumberArg(parsed, 'progress', 0)
  const completedAction = getStringArg(parsed, 'completed_action', '') || undefined

  const workspaceId = ctx.store.currentWorkspaceId || 'default'
  const session = ctx.agentMemoryStorage.getSession(workspaceId)
  if (!session) return 'No active goal session'

  ctx.agentMemoryStorage.updateProgress(workspaceId, progress, completedAction)

  ctx.log(`[session] Progress: ${progress}%${completedAction ? ` (${completedAction})` : ''}`)
  return `Progress updated to ${progress}%${completedAction ? ` - completed: ${completedAction}` : ''}`
}

/**
 * Complete the current goal
 */
export const completeGoalHandler: ToolHandler = async (
  args: Record<string, unknown>,
  ctx: ToolContext
): Promise<string> => {
  const parsed = parseToolArgs(args)
  const summary = getStringArg(parsed, 'summary', 'Goal completed')

  const workspaceId = ctx.store.currentWorkspaceId || 'default'
  const session = ctx.agentMemoryStorage.getSession(workspaceId)
  if (!session) return 'No active goal session'

  // Store completion as a fact for future reference
  ctx.memoryStorage.addMemory(workspaceId, `Completed: ${session.goal} - ${summary}`)
  ctx.agentMemoryStorage.clearSession(workspaceId)

  ctx.log(`[session] Goal completed: ${summary}`)
  return `Goal completed: ${summary}`
}

/**
 * Push a task to the stack
 */
export const pushTaskHandler: ToolHandler = async (
  args: Record<string, unknown>,
  ctx: ToolContext
): Promise<string> => {
  const parsed = parseToolArgs(args)
  const description = getStringArg(parsed, 'description', '')
  const priorityStr = getStringArg(parsed, 'priority', 'medium')
  const contextStr = getStringArg(parsed, 'context', '')

  if (!description) return 'Task description required'

  // Validate priority
  const validPriorities = ['low', 'medium', 'high'] as const
  const priority = validPriorities.includes(priorityStr as 'low' | 'medium' | 'high')
    ? (priorityStr as 'low' | 'medium' | 'high')
    : 'medium'

  // Parse context if provided
  let context: Record<string, unknown> | undefined
  if (contextStr) {
    try {
      const parsed = JSON.parse(contextStr)
      context = typeof parsed === 'object' && parsed !== null ? parsed : undefined
    } catch {
      context = undefined
    }
  }

  const workspaceId = ctx.store.currentWorkspaceId || 'default'
  const task = ctx.agentMemoryStorage.pushTask(workspaceId, {
    description,
    priority,
    context,
  })

  ctx.log(`[stack] Pushed: ${description}`)
  return `Task added to stack: ${task.description} (id: ${task.id})`
}

/**
 * Pop the top task from the stack
 */
export const popTaskHandler: ToolHandler = async (
  _args: Record<string, unknown>,
  ctx: ToolContext
): Promise<string> => {
  const workspaceId = ctx.store.currentWorkspaceId || 'default'
  const task = ctx.agentMemoryStorage.popTask(workspaceId)

  if (!task) return 'Stack is empty'

  ctx.log(`[stack] Popped: ${task.description}`)
  return `Popped task: ${task.description}${task.context ? `\nContext: ${task.context}` : ''}`
}

/**
 * Peek at the top task without removing it
 */
export const peekStackHandler: ToolHandler = async (
  _args: Record<string, unknown>,
  ctx: ToolContext
): Promise<string> => {
  const workspaceId = ctx.store.currentWorkspaceId || 'default'
  const task = ctx.agentMemoryStorage.peekTask(workspaceId)

  if (!task) return 'Stack is empty'

  return `Next task: ${task.description}${task.context ? `\nContext: ${task.context}` : ''}\nPriority: ${task.priority}`
}

/**
 * Clear the entire task stack
 */
export const clearStackHandler: ToolHandler = async (
  _args: Record<string, unknown>,
  ctx: ToolContext
): Promise<string> => {
  const workspaceId = ctx.store.currentWorkspaceId || 'default'
  const stack = ctx.agentMemoryStorage.getStack(workspaceId)
  const count = stack.length

  ctx.agentMemoryStorage.clearStack(workspaceId)

  ctx.log(`[stack] Cleared ${count} tasks`)
  return `Cleared ${count} tasks from stack`
}
