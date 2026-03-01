import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useNodesStore } from '../stores/nodes'

describe('Nodes Store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  describe('initialize', () => {
    it('should create initial mock nodes', () => {
      const store = useNodesStore()
      store.initialize()

      expect(store.nodes.length).toBe(2)
      expect(store.edges.length).toBe(1)
    })
  })

  describe('getNode', () => {
    it('should return node by id', () => {
      const store = useNodesStore()
      store.initialize()

      const node = store.getNode('1')
      expect(node).toBeDefined()
      expect(node?.title).toBe('Welcome to Nodus')
    })

    it('should return undefined for non-existent id', () => {
      const store = useNodesStore()
      store.initialize()

      const node = store.getNode('non-existent')
      expect(node).toBeUndefined()
    })
  })

  describe('updateNodePosition', () => {
    it('should update node canvas position', () => {
      const store = useNodesStore()
      store.initialize()

      store.updateNodePosition('1', 500, 300)

      const node = store.getNode('1')
      expect(node?.canvas_x).toBe(500)
      expect(node?.canvas_y).toBe(300)
    })

    it('should update timestamp on position change', () => {
      const store = useNodesStore()
      store.initialize()

      const before = store.getNode('1')?.updated_at
      store.updateNodePosition('1', 500, 300)
      const after = store.getNode('1')?.updated_at

      expect(after).toBeGreaterThanOrEqual(before!)
    })
  })

  describe('createNode', () => {
    it('should create a new node with defaults', () => {
      const store = useNodesStore()
      store.initialize()

      const node = store.createNode({
        title: 'New Node',
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
    it('should remove node and connected edges', () => {
      const store = useNodesStore()
      store.initialize()

      store.deleteNode('1')

      expect(store.nodes.length).toBe(1)
      expect(store.edges.length).toBe(0)
    })
  })

  describe('selectNode', () => {
    it('should set selected node id', () => {
      const store = useNodesStore()
      store.initialize()

      store.selectNode('1')
      expect(store.selectedNodeId).toBe('1')
      expect(store.selectedNode?.id).toBe('1')
    })

    it('should clear selection with null', () => {
      const store = useNodesStore()
      store.initialize()

      store.selectNode('1')
      store.selectNode(null)

      expect(store.selectedNodeId).toBeNull()
      expect(store.selectedNode).toBeUndefined()
    })
  })
})
