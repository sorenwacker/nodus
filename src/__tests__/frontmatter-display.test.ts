import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import en from '../i18n/locales/en.json'
import { stripFrontmatter } from '../lib/contentParser'
import { renderMarkdown } from '../services/MarkdownRenderService'
import CanvasNodeCard from '../canvas/components/CanvasNodeCard.vue'

describe('stripFrontmatter', () => {
  it('removes a leading frontmatter block', () => {
    expect(stripFrontmatter('---\ntype: Note\ntags:\n  - a\n---\nBody text')).toBe('Body text')
  })

  it('leaves content without frontmatter untouched', () => {
    expect(stripFrontmatter('Plain content\n---\nrule below')).toBe('Plain content\n---\nrule below')
  })

  it('leaves an unterminated block untouched', () => {
    expect(stripFrontmatter('---\nbroken yaml')).toBe('---\nbroken yaml')
  })
})

describe('renderMarkdown frontmatter handling', () => {
  it('does not render frontmatter fields as visible text', () => {
    const html = renderMarkdown('---\ntype: Note\ntitle: Alpha\n---\n# Heading\n\nBody')
    expect(html).not.toContain('type: Note')
    expect(html).toContain('Heading')
    expect(html).toContain('Body')
  })
})

describe('CanvasNodeCard tag chips', () => {
  const i18n = createI18n({ legacy: false, locale: 'en', messages: { en } })

  function mountCard(tags: string | null) {
    return mount(CanvasNodeCard, {
      props: {
        node: {
          id: 'n1',
          title: 'Alpha',
          node_type: 'note',
          markdown_content: 'Body',
          canvas_x: 0,
          canvas_y: 0,
          tags,
        },
        style: {},
        isSelected: false,
        isDragging: false,
        isResizing: false,
        isEditing: false,
        isCollapsed: false,
        isNeighborhoodMode: false,
        isNeighborhoodFocus: false,
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
      global: { plugins: [i18n] },
    })
  }

  it('shows tags from the node as chips', () => {
    const wrapper = mountCard('["research","AI2024"]')
    const chips = wrapper.findAll('.node-tag-chip')
    expect(chips.map(c => c.text())).toEqual(['#research', '#AI2024'])
  })

  it('renders no chip row for nodes without tags', () => {
    expect(mountCard(null).find('.node-tag-footer').exists()).toBe(false)
    expect(mountCard('not-json').find('.node-tag-footer').exists()).toBe(false)
  })
})
