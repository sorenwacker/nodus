import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useNodesStore } from '../stores/nodes'
import { useEdgesStore } from '../stores/edges'
import type { Node, Edge } from '../types'

// Mock localStorage
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

function makeNode(id: string, title: string): Node {
  return {
    id,
    title,
    file_path: null,
    markdown_content: null,
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

describe('updateNodeContent wikilink sync', () => {
  beforeEach(() => {
    localStorageMock.clear()
    setActivePinia(createPinia())
    invokeMock.mockReset()
  })

  it('delegates wikilink resolution to the backend and reloads edges', async () => {
    const backendEdge: Edge = {
      id: 'e1',
      source_node_id: 'a',
      target_node_id: 'b',
      label: null,
      link_type: 'wikilink',
      weight: 1,
      color: null,
      storyline_id: null,
      created_at: 0,
      directed: true,
    }
    invokeMock.mockImplementation((command: string) => {
      switch (command) {
        case 'update_node_content':
          return Promise.resolve(null)
        case 'sync_node_wikilinks':
          return Promise.resolve(1)
        case 'merge_bidirectional_edges':
          return Promise.resolve(0)
        case 'get_edges':
          return Promise.resolve([backendEdge])
        default:
          return Promise.reject(new Error(`Mock: unhandled ${command}`))
      }
    })

    const store = useNodesStore()
    const edgesStore = useEdgesStore()
    store.nodes.push(makeNode('a', 'alpha'), makeNode('b', 'beta'))

    // A folder/note path link: unresolvable by title matching, but the
    // backend resolver handles it
    await store.updateNodeContent('a', 'see [[concepts/beta]]')

    expect(invokeMock).toHaveBeenCalledWith('sync_node_wikilinks', { nodeId: 'a' })
    expect(edgesStore.edges.map((e: Edge) => e.id)).toEqual(['e1'])
  })

  it('falls back to title-based resolution without a backend', async () => {
    invokeMock.mockRejectedValue(new Error('Mock: No backend'))

    const store = useNodesStore()
    const edgesStore = useEdgesStore()
    store.nodes.push(makeNode('a', 'alpha'), makeNode('b', 'beta'))

    await store.updateNodeContent('a', 'see [[beta]]')

    const created = edgesStore.edges.find(
      (e: Edge) =>
        e.source_node_id === 'a' && e.target_node_id === 'b' && e.link_type === 'wikilink'
    )
    expect(created).toBeDefined()
  })
})
