/**
 * Double-clicking a neighbour card in neighborhood mode moves the focus
 *
 * The header's rename handler stopped every double-click before the card saw
 * it, so a double-click on a neighbour's title opened the rename input instead
 * of navigating, and a collapsed card, which is nothing but its header,
 * swallowed the double-click entirely
 * (PRODUCT_DESIGN.md > Neighborhood Mode > Moving the focus).
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { createI18n } from 'vue-i18n'
import en from '../i18n/locales/en.json'
import CanvasNodeCard from '../canvas/components/CanvasNodeCard.vue'

const i18n = createI18n({ legacy: false, locale: 'en', messages: { en } })

function mountCard(opts: { neighborhood: boolean; focus: boolean; collapsed: boolean }) {
  return mount(CanvasNodeCard, {
    props: {
      node: {
        id: 'n1',
        title: 'Alpha',
        node_type: 'note',
        markdown_content: 'Body',
        canvas_x: 0,
        canvas_y: 0,
      },
      style: {},
      isSelected: false,
      isDragging: false,
      isResizing: false,
      isEditing: false,
      isCollapsed: opts.collapsed,
      isNeighborhoodMode: opts.neighborhood,
      isNeighborhoodFocus: opts.focus,
      isNeighborHighlighted: false,
      showThumbnail: false,
      renderedContent: '<p>Body</p>',
      editingTitleId: null,
      editTitle: '',
      editContent: '',
      scale: 1,
      showNodeSearch: false,
      nodeSearchQuery: '',
      nodeSearchMatchCount: 0,
      nodeSearchIndex: 0,
    },
    global: { plugins: [i18n, createPinia()] },
  })
}

describe('double-click on a card header', () => {
  it('reaches the card on a neighbour in neighborhood mode instead of renaming', async () => {
    const wrapper = mountCard({ neighborhood: true, focus: false, collapsed: false })
    await wrapper.find('.node-header').trigger('dblclick')
    expect(wrapper.emitted('dblclick')).toHaveLength(1)
    expect(wrapper.emitted('start-editing-title')).toBeUndefined()
  })

  it('reaches the card on a collapsed card, which is nothing but its header', async () => {
    const wrapper = mountCard({ neighborhood: false, focus: false, collapsed: true })
    await wrapper.find('.node-header').trigger('dblclick')
    expect(wrapper.emitted('dblclick')).toHaveLength(1)
    expect(wrapper.emitted('start-editing-title')).toBeUndefined()
  })

  it('still renames the focus node while the mode is open', async () => {
    const wrapper = mountCard({ neighborhood: true, focus: true, collapsed: false })
    await wrapper.find('.node-header').trigger('dblclick')
    expect(wrapper.emitted('start-editing-title')).toHaveLength(1)
    expect(wrapper.emitted('dblclick')).toBeUndefined()
  })

  it('still renames outside the mode', async () => {
    const wrapper = mountCard({ neighborhood: false, focus: false, collapsed: false })
    await wrapper.find('.node-header').trigger('dblclick')
    expect(wrapper.emitted('start-editing-title')).toHaveLength(1)
    expect(wrapper.emitted('dblclick')).toBeUndefined()
  })
})
