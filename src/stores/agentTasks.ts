/**
 * Agent Tasks Store
 *
 * Pinia store for tracking agent task progress.
 * Provides reactive state for UI components to display progress.
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export interface AgentTaskItem {
  id: string
  description: string
  status: 'pending' | 'in_progress' | 'done' | 'error'
  details?: string
  startedAt?: number
  completedAt?: number
  error?: string
}

export const useAgentTasksStore = defineStore('agentTasks', () => {
  // Task list
  const tasks = ref<AgentTaskItem[]>([])

  // Current task index
  const currentTaskIndex = ref(-1)

  // Session start time
  const sessionStartedAt = ref<number | null>(null)

  // Computed: total tasks
  const totalTasks = computed(() => tasks.value.length)

  // Computed: completed tasks (done or error)
  const completedTasks = computed(() =>
    tasks.value.filter(t => t.status === 'done' || t.status === 'error').length
  )

  // Computed: progress percentage
  const progress = computed(() => {
    if (totalTasks.value === 0) return 0
    return Math.round((completedTasks.value / totalTasks.value) * 100)
  })

  // Computed: current task
  const currentTask = computed(() =>
    currentTaskIndex.value >= 0 ? tasks.value[currentTaskIndex.value] : null
  )

  // Computed: is running (any task in progress)
  const isRunning = computed(() =>
    tasks.value.some(t => t.status === 'in_progress')
  )

  // Computed: all done
  const isComplete = computed(() =>
    tasks.value.length > 0 &&
    tasks.value.every(t => t.status === 'done' || t.status === 'error')
  )

  // Computed: has errors
  const hasErrors = computed(() =>
    tasks.value.some(t => t.status === 'error')
  )

  /**
   * Set tasks from a plan
   */
  function setTasks(newTasks: Array<{ description: string; details?: string }>): void {
    tasks.value = newTasks.map((t, i) => ({
      id: `task-${Date.now()}-${i}`,
      description: t.description,
      details: t.details,
      status: 'pending',
    }))
    currentTaskIndex.value = -1
    sessionStartedAt.value = Date.now()
  }

  /**
   * Start a task by index
   */
  function startTask(index: number): boolean {
    if (index < 0 || index >= tasks.value.length) return false

    const task = tasks.value[index]
    if (task.status !== 'pending') return false

    task.status = 'in_progress'
    task.startedAt = Date.now()
    currentTaskIndex.value = index
    return true
  }

  /**
   * Start next pending task
   */
  function startNextTask(): AgentTaskItem | null {
    const nextIndex = tasks.value.findIndex(t => t.status === 'pending')
    if (nextIndex < 0) return null

    startTask(nextIndex)
    return tasks.value[nextIndex]
  }

  /**
   * Complete current task
   */
  function completeTask(index?: number): boolean {
    const taskIndex = index ?? currentTaskIndex.value
    if (taskIndex < 0 || taskIndex >= tasks.value.length) return false

    const task = tasks.value[taskIndex]
    task.status = 'done'
    task.completedAt = Date.now()

    // Auto-start next if this was current
    if (taskIndex === currentTaskIndex.value) {
      const nextIndex = tasks.value.findIndex(t => t.status === 'pending')
      currentTaskIndex.value = nextIndex
    }

    return true
  }

  /**
   * Fail a task with error
   */
  function failTask(index: number, error: string): boolean {
    if (index < 0 || index >= tasks.value.length) return false

    const task = tasks.value[index]
    task.status = 'error'
    task.error = error
    task.completedAt = Date.now()
    return true
  }

  /**
   * Update task status by index
   */
  function updateTaskStatus(
    index: number,
    status: AgentTaskItem['status'],
    details?: string
  ): boolean {
    if (index < 0 || index >= tasks.value.length) return false

    const task = tasks.value[index]
    task.status = status

    if (details) {
      task.details = details
    }

    if (status === 'in_progress') {
      task.startedAt = Date.now()
      currentTaskIndex.value = index
    } else if (status === 'done' || status === 'error') {
      task.completedAt = Date.now()
    }

    return true
  }

  /**
   * Clear all tasks
   */
  function clearTasks(): void {
    tasks.value = []
    currentTaskIndex.value = -1
    sessionStartedAt.value = null
  }

  /**
   * Get task by index
   */
  function getTask(index: number): AgentTaskItem | null {
    if (index < 0 || index >= tasks.value.length) return null
    return tasks.value[index]
  }

  /**
   * Get summary for LLM context
   */
  function getSummary(): string {
    if (tasks.value.length === 0) return 'No tasks'

    const lines = tasks.value.map((t, i) => {
      const icon = t.status === 'done' ? '[x]' :
                   t.status === 'error' ? '[!]' :
                   t.status === 'in_progress' ? '[>]' : '[ ]'
      return `${icon} ${i + 1}. ${t.description}`
    })

    return `Tasks (${completedTasks.value}/${totalTasks.value}):\n${lines.join('\n')}`
  }

  return {
    // State
    tasks,
    currentTaskIndex,
    sessionStartedAt,

    // Computed
    totalTasks,
    completedTasks,
    progress,
    currentTask,
    isRunning,
    isComplete,
    hasErrors,

    // Actions
    setTasks,
    startTask,
    startNextTask,
    completeTask,
    failTask,
    updateTaskStatus,
    clearTasks,
    getTask,
    getSummary,
  }
})
