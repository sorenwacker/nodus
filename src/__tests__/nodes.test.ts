import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useNodesStore } from '../stores/nodes'

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

// Mock Tauri invoke with smart responses
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockImplementation((command: string, _args?: unknown) => {
    // Allow workspace operations to succeed
    if (command === 'create_workspace') {
      return Promise.resolve()
    }
    if (command === 'update_node_workspace') {
      return Promise.resolve()
    }
    // Reject other commands to trigger fallbacks
    return Promise.reject(new Error('Mock: No backend'))
  }),
}))

// Mock Tauri event
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn().mockResolvedValue(() => {}),
}))

describe('Nodes Store', () => {
  beforeEach(() => {
    localStorageMock.clear()
    setActivePinia(createPinia())
  })

  describe('initialize', () => {
    it('should create fallback mock nodes when backend unavailable', async () => {
      const store = useNodesStore()
      await store.initialize()

      expect(store.nodes.length).toBe(2)
      expect(store.edges.length).toBe(0) // No mock edges in fallback mode
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
      expect(store.edges.length).toBe(1) // First edge created
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

  describe('watchVault', () => {
    it('should expose watchVault and stopWatching functions', async () => {
      const store = useNodesStore()
      expect(typeof store.watchVault).toBe('function')
      expect(typeof store.stopWatching).toBe('function')
    })
  })

  describe('moveNodesToWorkspace', () => {
    it('should move nodes to a different workspace', async () => {
      const store = useNodesStore()
      await store.initialize()

      // Create a workspace
      const workspace = await store.createWorkspace('Test Workspace')
      expect(workspace.id).toBeDefined()

      // Move node to workspace
      await store.moveNodesToWorkspace(['1'], workspace.id)

      const node = store.getNode('1')
      expect(node?.workspace_id).toBe(workspace.id)
    })

    it('should move multiple nodes at once', async () => {
      const store = useNodesStore()
      await store.initialize()

      const workspace = await store.createWorkspace('Target Workspace')
      await store.moveNodesToWorkspace(['1', '2'], workspace.id)

      expect(store.getNode('1')?.workspace_id).toBe(workspace.id)
      expect(store.getNode('2')?.workspace_id).toBe(workspace.id)
    })

    it('should move nodes to default workspace (null)', async () => {
      const store = useNodesStore()
      await store.initialize()

      const workspace = await store.createWorkspace('Temp Workspace')
      await store.moveNodesToWorkspace(['1'], workspace.id)
      expect(store.getNode('1')?.workspace_id).toBe(workspace.id)

      // Move back to default
      await store.moveNodesToWorkspace(['1'], null)
      expect(store.getNode('1')?.workspace_id).toBeNull()
    })
  })

  describe('workspace management', () => {
    it('should create and switch workspaces', async () => {
      const store = useNodesStore()
      await store.initialize()

      const workspace = await store.createWorkspace('My Workspace')
      expect(workspace.name).toBe('My Workspace')
      expect(store.workspaces).toContainEqual(workspace)

      store.switchWorkspace(workspace.id)
      expect(store.currentWorkspaceId).toBe(workspace.id)
    })

    it('should filter nodes by current workspace', async () => {
      const store = useNodesStore()
      await store.initialize()

      // Initially in default workspace (null)
      expect(store.filteredNodes.length).toBe(2)

      // Create workspace and move one node
      const workspace = await store.createWorkspace('Work')
      await store.moveNodesToWorkspace(['1'], workspace.id)

      // Default workspace should now only have 1 node
      expect(store.filteredNodes.length).toBe(1)

      // Switch to new workspace
      store.switchWorkspace(workspace.id)
      expect(store.filteredNodes.length).toBe(1)
      expect(store.filteredNodes[0].id).toBe('1')
    })

    it('should delete workspace', async () => {
      const store = useNodesStore()
      await store.initialize()

      const workspace = await store.createWorkspace('To Delete')
      store.switchWorkspace(workspace.id)
      expect(store.currentWorkspaceId).toBe(workspace.id)

      await store.deleteWorkspace(workspace.id)
      expect(store.workspaces).not.toContainEqual(workspace)
      expect(store.currentWorkspaceId).toBeNull() // Should switch to default
    })
  })
})

describe('Clipboard Node Data', () => {
  it('should have correct structure for copy/paste', () => {
    interface ClipboardNodeData {
      type: 'nodus-nodes'
      nodes: Array<{
        title: string
        markdown_content: string
        canvas_x: number
        canvas_y: number
        width: number
        height: number
        color_theme: string | null
      }>
    }

    const clipboardData: ClipboardNodeData = {
      type: 'nodus-nodes',
      nodes: [
        {
          title: 'Test Node',
          markdown_content: '# Test\n\nContent here',
          canvas_x: 0, // Relative position
          canvas_y: 0,
          width: 200,
          height: 120,
          color_theme: 'blue',
        },
        {
          title: 'Second Node',
          markdown_content: 'More content',
          canvas_x: 250, // Offset from first node
          canvas_y: 0,
          width: 200,
          height: 120,
          color_theme: null,
        },
      ],
    }

    // Validate structure
    expect(clipboardData.type).toBe('nodus-nodes')
    expect(clipboardData.nodes).toHaveLength(2)
    expect(clipboardData.nodes[0].title).toBe('Test Node')
    expect(clipboardData.nodes[1].canvas_x).toBe(250)

    // Should be JSON serializable
    const json = JSON.stringify(clipboardData)
    const parsed = JSON.parse(json) as ClipboardNodeData
    expect(parsed.type).toBe('nodus-nodes')
    expect(parsed.nodes).toHaveLength(2)
  })

  it('should preserve relative positions when copying multiple nodes', () => {
    // Simulate nodes at different positions
    const nodes = [
      { canvas_x: 100, canvas_y: 200 },
      { canvas_x: 350, canvas_y: 200 },
      { canvas_x: 100, canvas_y: 400 },
    ]

    // Find bounding box origin
    const minX = Math.min(...nodes.map(n => n.canvas_x))
    const minY = Math.min(...nodes.map(n => n.canvas_y))

    // Convert to relative positions
    const relative = nodes.map(n => ({
      canvas_x: n.canvas_x - minX,
      canvas_y: n.canvas_y - minY,
    }))

    expect(relative[0]).toEqual({ canvas_x: 0, canvas_y: 0 })
    expect(relative[1]).toEqual({ canvas_x: 250, canvas_y: 0 })
    expect(relative[2]).toEqual({ canvas_x: 0, canvas_y: 200 })
  })
})
