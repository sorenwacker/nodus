/**
 * The agent bar names the nodes it will send as context
 * (PRODUCT_DESIGN.md > Local LLM Agent > Context indicator).
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import CanvasLLMBar from '../canvas/components/CanvasLLMBar.vue'
import en from '../i18n/locales/en.json'

const i18n = createI18n({ legacy: false, locale: 'en', messages: { en } })

function mountBar(overrides: Record<string, unknown> = {}) {
  return mount(CanvasLLMBar, {
    props: {
      graphPrompt: '',
      isLoading: false,
      isRunning: false,
      conversationHistory: [],
      transcript: [],
      agentTasks: [],
      agentLog: [],
      showLog: false,
      contextNodeTitles: [],
      contextIsSelection: false,
      contextTotal: 0,
      ...overrides,
    },
    global: { plugins: [i18n] },
  })
}

describe('agent context indicator', () => {
  it('names the selected nodes that will be sent', () => {
    const wrapper = mountBar({
      contextNodeTitles: ['Alpha', 'Beta'],
      contextIsSelection: true,
      contextTotal: 2,
    })

    const context = wrapper.find('.llm-context')
    expect(context.exists()).toBe(true)
    expect(context.text()).toContain('Alpha')
    expect(context.text()).toContain('Beta')
  })

  it('says the whole graph goes in when nothing is selected', () => {
    const wrapper = mountBar({
      contextNodeTitles: ['Alpha', 'Beta', 'Gamma'],
      contextIsSelection: false,
      contextTotal: 3,
    })

    const text = wrapper.find('.llm-context').text()
    expect(text).toContain('3')
    // Without a selection the point is the count, not a long title list
    expect(wrapper.find('.context-titles').exists()).toBe(false)
  })

  it('truncates a long selection and reports how many are hidden', () => {
    const titles = ['A', 'B', 'C', 'D', 'E', 'F', 'G']
    const wrapper = mountBar({
      contextNodeTitles: titles,
      contextIsSelection: true,
      contextTotal: titles.length,
    })

    const context = wrapper.find('.llm-context')
    expect(context.text()).toContain('A')
    expect(context.text()).toMatch(/\+3/)
    // The full list stays available without cluttering the bar
    expect(wrapper.find('.context-titles').attributes('title')).toContain('G')
  })

  it('reports an empty graph honestly instead of implying context', () => {
    const wrapper = mountBar({ contextNodeTitles: [], contextIsSelection: false, contextTotal: 0 })
    expect(wrapper.find('.llm-context').text()).toContain('0')
  })

  it('names an untitled node instead of showing a blank', () => {
    const wrapper = mountBar({
      contextNodeTitles: ['Alpha', ''],
      contextIsSelection: true,
      contextTotal: 2,
    })
    expect(wrapper.find('.context-titles').text()).toContain('Untitled')
  })

  it('does not duplicate the count in a separate selection badge', () => {
    const wrapper = mountBar({
      contextNodeTitles: ['Alpha'],
      contextIsSelection: true,
      contextTotal: 1,
      selectedCount: 1,
    })
    expect(wrapper.find('.selection-badge').exists()).toBe(false)
  })
})
