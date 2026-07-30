import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { createI18n } from 'vue-i18n'
import en from '../i18n/locales/en.json'
import {
  stripFrontmatter,
  splitFrontmatter,
  joinFrontmatter,
  upsertFrontmatterField,
} from '../lib/contentParser'
import { renderMarkdown } from '../services/MarkdownRenderService'
import { useNodeEditor } from '../canvas/composables/nodes/useNodeEditor'
import CanvasNodeCard from '../canvas/components/CanvasNodeCard.vue'
import type { Node } from '../types'

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

  it('upserts, replaces, and removes frontmatter fields', () => {
    // Creates the block on plain content
    expect(upsertFrontmatterField('Body text', 'date', '20 BC')).toBe(
      '---\ndate: 20 BC\n---\nBody text'
    )
    // Replaces an existing value, keeping other fields
    expect(
      upsertFrontmatterField('---\ndate: 100\ntags:\n  - a\n---\nBody', 'date', '200')
    ).toBe('---\ntags:\n  - a\ndate: 200\n---\nBody')
    // Adds a second field
    expect(upsertFrontmatterField('---\ndate: 100\n---\nBody', 'date_end', '900')).toBe(
      '---\ndate: 100\ndate_end: 900\n---\nBody'
    )
    // Removing the last field drops the block entirely
    expect(upsertFrontmatterField('---\ndate: 100\n---\nBody', 'date', null)).toBe('Body')
  })

  it('split and join round-trip content exactly', () => {
    const content = '---\ndate: 20 BC\ntags:\n  - a\n---\nBody line\nmore'
    const { frontmatter, body } = splitFrontmatter(content)
    expect(body).toBe('Body line\nmore')
    expect(joinFrontmatter(frontmatter, body)).toBe(content)
    expect(joinFrontmatter(frontmatter, 'edited body')).toBe(
      '---\ndate: 20 BC\ntags:\n  - a\n---\nedited body'
    )
    expect(joinFrontmatter(null, 'plain')).toBe('plain')
  })
})

describe('editing keeps the metadata header out of the editor', () => {
  function makeEditorNode(content: string): Node {
    return {
      id: 'n1',
      title: 'Alpha',
      file_path: null,
      markdown_content: content,
      node_type: 'note',
      canvas_x: 0,
      canvas_y: 0,
      width: 200,
      height: 120,
      z_index: 0,
      frame_id: null,
      color_theme: null,
      is_collapsed: false,
      tags: null,
      workspace_id: null,
      checksum: null,
      created_at: 0,
      updated_at: 0,
      deleted_at: null,
    }
  }

  it('shows only the body and restores the header on save', () => {
    const node = makeEditorNode('---\ndate: 20 BC\n---\nThe body')
    const updateNodeContent = vi.fn().mockResolvedValue(undefined)
    const editor = useNodeEditor({
      store: {
        getNode: () => node,
        updateNodeContent,
        updateNodeTitle: vi.fn().mockResolvedValue(undefined),
      },
    })

    editor.startEditing('n1')
    expect(editor.editContent.value).toBe('The body')

    editor.editContent.value = 'Edited body'
    editor.saveEditing()
    expect(updateNodeContent).toHaveBeenCalledWith('n1', '---\ndate: 20 BC\n---\nEdited body')
  })

  it('adds no header when the node never had one', () => {
    const node = makeEditorNode('Just text')
    const updateNodeContent = vi.fn().mockResolvedValue(undefined)
    const editor = useNodeEditor({
      store: {
        getNode: () => node,
        updateNodeContent,
        updateNodeTitle: vi.fn().mockResolvedValue(undefined),
      },
    })

    editor.startEditing('n1')
    editor.editContent.value = 'New text'
    editor.saveEditing()
    expect(updateNodeContent).toHaveBeenCalledWith('n1', 'New text')
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
      global: { plugins: [i18n, createPinia()] },
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

  it('surfaces OKF date and status frontmatter as chips', () => {
    const wrapper = mount(CanvasNodeCard, {
      props: {
        node: {
          id: 'n1',
          title: 'Alpha',
          node_type: 'note',
          markdown_content: '---\ndate: 800\ndate_end: 1800\nstatus: draft\n---\nBody',
          canvas_x: 0,
          canvas_y: 0,
          tags: null,
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
      global: { plugins: [i18n, createPinia()] },
    })
    expect(wrapper.find('.node-date-chip').text()).toBe('800 – 1800')
    expect(wrapper.find('.node-status-chip').text()).toBe('draft')
  })
})
