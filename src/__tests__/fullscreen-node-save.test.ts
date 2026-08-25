/**
 * A debounced write belongs to the node whose keystrokes armed it.
 *
 * Typing in the fullscreen view then clicking a wikilink within the 500ms
 * debounce swapped the open node. The timer then resolved its target lazily
 * from props.nodeId, compared the NEW node's stored text against the OLD
 * node's buffer, found nothing to write, and the old node's last keystrokes
 * were lost with nothing reported
 * (PRODUCT_DESIGN.md > Saving edits when the open node changes).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, DOMWrapper } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { createPinia } from 'pinia'
import { nextTick } from 'vue'
import en from '../i18n/locales/en.json'

const nodes = new Map<string, { id: string; title: string; markdown_content: string }>()
const updateNodeContent = vi.fn(async (id: string, content: string) => {
  const node = nodes.get(id)
  if (node) node.markdown_content = content
})
const updateNodeTitle = vi.fn(async (id: string, title: string) => {
  const node = nodes.get(id)
  if (node) node.title = title
})

vi.mock('../stores/nodes', () => ({
  useNodesStore: () => ({
    getNode: (id: string) => nodes.get(id),
    get filteredNodes() {
      return [...nodes.values()]
    },
    updateNodeContent,
    updateNodeTitle,
  }),
}))

vi.mock('../lib/tauri', () => ({ openExternal: vi.fn() }))

vi.mock('../services/MarkdownRenderService', () => ({
  renderMarkdown: (text: string) => `<p>${text}</p>`,
  renderPendingContent: vi.fn(async () => {}),
}))

const i18n = createI18n({ legacy: false, locale: 'en', messages: { en } })

/** Mount and switch out of reading mode, which is where the editor lives */
async function mountEditor(nodeId: string) {
  const FullscreenNodeModal = (await import('../components/FullscreenNodeModal.vue')).default
  const wrapper = mount(FullscreenNodeModal, {
    props: { visible: true, nodeId },
    global: {
      plugins: [i18n, createPinia()],
      stubs: { NodePicker: true },
    },
  })
  // The modal teleports to body, so the wrapper's own tree does not contain it
  await inBody('button.mode-toggle').trigger('click')
  await nextTick()
  return wrapper
}

function inBody(selector: string): DOMWrapper<Element> {
  const element = document.body.querySelector(selector)
  if (!element) throw new Error(`Not rendered: ${selector}`)
  return new DOMWrapper(element)
}

describe('fullscreen editor saves', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    // Teleported markup outlives its wrapper; a stale modal would answer first
    document.body.innerHTML = ''
    updateNodeContent.mockClear()
    updateNodeTitle.mockClear()
    nodes.clear()
    nodes.set('a', { id: 'a', title: 'Alpha', markdown_content: 'alpha body' })
    nodes.set('b', { id: 'b', title: 'Beta', markdown_content: 'beta body' })
  })

  it('writes the edited node when the open node changes mid-debounce', async () => {
    const wrapper = await mountEditor('a')

    const editor = inBody('textarea.fullscreen-editor')

    // Type into A, arming the debounce
    await editor.setValue('alpha body plus a new sentence')
    await nextTick()

    // Follow a wikilink to B before the debounce fires
    await wrapper.setProps({ nodeId: 'b' })
    await nextTick()

    vi.advanceTimersByTime(1000)
    await vi.runAllTimersAsync()

    expect(updateNodeContent).toHaveBeenCalledWith('a', 'alpha body plus a new sentence')
    // B was never edited, so nothing should have been written to it
    expect(updateNodeContent.mock.calls.filter(([id]) => id === 'b')).toEqual([])
  })

  it('writes the edited node when the editor closes mid-debounce', async () => {
    const wrapper = await mountEditor('a')

    await inBody('textarea.fullscreen-editor').setValue('alpha body edited')
    await nextTick()

    await wrapper.setProps({ visible: false })
    await vi.runAllTimersAsync()

    expect(updateNodeContent).toHaveBeenCalledWith('a', 'alpha body edited')
  })
})
