import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Node, Edge } from '../types'

// Mock the Typst module
vi.mock('@myriaddreamin/typst.ts', () => ({
  $typst: {
    pdf: vi.fn().mockResolvedValue(new Uint8Array([0x25, 0x50, 0x44, 0x46])), // %PDF magic bytes
  },
}))

// Import after mocking
import { exportToPdf, downloadTypst } from '../lib/pdf-export'
import { exportToTypst } from '../lib/typst-export'

describe('PDF Export', () => {
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

  describe('exportToPdf', () => {
    it('should compile Typst to PDF', async () => {
      const nodes = [createNode()]
      const pdf = await exportToPdf(nodes, [])

      expect(pdf).toBeInstanceOf(Uint8Array)
      expect(pdf.length).toBeGreaterThan(0)
    })

    it('should include title and author in export', async () => {
      const nodes = [createNode()]
      const pdf = await exportToPdf(nodes, [], {
        title: 'My Research',
        author: 'John Doe',
      })

      expect(pdf).toBeInstanceOf(Uint8Array)
    })
  })

  describe('exportToTypst (for PDF)', () => {
    it('generates valid Typst source for PDF compilation', () => {
      const nodes = [
        createNode({
          title: 'Introduction',
          markdown_content: '# Overview\n\nThis is the introduction.',
        }),
      ]

      const typst = exportToTypst(nodes, [])

      // Verify essential Typst elements for PDF
      expect(typst).toContain('#set page(')
      expect(typst).toContain('#set text(')
      expect(typst).toContain('== Introduction')
      expect(typst).toContain('= Overview')
    })

    it('handles multiple nodes with edges', () => {
      const nodes = [
        createNode({ id: '1', title: 'Chapter 1', canvas_x: 0, canvas_y: 0 }),
        createNode({ id: '2', title: 'Chapter 2', canvas_x: 300, canvas_y: 0 }),
      ]
      const edges: Edge[] = [
        {
          id: 'e1',
          source_node_id: '1',
          target_node_id: '2',
          label: null,
          link_type: 'related',
          weight: 1,
          color: null,
          storyline_id: null,
          created_at: Date.now(),
        },
      ]

      const typst = exportToTypst(nodes, edges, { includeConnections: true })

      expect(typst).toContain('== Chapter 1')
      expect(typst).toContain('== Chapter 2')
      expect(typst).toContain('= Connections')
    })

    it('handles special characters in title', () => {
      const nodes = [
        createNode({
          title: 'Test $pecial Ch@racters',
          markdown_content: 'Regular content here',
        }),
      ]

      const typst = exportToTypst(nodes, [])

      // Title special chars should be escaped
      expect(typst).toContain('\\$pecial')
      expect(typst).toContain('\\@racters')
    })

    it('converts citations correctly', () => {
      const nodes = [
        createNode({
          title: 'Smith 2024',
          node_type: 'citation',
          markdown_content: '# Machine Learning Study\n\n**John Smith** (2024)\n\n*Nature Journal*\n\nDOI: [10.1234/test](https://doi.org/10.1234/test)',
        }),
      ]

      const typst = exportToTypst(nodes, [])

      expect(typst).toContain('== Smith 2024')
      expect(typst).toContain('John Smith')
      expect(typst).toContain('2024')
    })
  })

  describe('downloadTypst', () => {
    let mockAnchor: { href: string; download: string; click: () => void }

    beforeEach(() => {
      // Create mock anchor element
      mockAnchor = { href: '', download: '', click: vi.fn() }

      // Mock document.createElement to return our mock anchor
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.spyOn(document, 'createElement').mockReturnValue(mockAnchor as any)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.spyOn(document.body, 'appendChild').mockImplementation(() => mockAnchor as any)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.spyOn(document.body, 'removeChild').mockImplementation(() => mockAnchor as any)

      // Mock URL methods
      vi.stubGlobal('URL', {
        ...URL,
        createObjectURL: vi.fn().mockReturnValue('blob:test'),
        revokeObjectURL: vi.fn(),
      })
    })

    it('creates downloadable Typst file', () => {
      const nodes = [createNode()]

      downloadTypst(nodes, [])

      expect(mockAnchor.click).toHaveBeenCalled()
      expect(mockAnchor.download).toMatch(/\.typ$/)
    })

    it('uses custom filename when provided', () => {
      const nodes = [createNode()]

      downloadTypst(nodes, [], { filename: 'my-export' })

      expect(mockAnchor.download).toBe('my-export.typ')
    })
  })
})
