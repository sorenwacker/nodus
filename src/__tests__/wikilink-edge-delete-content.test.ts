/**
 * Deleting a wikilink edge edits the nodes that hold the link, as any edit does
 * (PRODUCT_DESIGN.md > Deleting a merged wikilink edge).
 *
 * The source node's text was rewritten with a raw backend call: no undo step
 * was recorded, and the checksum the backend returned was discarded, so the
 * watcher read the file back as an outside change. An undirected edge stands
 * for a link in each node, yet only the source's link was removed, and the
 * surviving link recreated the edge on the next sync.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useNodesStore } from '../stores/nodes'
import { useEdgesStore } from '../stores/edges'
import { setUndoSink, resetUndoRecorder, type ContentEntry } from '../stores/nodes/undoRecorder'
import type { Node, Edge } from '../types'

const localStorageMock = {
  store: {} as Record<string, string>,
  getItem: vi.fn((key: string) => localStorageMock.store[key] || null),
  setItem: vi.fn((key: string, value: string) => {
    localStorageMock.store[key] = value
  }),
  removeItem: vi.fn((key: string) => {
    delete localStorageMock.store[key]
  }),
  clear: vi.fn(() => {
    localStorageMock.store = {}
  }),
}
Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock })

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }))

vi.mock('@tauri-apps/api/core', () => ({
  invoke: invokeMock,
}))

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn().mockResolvedValue(() => {}),
}))

function makeNode(id: string, title: string, content: string): Node {
  return {
    id,
    title,
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
    checksum: 'sum-old',
    created_at: 0,
    updated_at: 0,
    deleted_at: null,
  } as Node
}

function wikilinkEdge(directed: boolean): Edge {
  return {
    id: 'e1',
    source_node_id: 'a',
    target_node_id: 'b',
    label: null,
    link_type: 'wikilink',
    weight: 1,
    color: null,
    storyline_id: null,
    created_at: 0,
    directed,
  } as Edge
}

let recorded: ContentEntry[][]

function seed(directed: boolean) {
  const store = useNodesStore()
  const alpha = makeNode('a', 'Alpha', 'See [[Beta]] here')
  const beta = makeNode('b', 'Beta', 'Back to [[Alpha]]')
  store.nodes.push(alpha, beta)
  useEdgesStore().edges.push(wikilinkEdge(directed))
  return { store, alpha: () => store.nodes.find(n => n.id === 'a')!, beta: () => store.nodes.find(n => n.id === 'b')! }
}

describe('deleting a wikilink edge', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    invokeMock.mockReset()
    invokeMock.mockImplementation(async (command: string) =>
      command === 'update_node_content' ? 'sum-new' : undefined
    )
    recorded = []
    setUndoSink({ pushContentsUndo: entries => recorded.push(entries) })
  })

  afterEach(() => {
    resetUndoRecorder()
    setUndoSink(null)
  })

  it('turns the link in the source into plain text', async () => {
    const { store, alpha } = seed(true)
    await store.deleteEdge('e1')
    expect(alpha().markdown_content).toBe('See Beta here')
  })

  it('records the rewrite as an undo step', async () => {
    const { store } = seed(true)
    await store.deleteEdge('e1')
    expect(recorded.flat()).toContainEqual({ nodeId: 'a', content: 'See [[Beta]] here', title: 'Alpha' })
  })

  it('keeps the checksum the backend returned, so the watcher does not read the file back', async () => {
    const { store, alpha } = seed(true)
    await store.deleteEdge('e1')
    expect(alpha().checksum).toBe('sum-new')
  })

  it('removes the link from both nodes when the edge is undirected, as one undo step', async () => {
    const { store, alpha, beta } = seed(false)
    await store.deleteEdge('e1')

    expect(alpha().markdown_content).toBe('See Beta here')
    expect(beta().markdown_content).toBe('Back to Alpha')
    expect(recorded).toHaveLength(1)
    expect(recorded[0].map(e => e.nodeId).sort()).toEqual(['a', 'b'])
  })

  it('leaves the target alone when the edge is directed', async () => {
    const { store, beta } = seed(true)
    await store.deleteEdge('e1')
    expect(beta().markdown_content).toBe('Back to [[Alpha]]')
  })
})
