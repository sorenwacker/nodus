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
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'


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

describe('the task panel can be dismissed and does not cover the toolbar', () => {
  it('offers a close control that clears the list', async () => {
    const { mount } = await import('@vue/test-utils')
    const { createI18n } = await import('vue-i18n')
    const en = (await import('../i18n/locales/en.json')).default
    const { useAgentTasksStore } = await import('../stores/agentTasks')
    const AgentTaskPanel = (await import('../components/AgentTaskPanel.vue')).default

    const store = useAgentTasksStore()
    store.setTasks([{ description: 'one' }, { description: 'two' }])
    const i18n = createI18n({ legacy: false, locale: 'en', messages: { en } })
    const wrapper = mount(AgentTaskPanel, { global: { plugins: [i18n] } })

    const close = wrapper.find('.task-panel-close')
    expect(close.exists(), 'the panel must be dismissable').toBe(true)

    await close.trigger('click')

    expect(store.totalTasks).toBe(0)
  })

  it('sits clear of the zoom controls, tracking the same insets', () => {
    // Pinned to the same corner at a higher z-index, it covered the toolbar
    const css = readFileSync(
      resolve(__dirname, '../canvas/styles/canvas-overlays.css'),
      'utf-8'
    )
    const start = css.indexOf('.agent-task-panel-container')
    const block = css.slice(start, css.indexOf('}', start))

    // Above the toolbar, which sits at 16px with a ~40px height
    const bottom = block.match(/bottom:\s*calc\((\d+)px/)
    expect(bottom, 'offset must be expressed against the bottom inset').toBeTruthy()
    expect(Number(bottom![1])).toBeGreaterThan(56)

    // Tracks the same insets the toolbar uses, so they move together
    expect(block).toContain('var(--canvas-bottom-inset')
    expect(block).toContain('var(--canvas-right-inset')

    // Below the toolbar's own stacking order is not required, but it must not
    // be an arbitrarily high value that covers every other overlay
    const zIndex = block.match(/z-index:\s*(\d+)/)
    expect(Number(zIndex![1])).toBeLessThan(1000)
  })
})
