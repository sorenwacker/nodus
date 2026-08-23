/**
 * PDF highlights as nodes (PRODUCT_DESIGN.md > PDF highlights as nodes).
 *
 * The highlights in a PDF are the passages a reader already judged worth
 * keeping. Re-typing them onto the canvas is work they have done once already.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import en from '../i18n/locales/en.json'
import {
  toHighlightImports,
  highlightKey,
  highlightNodeContent,
  importedHighlightKeys,
} from '../lib/pdfHighlights'
import type { PdfAnnotation } from '../lib/tauri'
import type { Node } from '../types'

const i18n = () => createI18n({ legacy: false, locale: 'en', messages: { en } })

function annotation(partial: Partial<PdfAnnotation> = {}): PdfAnnotation {
  return {
    annotation_type: 'highlight',
    content: 'a passage worth keeping',
    comment: null,
    page: 3,
    color: '#ffe533',
    created_at: null,
    ...partial,
  }
}

describe('highlight selection', () => {
  it('offers a highlight whose text the file stores', () => {
    const [entry] = toHighlightImports([annotation()], 'paper.pdf', [])

    expect(entry.available).toBe(true)
    expect(entry.text).toBe('a passage worth keeping')
    expect(entry.page).toBe(3)
    expect(entry.color).toBe('#ffe533')
  })

  it('marks a highlight the file has no text for as unavailable', () => {
    // macOS Preview records only the marked region. An empty node would be
    // worse than saying why the passage is missing
    const [entry] = toHighlightImports([annotation({ content: '', comment: null })], 'paper.pdf', [])

    expect(entry.available).toBe(false)
    expect(entry.text).toBe('')
  })

  it('uses the reader comment when the passage itself is not stored', () => {
    const [entry] = toHighlightImports(
      [annotation({ content: '', comment: 'this contradicts section 2' })],
      'paper.pdf',
      []
    )

    expect(entry.available).toBe(true)
    expect(entry.text).toBe('this contradicts section 2')
  })

  it('does not offer a highlight that was already imported', () => {
    const existing = [
      { markdown_content: `---\nsource_highlight: ${highlightKey('paper.pdf', annotation())}\n---\n\nx` },
    ] as Node[]

    const entries = toHighlightImports([annotation()], 'paper.pdf', importedHighlightKeys(existing))

    expect(entries[0].alreadyImported).toBe(true)
  })

  it('keys a highlight by file, page and text so the same passage is one highlight', () => {
    const same = highlightKey('paper.pdf', annotation())
    expect(highlightKey('paper.pdf', annotation())).toBe(same)
    expect(highlightKey('other.pdf', annotation())).not.toBe(same)
    expect(highlightKey('paper.pdf', annotation({ page: 4 }))).not.toBe(same)
  })
})

describe('highlight node content', () => {
  it('keeps the passage, the comment and a key that survives the session', () => {
    const content = highlightNodeContent('paper.pdf', annotation({ comment: 'central claim' }))

    expect(content).toContain('a passage worth keeping')
    expect(content).toContain('central claim')
    expect(content).toContain('source_highlight:')
    expect(content).toContain('paper.pdf')
  })

  it('round-trips through the frontmatter it writes', () => {
    const annot = annotation()
    const node = { markdown_content: highlightNodeContent('paper.pdf', annot) } as Node

    expect(importedHighlightKeys([node]).has(highlightKey('paper.pdf', annot))).toBe(true)
  })
})

describe('highlight picker', () => {
  const annotations = [annotation(), annotation({ content: '', comment: null, page: 5 })]

  beforeEach(() => vi.clearAllMocks())

  async function mountPicker() {
    const PdfHighlightPicker = (await import('../components/PdfHighlightPicker.vue')).default
    return mount(PdfHighlightPicker, {
      props: { entries: toHighlightImports(annotations, 'paper.pdf', []), filename: 'paper.pdf' },
      global: { plugins: [i18n()] },
    })
  }

  it('lists every highlight found, importable or not', async () => {
    const wrapper = await mountPicker()
    expect(wrapper.findAll('.highlight-row')).toHaveLength(2)
  })

  it('cannot select the one that has no text', async () => {
    const wrapper = await mountPicker()
    const boxes = wrapper.findAll('.highlight-row input[type="checkbox"]')

    expect((boxes[1].element as HTMLInputElement).disabled).toBe(true)
  })

  it('imports only what the reader chose', async () => {
    const wrapper = await mountPicker()
    // Everything importable starts selected; deselecting the only one leaves nothing
    await wrapper.findAll('.highlight-row input[type="checkbox"]')[0].setValue(false)
    await wrapper.find('.highlight-confirm').trigger('click')

    expect(wrapper.emitted('import')?.[0][0]).toEqual([])
  })
})

describe('highlight import reachability', () => {
  it('runs when a PDF is dropped on the canvas', () => {
    // Extraction existed in the backend for months with no way to reach it
    const drop = readFileSync(
      resolve(__dirname, '../canvas/composables/util/usePdfDrop.ts'),
      'utf-8'
    )
    expect(drop).toContain('extractPdfAnnotations')

    const canvas = readFileSync(resolve(__dirname, '../canvas/PixiCanvas.vue'), 'utf-8')
    expect(canvas).toContain('PdfHighlightPicker')
  })
})

describe('pdf import resilience', () => {
  it('keeps the extracted text when the language model cannot be reached', () => {
    // Extraction is the import; cleanup only makes it nicer. A failed request
    // must not discard text that was read successfully
    const source = readFileSync(
      resolve(__dirname, '../canvas/composables/util/usePdfDrop.ts'),
      'utf-8'
    )
    const cleanup = source.slice(source.indexOf('async function cleanupChunk'))
    const body = cleanup.slice(0, cleanup.indexOf('\n  }'))

    expect(body).toContain('catch')
    expect(body).toContain('return preprocessed')
  })
})

describe('pdf cleanup sections', () => {
  it('sends sections short enough to survive a gateway idle timeout', () => {
    // A 15k-character section asks for thousands of output tokens: minutes of
    // generation, which gateways cut mid-response
    // (PRODUCT_DESIGN.md > PDF text cleanup)
    const source = readFileSync(
      resolve(__dirname, '../canvas/composables/util/usePdfDrop.ts'),
      'utf-8'
    )
    const declared = source.match(/const MAX_CLEANUP_SIZE = (\d+)/)

    expect(declared, 'MAX_CLEANUP_SIZE is not declared').toBeTruthy()
    expect(Number(declared![1])).toBeLessThanOrEqual(6000)
  })

  it('counts the sections that fell back so the node can say so', () => {
    const source = readFileSync(
      resolve(__dirname, '../canvas/composables/util/usePdfDrop.ts'),
      'utf-8'
    )

    expect(source).toContain('cleanupFailures')
  })
})
