/**
 * Copy and paste operate on the current selection and the current clipboard.
 *
 * Two defects: the composable captured the selection array once at
 * construction, and the store reassigns that array rather than mutating it, so
 * copy silently copied nothing after the first selection change. And DOI
 * detection ran before the Nodus JSON parse, so copying a citation node (whose
 * markdown contains a DOI) and pasting it fetched a paper instead of
 * duplicating the nodes.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useNodeClipboard } from '../canvas/composables/nodes/useNodeClipboard'

let clipboardText = ''
vi.mock('@tauri-apps/plugin-clipboard-manager', () => ({
  readText: () => Promise.resolve(clipboardText),
  writeText: (t: string) => {
    clipboardText = t
    return Promise.resolve()
  },
}))

function harness() {
  const state = { selectedNodeIds: [] as string[] }
  const nodes = new Map([
    ['a', { id: 'a', title: 'Paper', markdown_content: 'See doi: 10.1234/abcd.5678 for details', canvas_x: 0, canvas_y: 0, width: 200, height: 120, color_theme: null }],
  ])
  const created: Array<Record<string, unknown>> = []
  return {
    state,
    created,
    clipboard: useNodeClipboard({
      store: {
        getSelectedNodeIds: () => state.selectedNodeIds,
        getNode: (id: string) => nodes.get(id) as never,
        getFilteredEdges: () => [],
        createNode: async (data: Record<string, unknown>) => {
          created.push(data)
          return { id: `new${created.length}` }
        },
        createEdge: vi.fn().mockResolvedValue(undefined),
        setSelectedNodeIds: (ids: string[]) => {
          state.selectedNodeIds = ids
        },
      } as never,
      screenToCanvas: () => ({ x: 500, y: 500 }),
      getViewportSize: () => ({ width: 1200, height: 800 }),
    } as never),
  }
}

describe('copying the current selection', () => {
  beforeEach(() => {
    clipboardText = ''
  })

  it('copies nodes selected after the composable was created', async () => {
    const h = harness()
    // The store replaces the array rather than mutating it
    h.state.selectedNodeIds = ['a']

    await h.clipboard.copySelectedNodes()

    expect(clipboardText, 'nothing was written to the clipboard').toContain('nodus-nodes')
    expect(clipboardText).toContain('Paper')
  })
})

describe('pasting Nodus content', () => {
  it('duplicates copied nodes even when their text contains a DOI', async () => {
    const h = harness()
    h.state.selectedNodeIds = ['a']
    await h.clipboard.copySelectedNodes()

    const pasted = await h.clipboard.pasteNodes()

    // A citation node's own markdown carries a DOI; that must not turn a
    // paste of Nodus content into a paper lookup
    expect(pasted).toHaveLength(1)
    expect(h.created[0]).toMatchObject({ title: expect.stringContaining('Paper') })
  })
})
