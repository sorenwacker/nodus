/**
 * Choosing a colour stores it once.
 *
 * The colour input was bound to `@input`, which fires continuously while the
 * user moves through the picker. Each event wrote the storyline and then every
 * edge colour belonging to it, so picking one colour issued dozens of writes
 * and dozens of edge-colour updates (PRODUCT_DESIGN.md > Persisting a gesture).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { createPinia, setActivePinia } from 'pinia'
import en from '../i18n/locales/en.json'

const updateStoryline = vi.fn().mockResolvedValue(undefined)
const updateStorylineEdgeColors = vi.fn().mockResolvedValue(undefined)

vi.mock('../stores/storylines', () => ({
  useStorylinesStore: () => ({
    updateStoryline,
    updateStorylineEdgeColors,
    deleteStoryline: vi.fn(),
    storylineNodes: new Map(),
  }),
}))

const i18n = createI18n({ legacy: false, locale: 'en', messages: { en } })

async function mountSection() {
  const StorylineSection = (await import('../components/StorylineSection.vue')).default
  return mount(StorylineSection, {
    props: {
      storyline: { id: 's1', title: 'Argument', description: null, color: '#94a3b8' },
      nodes: [],
      expanded: false,
    } as never,
    global: { plugins: [i18n, createPinia()], stubs: { Icon: true, StorylineNodeList: true } },
  })
}

describe('choosing a storyline colour', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    updateStoryline.mockClear()
    updateStorylineEdgeColors.mockClear()
  })

  it('stores nothing while the user is still moving through the picker', async () => {
    const wrapper = await mountSection()
    const input = wrapper.find('input[type="color"]')

    // What a colour picker emits as the pointer moves. The DOM value is set
    // directly and only `input` dispatched, because setValue's own event
    // behaviour is not what this test is about.
    const element = input.element as HTMLInputElement
    for (const value of ['#111111', '#222222', '#333333', '#444444']) {
      element.value = value
      await input.trigger('input')
    }

    expect(updateStoryline).not.toHaveBeenCalled()
    expect(updateStorylineEdgeColors).not.toHaveBeenCalled()
  })

  it('stores the colour once the choice is made', async () => {
    const wrapper = await mountSection()
    const input = wrapper.find('input[type="color"]')

    ;(input.element as HTMLInputElement).value = '#ff0000'
    await input.trigger('change')

    expect(updateStoryline).toHaveBeenCalledOnce()
    expect(updateStorylineEdgeColors).toHaveBeenCalledOnce()
    expect(updateStorylineEdgeColors).toHaveBeenCalledWith('s1', '#ff0000')
  })
})
