import { describe, it, expect } from 'vitest'
import { exportToTypst, nodeToTypst, generateExportFilename } from '../lib/typst-export'
import type { Node, Edge } from '../types'

describe('Typst Export', () => {
  const createNode = (overrides: Partial<Node> = {}): Node => ({
    id: '1',
    title: 'Test Node',
    file_path: null,
    markdown_content: 'Test content',
    node_type: 'note',
    canvas_x: 100,
    canvas_y: 100,
    width: 200,
    height: 120,
    z_index: 0,
    frame_id: null,
    color_theme: null,
    is_collapsed: false,
    tags: null,
    workspace_id: null,
    checksum: null,
    created_at: Date.now(),
    updated_at: Date.now(),
    deleted_at: null,
    ...overrides,
  })

  describe('exportToTypst', () => {
    it('generates document with preamble', () => {
      const nodes = [createNode()]
      const result = exportToTypst(nodes, [])

      expect(result).toContain('#set page(')
      expect(result).toContain('#set text(')
      expect(result).toContain('paper: "a4"')
    })

    it('includes custom title and author', () => {
      const nodes = [createNode()]
      const result = exportToTypst(nodes, [], {
        title: 'My Research',
        author: 'John Doe',
        date: '2024-01-15',
      })

      expect(result).toContain('My Research')
      expect(result).toContain('John Doe')
      expect(result).toContain('2024-01-15')
    })

    it('converts note nodes', () => {
      const nodes = [
        createNode({
          title: 'Research Notes',
          markdown_content: '# Introduction\n\nThis is my research.',
        }),
      ]
      const result = exportToTypst(nodes, [])

      expect(result).toContain('== Research Notes')
      expect(result).toContain('= Introduction')
      expect(result).toContain('This is my research.')
    })

    it('converts citation nodes', () => {
      const nodes = [
        createNode({
          title: 'Einstein 1905',
          node_type: 'citation',
          markdown_content: '# Special Relativity\n\n**Albert Einstein** (1905)\n\n*Annalen der Physik*\n\nDOI: [10.1234/test](https://doi.org/10.1234/test)',
        }),
      ]
      const result = exportToTypst(nodes, [])

      expect(result).toContain('== Einstein 1905')
      expect(result).toContain('Albert Einstein')
      expect(result).toContain('1905')
    })

    it('includes connections section', () => {
      const nodes = [
        createNode({ id: '1', title: 'Node A' }),
        createNode({ id: '2', title: 'Node B', canvas_x: 300 }),
      ]
      const edges: Edge[] = [
        {
          id: 'e1',
          source_node_id: '1',
          target_node_id: '2',
          label: null,
          link_type: 'cites',
          weight: 1,
          created_at: Date.now(),
        },
      ]

      const result = exportToTypst(nodes, edges, { includeConnections: true })

      expect(result).toContain('= Connections')
      expect(result).toContain('== Cites')
      expect(result).toContain('Node A → Node B')
    })

    it('sorts nodes by position', () => {
      const nodes = [
        createNode({ id: '1', title: 'Bottom Right', canvas_x: 500, canvas_y: 500 }),
        createNode({ id: '2', title: 'Top Left', canvas_x: 0, canvas_y: 0 }),
        createNode({ id: '3', title: 'Middle', canvas_x: 250, canvas_y: 250 }),
      ]

      const result = exportToTypst(nodes, [])

      const topLeftPos = result.indexOf('Top Left')
      const middlePos = result.indexOf('Middle')
      const bottomRightPos = result.indexOf('Bottom Right')

      expect(topLeftPos).toBeLessThan(middlePos)
      expect(middlePos).toBeLessThan(bottomRightPos)
    })
  })

  describe('nodeToTypst', () => {
    it('converts single note node', () => {
      const node = createNode({
        title: 'Quick Note',
        markdown_content: 'Some **bold** and *italic* text.',
      })

      const result = nodeToTypst(node)

      expect(result).toContain('== Quick Note')
      expect(result).toContain('*bold*')
      expect(result).toContain('_italic_')
    })

    it('converts markdown links', () => {
      const node = createNode({
        title: 'Links',
        markdown_content: 'Check [this link](https://example.com) for more.',
      })

      const result = nodeToTypst(node)

      expect(result).toContain('#link("https://example.com")[this link]')
    })
  })

  describe('generateExportFilename', () => {
    it('generates filename from title', () => {
      const filename = generateExportFilename('My Research Paper')
      expect(filename).toMatch(/^my-research-paper-\d{4}-\d{2}-\d{2}\.typ$/)
    })

    it('handles empty title', () => {
      const filename = generateExportFilename()
      expect(filename).toMatch(/^nodus-export-\d{4}-\d{2}-\d{2}\.typ$/)
    })

    it('sanitizes special characters', () => {
      const filename = generateExportFilename('Test: A "Special" Title!')
      expect(filename).not.toContain(':')
      expect(filename).not.toContain('"')
      expect(filename).not.toContain('!')
    })
  })

  describe('Markdown to Typst conversion', () => {
    it('converts headings', () => {
      const node = createNode({
        title: 'Doc',
        markdown_content: '# H1\n## H2\n### H3',
      })

      const result = nodeToTypst(node)

      expect(result).toContain('= H1')
      expect(result).toContain('== H2')
      expect(result).toContain('=== H3')
    })

    it('converts blockquotes', () => {
      const node = createNode({
        title: 'Quotes',
        markdown_content: '> This is a quote',
      })

      const result = nodeToTypst(node)

      expect(result).toContain('#quote[This is a quote]')
    })

    it('converts ordered lists', () => {
      const node = createNode({
        title: 'List',
        markdown_content: '1. First\n2. Second\n3. Third',
      })

      const result = nodeToTypst(node)

      expect(result).toContain('+ First')
      expect(result).toContain('+ Second')
    })
  })
})
