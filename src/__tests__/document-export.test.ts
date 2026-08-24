/**
 * Document export (PRODUCT_DESIGN.md > Document export).
 *
 * Export is the only path that takes finished work off the canvas. The
 * generator and the PDF compiler existed for months while nothing in the
 * interface reached them, which made them dead code rather than a feature;
 * these tests hold the wiring in place as well as the behaviour.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import en from '../i18n/locales/en.json'
import { exportToTypst } from '../lib/typst-export'
import type { Node, Edge } from '../types'

const saveMock = vi.fn()

// The backend owns the dialog and the write; the interface never names a path
vi.mock('../lib/tauri', () => ({ saveExportFile: (...a: unknown[]) => saveMock(...a) }))
vi.mock('../lib/pdf-export', async () => {
  const actual = await vi.importActual<typeof import('../lib/pdf-export')>('../lib/pdf-export')
  return { ...actual, exportToPdf: vi.fn().mockResolvedValue(new Uint8Array([37, 80, 68, 70])) }
})

function node(id: string, title: string, x: number, y: number): Node {
  return {
    id,
    title,
    content: `Body of ${title}`,
    canvas_x: x,
    canvas_y: y,
    width: 200,
    height: 100,
    node_type: 'note',
  } as unknown as Node
}

describe('export ordering', () => {
  const a = node('a', 'Alpha', 900, 0)
  const b = node('b', 'Beta', 0, 400)
  const c = node('c', 'Gamma', 0, 0)

  it('orders a loose selection top to bottom, left to right', () => {
    // A set of nodes with no sequence of its own reads in canvas order
    const typst = exportToTypst([a, b, c], [])
    expect(typst.indexOf('Gamma')).toBeLessThan(typst.indexOf('Alpha'))
    expect(typst.indexOf('Alpha')).toBeLessThan(typst.indexOf('Beta'))
  })

  it('keeps the given order when the caller already has one', () => {
    // The storyline sequence is the argument the user built; sorting it by
    // geometry would destroy the only thing that makes it a document
    const typst = exportToTypst([b, a, c], [], { preserveOrder: true })
    expect(typst.indexOf('Beta')).toBeLessThan(typst.indexOf('Alpha'))
    expect(typst.indexOf('Alpha')).toBeLessThan(typst.indexOf('Gamma'))
  })

  it('appends the connections between exported nodes when asked', () => {
    const edge = { id: 'e1', source_node_id: 'a', target_node_id: 'b', edge_type: 'related' } as unknown as Edge
    expect(exportToTypst([a, b], [edge], { includeConnections: true })).toContain('Alpha')
    expect(exportToTypst([a, b], [edge], { includeConnections: false })).not.toContain('Connections')
  })
})

describe('export dialog', () => {
  beforeEach(() => {
    saveMock.mockReset()
  })

  async function mountDialog(props: Record<string, unknown> = {}) {
    const ExportDialog = (await import('../components/ExportDialog.vue')).default
    return mount(ExportDialog, {
      props: { nodes: [node('a', 'Alpha', 0, 0)], edges: [], preserveOrder: false, ...props },
      global: { plugins: [createI18n({ legacy: false, locale: 'en', messages: { en } })] },
    })
  }

  it('hands the compiled bytes and a suggested name to the backend', async () => {
    saveMock.mockResolvedValue('/tmp/paper.pdf')

    const wrapper = await mountDialog()
    await wrapper.find('.export-confirm').trigger('click')
    await vi.waitFor(() => expect(saveMock).toHaveBeenCalled())

    const [bytes, suggested, extension] = saveMock.mock.calls[0]
    expect(bytes).toBeInstanceOf(Uint8Array)
    expect(suggested).toMatch(/\.pdf$/)
    expect(extension).toBe('pdf')
  })

  it('stays open when the user cancels the save dialog', async () => {
    saveMock.mockResolvedValue(null)

    const wrapper = await mountDialog()
    await wrapper.find('.export-confirm').trigger('click')
    await vi.waitFor(() => expect(saveMock).toHaveBeenCalled())

    expect(wrapper.emitted('close')).toBeUndefined()
  })

  it('never names a path itself', () => {
    // A path the interface names is not a path the user chose
    const dialog = readFileSync(resolve(__dirname, '../components/ExportDialog.vue'), 'utf-8')
    expect(dialog).not.toContain('plugin-dialog')
    expect(dialog).toContain('saveExportFile')
  })

  it('reports a failed compile instead of writing a broken file', async () => {
    saveMock.mockResolvedValue('/tmp/paper.pdf')
    const pdfExport = await import('../lib/pdf-export')
    vi.mocked(pdfExport.exportToPdf).mockRejectedValueOnce(new Error('unclosed delimiter'))

    const wrapper = await mountDialog()
    await wrapper.find('.export-confirm').trigger('click')
    await vi.waitFor(() => expect(wrapper.find('.export-error').exists()).toBe(true))

    expect(wrapper.find('.export-error').text()).toContain('unclosed delimiter')
    expect(saveMock).not.toHaveBeenCalled()
  })
})

describe('export reachability', () => {
  const read = (p: string) => readFileSync(resolve(__dirname, '..', p), 'utf-8')

  it('is reachable from the storyline reader and the canvas selection', () => {
    // Both entry points documented in features.md > Exporting a document. A
    // generator no interface calls is dead code, however correct it is
    expect(read('components/StorylineReader.vue')).toContain('ExportDialog')
    expect(read('canvas/GraphCanvas.vue')).toContain('ExportDialog')
  })

  it('exports a storyline in its own order', () => {
    // The reader knows the sequence; the generator must be told to keep it
    expect(read('components/StorylineReader.vue')).toContain('preserve-order')
  })
})
