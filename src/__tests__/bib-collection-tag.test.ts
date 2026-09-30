/**
 * A Zotero collection groups its citations by tag
 * (docs/design/remove-frames.md > Imports that created frames).
 *
 * The import drew a frame around the citations of a collection. Frames are
 * removed; the collection name becomes a tag on each citation instead, when
 * the import options ask for it.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../lib/tauri', () => ({
  readTextFile: vi.fn(async () =>
    JSON.stringify([
      { id: 'a', type: 'article-journal', title: 'First paper', collections: ['Protein Folding'] },
      { id: 'b', type: 'article-journal', title: 'Second paper', collections: ['Protein Folding'] },
    ])
  ),
  extractPdfText: vi.fn(),
  extractPdfAnnotations: vi.fn(),
}))
vi.mock('@tauri-apps/api/webview', () => ({ getCurrentWebview: vi.fn() }))
vi.mock('@tauri-apps/api/window', () => ({ getCurrentWindow: vi.fn() }))

import { usePdfDrop } from '../canvas/composables/util/usePdfDrop'

let created: Array<{ title: string; tags?: string[] }> = []

function drop() {
  return usePdfDrop({
    store: {
      createNode: async (data: { title: string; tags?: string[] }) => {
        created.push(data)
        return { id: `n${created.length}` }
      },
      updateNodeContent: vi.fn(),
      updateNodeTitle: vi.fn(),
      deleteNode: vi.fn(),
      createEdge: vi.fn(),
      importOntology: vi.fn(),
    },
    viewState: { getViewportCenter: () => ({ x: 0, y: 0 }) },
    llm: {} as never,
  } as never)
}

beforeEach(() => {
  created = []
})

describe('importing a Zotero collection', () => {
  it('tags each citation with the collection when asked', async () => {
    await drop().processBibDrop('/tmp/export.json', 0, 0, { tagCollection: true })

    expect(created.map(n => n.tags)).toEqual([['protein-folding'], ['protein-folding']])
  })

  it('leaves the citations untagged when not asked', async () => {
    await drop().processBibDrop('/tmp/export.json', 0, 0, { tagCollection: false })

    expect(created.every(n => !n.tags || n.tags.length === 0)).toBe(true)
  })
})
