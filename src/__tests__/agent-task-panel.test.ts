/**
 * The task panel shows what the agent is doing, and keeps up with it.
 *
 * It listed "1. 2. 3." with no text and stayed at 0/3 for the whole run: the
 * descriptions never arrived, and nothing advanced the progress because the
 * lifecycle calls that mark a task started or finished had no callers
 * (PRODUCT_DESIGN.md > Showing agent progress).
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

describe('agent task list', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('keeps the step descriptions it was given', async () => {
    const { useAgentTasksStore } = await import('../stores/agentTasks')
    const store = useAgentTasksStore()

    store.setTasks([
      { description: 'Create 8 risk nodes' },
      { description: 'Connect the consequences' },
    ])

    expect(store.tasks.map(t => t.description)).toEqual([
      'Create 8 risk nodes',
      'Connect the consequences',
    ])
  })

  it('advances as tasks are started and finished', async () => {
    const { useAgentTasksStore } = await import('../stores/agentTasks')
    const store = useAgentTasksStore()
    store.setTasks([{ description: 'one' }, { description: 'two' }])

    expect(store.completedTasks).toBe(0)
    store.startNextTask()
    store.completeTask()

    expect(store.completedTasks).toBe(1)
    expect(store.totalTasks).toBe(2)
  })

  it('is reachable from a plan approval with real descriptions', async () => {
    // The path the user actually takes: approve a plan, see its steps listed
    const { usePlanState } = await import('../llm/planState')
    const { useAgentTasksStore } = await import('../stores/agentTasks')
    const planState = usePlanState()
    const store = useAgentTasksStore()

    planState.createPlan('Risk analysis', [
      { description: 'Create 8 risk nodes', action: 'create' },
      { description: 'Connect the consequences', action: 'connect' },
    ])
    planState.approvePlan()

    store.setTasks(
      planState.currentPlan.value!.steps.map(s => ({
        description: s.description,
        details: s.details,
      }))
    )

    expect(store.tasks[0].description).toBe('Create 8 risk nodes')
    expect(store.tasks).toHaveLength(2)
  })

  it('can be cleared, so the panel can be closed', async () => {
    const { useAgentTasksStore } = await import('../stores/agentTasks')
    const store = useAgentTasksStore()
    store.setTasks([{ description: 'one' }])

    store.clearTasks()

    expect(store.totalTasks).toBe(0)
  })
})
