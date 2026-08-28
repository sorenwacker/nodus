/**
 * The conversation renders the markdown the model writes.
 *
 * The transcript interpolated the text, so a reply came out with `**emphasis**`
 * and `- ` list markers showing literally
 * (PRODUCT_DESIGN.md > Rendering the conversation).
 */
import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import en from '../i18n/locales/en.json'

vi.mock('../lib/tauri', () => ({ invoke: vi.fn(), isTauri: () => false }))

const i18n = createI18n({ legacy: false, locale: 'en', messages: { en } })

async function mountTranscript(text: string) {
  const CanvasChatTranscript = (
    await import('../canvas/components/CanvasChatTranscript.vue')
  ).default
  return mount(CanvasChatTranscript, {
    props: {
      turns: [{ id: 't1', role: 'assistant', text, actions: [], status: 'done' }] as never,
      isRunning: false,
    },
    global: { plugins: [i18n] },
  })
}

describe('the chat transcript', () => {
  it('renders emphasis rather than showing the asterisks', async () => {
    const wrapper = await mountTranscript('**SCIM** is an open standard.')

    expect(wrapper.html()).toContain('<strong>SCIM</strong>')
    expect(wrapper.text()).not.toContain('**')
  })

  it('renders a list rather than showing the dashes', async () => {
    const wrapper = await mountTranscript('- first point\n- second point')

    expect(wrapper.find('ul').exists()).toBe(true)
    expect(wrapper.findAll('li')).toHaveLength(2)
  })

  it('does not execute markup in a reply', async () => {
    // The model's output is untrusted text like any other
    const wrapper = await mountTranscript('<img src=x onerror="alert(1)">')

    expect(wrapper.html()).not.toContain('onerror')
  })
})
