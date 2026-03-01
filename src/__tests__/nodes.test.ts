import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useNodesStore } from '../stores/nodes'

// Mock Tauri invoke
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockRejectedValue(new Error('Mock: No backend')),
}))

describe('Nodes Store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  describe('initialize', () => {
    it('should create fallback mock nodes when backend unavailable', async () => {
      const store = useNodesStore()
      await store.initialize()

      expect(store.nodes.length).toBe(2)
      expect(store.edges.length).toBe(1)
    })
  })

  describe('getNode', () => {
    it('should return node by id', async () => {
      const store = useNodesStore()
      await store.initialize()

      const node = store.getNode('1')
      expect(node).toBeDefined()
      expect(node?.title).toBe('Welcome to Nodus')
    })

    it('should return undefined for non-existent id', async () => {
      const store = useNodesStore()
      await store.initialize()

      const node = store.getNode('non-existent')
      expect(node).toBeUndefined()
    })
  })

  describe('updateNodePosition', () => {
    it('should update node canvas position', async () => {
      const store = useNodesStore()
      await store.initialize()

      await store.updateNodePosition('1', 500, 300)

      const node = store.getNode('1')
      expect(node?.canvas_x).toBe(500)
      expect(node?.canvas_y).toBe(300)
    })

    it('should update timestamp on position change', async () => {
      const store = useNodesStore()
      await store.initialize()

      const before = store.getNode('1')?.updated_at
      await store.updateNodePosition('1', 500, 300)
      const after = store.getNode('1')?.updated_at

      expect(after).toBeGreaterThanOrEqual(before!)
    })
  })

  describe('createNode', () => {
    it('should create a new node with defaults', async () => {
      const store = useNodesStore()
      await store.initialize()

      const node = await store.createNode({
        title: 'New Node',
        node_type: 'note',
        canvas_x: 200,
        canvas_y: 200,
      })

      expect(node.id).toBeDefined()
      expect(node.title).toBe('New Node')
      expect(node.node_type).toBe('note')
      expect(node.width).toBe(200)
      expect(store.nodes.length).toBe(3)
    })
  })

  describe('deleteNode', () => {
    it('should remove node and connected edges', async () => {
      const store = useNodesStore()
      await store.initialize()

      await store.deleteNode('1')

      expect(store.nodes.length).toBe(1)
      expect(store.edges.length).toBe(0)
    })
  })

  describe('selectNode', () => {
    it('should set selected node id', async () => {
      const store = useNodesStore()
      await store.initialize()

      store.selectNode('1')
      expect(store.selectedNodeId).toBe('1')
      expect(store.selectedNode?.id).toBe('1')
    })

    it('should clear selection with null', async () => {
      const store = useNodesStore()
      await store.initialize()

      store.selectNode('1')
      store.selectNode(null)

      expect(store.selectedNodeId).toBeNull()
      expect(store.selectedNode).toBeUndefined()
    })
  })

  describe('createEdge', () => {
    it('should create a new edge', async () => {
      const store = useNodesStore()
      await store.initialize()

      const edge = await store.createEdge({
        source_node_id: '1',
        target_node_id: '2',
        link_type: 'cites',
      })

      expect(edge.id).toBeDefined()
      expect(edge.link_type).toBe('cites')
      expect(store.edges.length).toBe(2)
    })
  })

  describe('deleteEdge', () => {
    it('should remove edge', async () => {
      const store = useNodesStore()
      await store.initialize()

      await store.deleteEdge('e1')

      expect(store.edges.length).toBe(0)
    })
  })
})
