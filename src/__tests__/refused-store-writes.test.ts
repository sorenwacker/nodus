/**
 * The canvas shows what is stored
 * (PRODUCT_DESIGN.md > A write the backend refused).
 *
 * A create the backend refused pushed a locally generated node or edge, marked
 * as a development fallback, into the desktop app too: it could be linked and
 * edited, then vanished on the next load and took those links with it. A
 * refused single-node delete removed the node from view anyway, so it came
 * back on the next load. The user was told about neither.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useNodesStore } from '../stores/nodes'
import { useEdgesStore } from '../stores/edges'
import { notifications$ } from '../composables/useNotifications'
import type { Node } from '../types'

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

function makeNode(id: string): Node {
  return {
    id,
    title: id,
    file_path: null,
    markdown_content: '',
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
  } as Node
}

const refused = new Error('UNIQUE constraint failed')

describe('in the desktop app', () => {
  let notifyError: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    ;(window as unknown as Record<string, unknown>).__TAURI__ = {}
    setActivePinia(createPinia())
    invokeMock.mockReset()
    invokeMock.mockRejectedValue(refused)
    notifyError = vi.spyOn(notifications$, 'error')
  })

  afterEach(() => {
    delete (window as unknown as Record<string, unknown>).__TAURI__
    notifyError.mockRestore()
  })

  it('adds no node when the backend refuses to create it, and says so', async () => {
    const store = useNodesStore()
    const before = store.nodes.length

    await expect(store.createNode({ title: 'Orphan', canvas_x: 0, canvas_y: 0 })).rejects.toThrow()

    expect(store.nodes.length).toBe(before)
    expect(notifyError).toHaveBeenCalled()
  })

  it('adds no edge when the backend refuses to create it, and says so', async () => {
    const nodes = useNodesStore()
    nodes.nodes.push(makeNode('a'), makeNode('b'))
    expect(nodes.nodes.map(n => n.id), 'precondition: both endpoints exist').toEqual(['a', 'b'])
    const edges = useEdgesStore()
    const before = edges.edges.length

    await expect(edges.createEdge({ source_node_id: 'a', target_node_id: 'b' })).rejects.toThrow(refused.message)

    expect(edges.edges.length).toBe(before)
    expect(notifyError).toHaveBeenCalled()
  })

  it('keeps a node on the canvas when the backend refuses to delete it, and says so', async () => {
    const store = useNodesStore()
    store.nodes.push(makeNode('keep'))
    expect(store.nodes.some(n => n.id === 'keep'), 'precondition: node on the canvas').toBe(true)

    await expect(store.deleteNode('keep')).rejects.toThrow()

    expect(store.nodes.some(n => n.id === 'keep')).toBe(true)
    expect(notifyError).toHaveBeenCalled()
  })
})

describe('in the browser build, which has no backend', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    invokeMock.mockReset()
    invokeMock.mockRejectedValue(new Error('Mock: No backend'))
  })

  it('still creates nodes locally, so the interface can be developed without the desktop shell', async () => {
    const store = useNodesStore()
    const node = await store.createNode({ title: 'Local', canvas_x: 0, canvas_y: 0 })

    expect(store.nodes.some(n => n.id === node.id)).toBe(true)
  })
})
