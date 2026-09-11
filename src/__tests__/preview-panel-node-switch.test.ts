/**
 * An editor opened for one field belongs to the node it was opened on
 * (PRODUCT_DESIGN.md > Saving edits when the open node changes).
 *
 * Switching the preview panel to another node reset only the main editor. The
 * date editor, the tag input and the link picker kept their state, and their
 * save paths wrote to whichever node was open by then: node A's dates could be
 * saved into node B, and a half-typed tag landed on B when its input blurred.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createI18n } from 'vue-i18n'
import en from '../i18n/locales/en.json'
import CanvasPreviewPanel from '../canvas/components/CanvasPreviewPanel.vue'
import { useNodesStore } from '../stores/nodes'

const NODE_A = { nodeId: 'a', title: 'Alpha', content: '', rawContent: '---\ndate: 100\n---\nAlpha body' }
const NODE_B = { nodeId: 'b', title: 'Beta', content: '', rawContent: 'Beta body' }

let wrapper: VueWrapper
let updateNodeTags: ReturnType<typeof vi.fn>

function mountOn(node: typeof NODE_A) {
  const pinia = createPinia()
  setActivePinia(pinia)
  const store = useNodesStore()
  updateNodeTags = vi.fn().mockResolvedValue(undefined)
  store.updateNodeTags = updateNodeTags as typeof store.updateNodeTags
  const i18n = createI18n({ legacy: false, locale: 'en', messages: { en } })
  return mount(CanvasPreviewPanel, {
    props: { visible: true, ...node },
    global: {
      plugins: [i18n, pinia],
      stubs: { NodePicker: true, MarkdownContent: true },
    },
  })
}

/** Saves the panel emitted for a node */
function savesFor(nodeId: string): string[] {
  return (wrapper.emitted('save') ?? [])
    .filter(args => args[0] === nodeId)
    .map(args => args[1] as string)
}

describe('switching the preview panel to another node', () => {
  beforeEach(() => {
    wrapper = mountOn(NODE_A)
  })

  it('closes a date editor opened on the previous node', async () => {
    await wrapper.find('.preview-date-chip').trigger('click')
    expect(wrapper.find('.preview-date-input').exists(), 'precondition: date editor open on A').toBe(true)

    await wrapper.setProps(NODE_B)

    expect(wrapper.find('.preview-date-input').exists()).toBe(false)
  })

  it("never saves the previous node's dates into the new one", async () => {
    await wrapper.find('.preview-date-chip').trigger('click')
    expect(wrapper.find('.preview-date-input').exists(), 'precondition: date editor open on A').toBe(true)

    await wrapper.setProps(NODE_B)
    const save = wrapper.find('.preview-date-save')
    if (save.exists()) await save.trigger('click')

    expect(savesFor('b').filter(content => content.includes('date: 100'))).toEqual([])
  })

  it('drops a half-typed tag instead of writing it to the new node', async () => {
    await wrapper.find(`button[data-tooltip="${en.canvas.node.addTag}"]`).trigger('click')
    const input = wrapper.find('.preview-tag-input')
    expect(input.exists(), 'precondition: tag input open on A').toBe(true)
    await input.setValue('alpha')

    await wrapper.setProps(NODE_B)
    const stillOpen = wrapper.find('.preview-tag-input')
    if (stillOpen.exists()) await stillOpen.trigger('blur')

    expect(stillOpen.exists()).toBe(false)
    expect(updateNodeTags).not.toHaveBeenCalledWith('b', expect.anything())
  })

  it('does not reopen a link picker from the previous node when editing the new one', async () => {
    await wrapper.find('h3').trigger('dblclick')
    const textarea = wrapper.find('textarea')
    expect(textarea.exists(), 'precondition: editing A').toBe(true)
    await textarea.setValue('Alpha body [[')
    expect(wrapper.find('.wikilink-picker').exists(), 'precondition: link picker open on A').toBe(true)

    await wrapper.setProps(NODE_B)
    await wrapper.find('h3').trigger('dblclick')

    expect(wrapper.find('textarea').exists(), 'editing B').toBe(true)
    expect(wrapper.find('.wikilink-picker').exists()).toBe(false)
  })
})
