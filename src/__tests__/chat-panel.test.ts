/**
 * The agent bar renders its transcript as a chat above the input row
 * (PRODUCT_DESIGN.md > Local LLM Agent > Chat transcript).
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import CanvasChatTranscript from '../canvas/components/CanvasChatTranscript.vue'
import en from '../i18n/locales/en.json'
import type { ChatTurn } from '../llm/chatTranscript'

const i18n = createI18n({ legacy: false, locale: 'en', messages: { en } })

function turn(partial: Partial<ChatTurn> & { id: string; role: ChatTurn['role'] }): ChatTurn {
  return { text: '', actions: [], status: 'ok', ...partial }
}

function mountChat(turns: ChatTurn[]) {
  return mount(CanvasChatTranscript, {
    props: { turns, isRunning: false },
    global: { plugins: [i18n] },
  })
}

describe('canvas chat transcript', () => {
  it('renders nothing when there is no conversation yet', () => {
    expect(mountChat([]).find('.chat-turn').exists()).toBe(false)
  })

  it('shows user prompts and assistant answers in order', () => {
    const wrapper = mountChat([
      turn({ id: '1', role: 'user', text: 'cluster these nodes' }),
      turn({ id: '2', role: 'assistant', text: 'Grouped 12 nodes into 3 clusters.' }),
    ])

    const rendered = wrapper.findAll('.chat-turn')
    expect(rendered).toHaveLength(2)
    expect(rendered[0].classes()).toContain('user')
    expect(rendered[0].text()).toContain('cluster these nodes')
    expect(rendered[1].classes()).toContain('assistant')
    expect(rendered[1].text()).toContain('Grouped 12 nodes into 3 clusters.')
  })

  it('shows the answer in full rather than truncating it', () => {
    const long = 'sentence. '.repeat(60).trim()
    const wrapper = mountChat([turn({ id: '1', role: 'assistant', text: long })])
    expect(wrapper.text()).toContain(long)
  })

  it('collapses tool activity into one line per turn and expands on click', async () => {
    const wrapper = mountChat([
      turn({ id: '1', role: 'assistant', text: 'Done.', actions: ['create_node', 'create_edge'] }),
    ])

    // Collapsed: the toggle reports the count, details are hidden
    const toggle = wrapper.find('.chat-actions-toggle')
    expect(toggle.exists()).toBe(true)
    expect(toggle.text()).toContain('2')
    expect(wrapper.find('.chat-action').exists()).toBe(false)

    await toggle.trigger('click')
    const actions = wrapper.findAll('.chat-action')
    expect(actions).toHaveLength(2)
    expect(actions[0].text()).toContain('create_node')
  })

  it('omits the activity toggle for a turn that called no tools', () => {
    const wrapper = mountChat([turn({ id: '1', role: 'assistant', text: 'Just answering.' })])
    expect(wrapper.find('.chat-actions-toggle').exists()).toBe(false)
  })

  it('marks a failed turn so the error is visible in the conversation', () => {
    const wrapper = mountChat([
      turn({ id: '1', role: 'assistant', text: 'Model request failed', status: 'error' }),
    ])
    expect(wrapper.find('.chat-turn').classes()).toContain('error')
  })

  it('shows a working indicator while the agent is running', async () => {
    const wrapper = mount(CanvasChatTranscript, {
      props: { turns: [turn({ id: '1', role: 'user', text: 'go' })], isRunning: true },
      global: { plugins: [i18n] },
    })
    expect(wrapper.find('.chat-pending').exists()).toBe(true)
  })
})
