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

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockRejectedValue(new Error('Mock: No backend')),
}))

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn().mockResolvedValue(() => {}),
}))

function makeNode(id: string, nodeType = 'note'): Node {
  return {
    id,
    title: id,
    file_path: null,
    markdown_content: null,
    node_type: nodeType,
    canvas_x: 0,
    canvas_y: 0,
    width: 200,
    height: 120,
    z_index: 0,
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

function makeEdge(id: string, source: string, target: string, linkType = 'wikilink'): Edge {
  return {
    id,
    source_node_id: source,
    target_node_id: target,
    label: null,
    link_type: linkType,
    weight: 1,
    color: null,
    storyline_id: null,
    created_at: 0,
    directed: true,
  }
}

describe('graphEdges', () => {
  beforeEach(() => {
    localStorageMock.clear()
    setActivePinia(createPinia())
  })

  it('excludes edges whose endpoint node no longer exists', () => {
    const store = useNodesStore()
    const edgesStore = useEdgesStore()

    store.nodes.push(makeNode('a'), makeNode('b'))
    edgesStore.edges.push(
      makeEdge('e1', 'a', 'b'),
      makeEdge('e2', 'a', 'trashed'),
      makeEdge('e3', 'trashed', 'b')
    )

    expect(store.graphEdges.map((e: Edge) => e.id)).toEqual(['e1'])
  })

  it('keeps edges regardless of category visibility toggles', () => {
    const store = useNodesStore()
    const edgesStore = useEdgesStore()

    store.nodes.push(makeNode('a'), makeNode('b'))
    edgesStore.edges.push(makeEdge('e1', 'a', 'b', 'wikilink'))
    store.showWikilinkEdges = false

    expect(store.filteredEdges).toEqual([])
    expect(store.graphEdges.map((e: Edge) => e.id)).toEqual(['e1'])
  })
})

describe('the graph as data while the tag layer is hidden', () => {
  // The tag layer toggle is a view choice. The MCP adapter read nodes through
  // the canvas filter, so with the layer hidden - the default - an unscoped
  // connection listed no tag nodes and, since the data edges derived from
  // those nodes, no tagged edges either
  // (PRODUCT_DESIGN.md > MCP reads are independent of the canvas layers)
  beforeEach(() => {
    localStorageMock.clear()
    setActivePinia(createPinia())
  })

  it('graphNodes keeps tag nodes that filteredNodes hides', () => {
    const store = useNodesStore()
    store.nodes.push(makeNode('a'), makeNode('#tag', 'tag'))
    store.showTagEdges = false

    expect(store.filteredNodes.map((n: Node) => n.id)).toEqual(['a'])
    expect(store.graphNodes.map((n: Node) => n.id)).toEqual(['a', '#tag'])
  })

  it('graphEdges keeps the tagged edges of hidden tag nodes', () => {
    const store = useNodesStore()
    const edgesStore = useEdgesStore()
    store.nodes.push(makeNode('a'), makeNode('#tag', 'tag'))
    edgesStore.edges.push(makeEdge('t1', 'a', '#tag', 'tagged'))
    store.showTagEdges = false

    expect(store.filteredEdges).toEqual([])
    expect(store.graphEdges.map((e: Edge) => e.id)).toEqual(['t1'])
  })

  it('graphNodes still stops at the workspace boundary', () => {
    const store = useNodesStore()
    const elsewhere = { ...makeNode('b', 'tag'), workspace_id: 'other' }
    store.nodes.push(makeNode('a'), elsewhere)

    expect(store.graphNodes.map((n: Node) => n.id)).toEqual(['a'])
  })
})

describe('nodes store exposes the edge operations its consumers use', () => {
  it('surfaces updateEdgeLabel, not just updateEdgeColor', async () => {
    // The canvas and the agent both receive store.updateEdgeLabel; when the
    // store did not export it they silently received undefined
    const { setActivePinia, createPinia } = await import('pinia')
    setActivePinia(createPinia())
    const { useNodesStore } = await import('../stores/nodes')

    const store = useNodesStore()
    for (const method of ['updateEdgeLabel', 'updateEdgeColor', 'updateEdgeDirected', 'updateEdgeLinkType']) {
      expect(typeof (store as unknown as Record<string, unknown>)[method], `${method} missing`).toBe(
        'function'
      )
    }
  })
})
