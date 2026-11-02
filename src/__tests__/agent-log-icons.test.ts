/**
 * Clearing the agent log and closing its panel look different.
 *
 * The standalone panel drew the same cross for both, side by side, so the
 * header read as two close buttons (PRODUCT_DESIGN.md > Agent log contents).
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import CanvasAgentLogPanel from '../canvas/components/CanvasAgentLogPanel.vue'
import CanvasLLMBar from '../canvas/components/CanvasLLMBar.vue'
import en from '../i18n/locales/en.json'

const i18n = createI18n({ legacy: false, locale: 'en', messages: { en } })

/** The drawing inside a button, without the scope attributes Vue adds */
function drawing(button: { find: (selector: string) => { html: () => string } }): string {
  return button
    .find('svg')
    .html()
    .replace(/ data-v-[0-9a-f]+=""/g, '')
    .replace(/\s+/g, ' ')
}

describe('agent log buttons', () => {
  it('draws clearing and closing differently in the standalone panel', () => {
    const wrapper = mount(CanvasAgentLogPanel, { props: { log: ['a line'] }, global: { plugins: [i18n] } })
    const clear = wrapper.find(`button[title="${en.agentLog.clear}"]`)
    const close = wrapper.find(`button[title="${en.common.close}"]`)

    expect(clear.exists()).toBe(true)
    expect(close.exists()).toBe(true)
    expect(drawing(clear)).not.toBe(drawing(close))
  })

  it('draws clearing the same way in the agent panel as in the standalone panel', () => {
    const standalone = mount(CanvasAgentLogPanel, { props: { log: ['a line'] }, global: { plugins: [i18n] } })
    const bar = mount(CanvasLLMBar, {
      props: {
        graphPrompt: '',
        isLoading: false,
        isRunning: false,
        conversationHistory: [],
        transcript: [],
        agentTasks: [],
        agentLog: ['a line'],
        showLog: true,
        contextNodeTitles: [],
        contextIsSelection: false,
        contextTotal: 0,
        collapsed: false,
        resizing: false,
      },
      global: { plugins: [i18n] },
    })

    const inPanel = standalone.find(`button[title="${en.agentLog.clear}"]`)
    const inBar = bar.find(`button[title="${en.canvas.agent.clearLog}"]`)

    expect(inBar.exists()).toBe(true)
    expect(drawing(inBar)).toBe(drawing(inPanel))
  })

  it('emits clear and close from their own buttons', async () => {
    const wrapper = mount(CanvasAgentLogPanel, { props: { log: ['a line'] }, global: { plugins: [i18n] } })

    await wrapper.find(`button[title="${en.agentLog.clear}"]`).trigger('click')
    expect(wrapper.emitted('clear')).toHaveLength(1)
    expect(wrapper.emitted('close')).toBeUndefined()

    await wrapper.find(`button[title="${en.common.close}"]`).trigger('click')
    expect(wrapper.emitted('close')).toHaveLength(1)
  })
})
