import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useNodesStore, type Node } from '../stores/nodes'

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

// Mock Tauri invoke
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockRejectedValue(new Error('Mock: No backend')),
}))

// Mock Tauri event
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn().mockResolvedValue(() => {}),
}))

function generateMockNodes(count: number): Node[] {
  const nodes: Node[] = []
  const cols = Math.ceil(Math.sqrt(count))
  const spacing = 250

  for (let i = 0; i < count; i++) {
    nodes.push({
      id: `node-${i}`,
      title: `Node ${i}`,
      file_path: null,
      markdown_content: `# Node ${i}\n\nThis is content for node ${i}.`,
      node_type: 'note',
      canvas_x: (i % cols) * spacing + 100,
      canvas_y: Math.floor(i / cols) * spacing + 100,
      width: 200,
      height: 120,
      z_index: 0,
      frame_id: null,
      color_theme: null,
      is_collapsed: false,
      tags: null,
      workspace_id: null,
      checksum: null,
      created_at: Date.now(),
      updated_at: Date.now(),
      deleted_at: null,
    })
  }
  return nodes
}

describe('Canvas Performance', () => {
  beforeEach(() => {
    localStorageMock.clear()
    setActivePinia(createPinia())
  })

  describe('Store operations with 500 nodes', () => {
    it('should handle 500 nodes in store without degradation', () => {
      const store = useNodesStore()
      const mockNodes = generateMockNodes(500)

      const startLoad = performance.now()
      mockNodes.forEach((node) => {
        store.nodes.push(node)
      })
      const loadTime = performance.now() - startLoad

      expect(store.nodes.length).toBe(500)
      // Loading 500 nodes into reactive store should be fast
      expect(loadTime).toBeLessThan(150) // Under 150ms (accounts for CI variance)
    })

    it('should update 500 node positions efficiently', () => {
      const store = useNodesStore()
      const mockNodes = generateMockNodes(500)
      store.nodes.push(...mockNodes)

      const iterations = 60 // Simulate 1 second of 60fps updates
      const timings: number[] = []

      for (let frame = 0; frame < iterations; frame++) {
        const start = performance.now()
        // Update all node positions (simulates pan/drag)
        store.nodes.forEach((node) => {
          node.canvas_x += 1
          node.canvas_y += 0.5
        })
        timings.push(performance.now() - start)
      }

      const avgTime = timings.reduce((a, b) => a + b, 0) / timings.length
      const maxTime = Math.max(...timings)

      // Average update should be under 16.67ms (60fps threshold)
      expect(avgTime).toBeLessThan(16.67)
      // No single frame should exceed 33ms (30fps minimum)
      expect(maxTime).toBeLessThan(33)
    })

    it('should filter nodes by workspace efficiently', () => {
      const store = useNodesStore()
      const mockNodes = generateMockNodes(500)
      // Assign half to workspace A, half to workspace B
      mockNodes.forEach((node, i) => {
        node.workspace_id = i % 2 === 0 ? 'workspace-a' : 'workspace-b'
      })
      store.nodes.push(...mockNodes)

      const startFilter = performance.now()
      store.switchWorkspace('workspace-a')
      const filterTime = performance.now() - startFilter

      expect(store.filteredNodes.length).toBe(250)
      expect(filterTime).toBeLessThan(10) // Filtering should be instant
    })

    it('should handle rapid node selection changes', () => {
      const store = useNodesStore()
      const mockNodes = generateMockNodes(500)
      store.nodes.push(...mockNodes)

      const iterations = 100
      const startSelect = performance.now()

      for (let i = 0; i < iterations; i++) {
        const randomIndex = Math.floor(Math.random() * 500)
        store.selectNode(`node-${randomIndex}`)
      }
      const selectTime = performance.now() - startSelect

      // 100 selection changes should complete quickly
      expect(selectTime).toBeLessThan(50)
    })

    it('should create edges between 500 nodes efficiently', () => {
      const store = useNodesStore()
      const mockNodes = generateMockNodes(500)
      store.nodes.push(...mockNodes)

      // Create ~1000 edges (2 per node on average)
      const edgeCount = 1000
      const startEdges = performance.now()

      for (let i = 0; i < edgeCount; i++) {
        const sourceIdx = Math.floor(Math.random() * 500)
        let targetIdx = Math.floor(Math.random() * 500)
        if (targetIdx === sourceIdx) targetIdx = (targetIdx + 1) % 500

        store.edges.push({
          id: `edge-${i}`,
          source_node_id: `node-${sourceIdx}`,
          target_node_id: `node-${targetIdx}`,
          label: null,
          link_type: 'related',
          weight: 1,
          created_at: Date.now(),
        })
      }
      const edgeTime = performance.now() - startEdges

      expect(store.edges.length).toBe(1000)
      expect(edgeTime).toBeLessThan(100) // Creating 1000 edges should be fast
    })

    it('should compute filtered edges efficiently', () => {
      const store = useNodesStore()
      const mockNodes = generateMockNodes(500)
      mockNodes.forEach((node, i) => {
        node.workspace_id = i % 2 === 0 ? 'workspace-a' : 'workspace-b'
      })
      store.nodes.push(...mockNodes)

      // Create edges that cross workspace boundaries
      for (let i = 0; i < 1000; i++) {
        store.edges.push({
          id: `edge-${i}`,
          source_node_id: `node-${i % 500}`,
          target_node_id: `node-${(i + 1) % 500}`,
          label: null,
          link_type: 'related',
          weight: 1,
          created_at: Date.now(),
        })
      }

      store.switchWorkspace('workspace-a')

      const startCompute = performance.now()
      // Access filtered edges (triggers computed)
      const filtered = store.filteredEdges
      const computeTime = performance.now() - startCompute

      // Edge filtering should be efficient
      expect(computeTime).toBeLessThan(20)
      // Only edges where both nodes are in workspace-a
      expect(filtered.length).toBeLessThan(1000)
    })

    it('should handle batch node deletion efficiently', () => {
      const store = useNodesStore()
      const mockNodes = generateMockNodes(500)
      store.nodes.push(...mockNodes)

      // Create edges
      for (let i = 0; i < 500; i++) {
        store.edges.push({
          id: `edge-${i}`,
          source_node_id: `node-${i}`,
          target_node_id: `node-${(i + 1) % 500}`,
          label: null,
          link_type: 'related',
          weight: 1,
          created_at: Date.now(),
        })
      }

      // Delete 100 nodes
      const startDelete = performance.now()
      for (let i = 0; i < 100; i++) {
        const nodeId = `node-${i}`
        store.nodes = store.nodes.filter((n) => n.id !== nodeId)
        store.edges = store.edges.filter(
          (e) => e.source_node_id !== nodeId && e.target_node_id !== nodeId
        )
      }
      const deleteTime = performance.now() - startDelete

      expect(store.nodes.length).toBe(400)
      expect(deleteTime).toBeLessThan(150) // Accounts for CI variance
    })
  })

  describe('Memory efficiency', () => {
    it('should maintain reasonable memory with 1000 nodes', () => {
      const store = useNodesStore()
      const mockNodes = generateMockNodes(1000)

      const beforeHeap =
        (performance as any).memory?.usedJSHeapSize || 0

      store.nodes.push(...mockNodes)

      // Add content to each node
      store.nodes.forEach((node, i) => {
        node.markdown_content = `# Node ${i}\n\n${'Lorem ipsum '.repeat(50)}`
      })

      const afterHeap =
        (performance as any).memory?.usedJSHeapSize || 0

      // If memory API available, check growth is reasonable
      if (beforeHeap > 0) {
        const heapGrowthMB = (afterHeap - beforeHeap) / 1024 / 1024
        // 1000 nodes with content should use less than 50MB
        expect(heapGrowthMB).toBeLessThan(50)
      }

      expect(store.nodes.length).toBe(1000)
    })
  })

  // ==========================================================================
  // Performance Baselines - These define our performance targets
  // ==========================================================================
  describe('Performance Baselines', () => {
    const baselines = {
      nodes500: {
        loadTime: 100,      // ms to load 500 nodes
        updateTime: 16.67,  // ms per frame (60fps)
        filterTime: 10,     // ms to filter workspace
      },
      nodes1000: {
        loadTime: 200,      // ms to load 1000 nodes
        updateTime: 16.67,  // ms per frame (60fps)
        filterTime: 20,     // ms to filter workspace
      },
      nodes2000: {
        loadTime: 400,      // ms to load 2000 nodes
        updateTime: 33,     // ms per frame (30fps minimum)
        filterTime: 40,     // ms to filter workspace
      },
    }

    it('BASELINE: 500 nodes - load time', () => {
      const store = useNodesStore()
      const mockNodes = generateMockNodes(500)

      const start = performance.now()
      store.nodes.push(...mockNodes)
      const elapsed = performance.now() - start

      console.log(`[BASELINE] 500 nodes load: ${elapsed.toFixed(2)}ms (target: <${baselines.nodes500.loadTime}ms)`)
      expect(elapsed).toBeLessThan(baselines.nodes500.loadTime)
    })

    it('BASELINE: 1000 nodes - load time', () => {
      const store = useNodesStore()
      const mockNodes = generateMockNodes(1000)

      const start = performance.now()
      store.nodes.push(...mockNodes)
      const elapsed = performance.now() - start

      console.log(`[BASELINE] 1000 nodes load: ${elapsed.toFixed(2)}ms (target: <${baselines.nodes1000.loadTime}ms)`)
      expect(elapsed).toBeLessThan(baselines.nodes1000.loadTime)
    })

    it('BASELINE: 2000 nodes - load time', () => {
      const store = useNodesStore()
      const mockNodes = generateMockNodes(2000)

      const start = performance.now()
      store.nodes.push(...mockNodes)
      const elapsed = performance.now() - start

      console.log(`[BASELINE] 2000 nodes load: ${elapsed.toFixed(2)}ms (target: <${baselines.nodes2000.loadTime}ms)`)
      expect(elapsed).toBeLessThan(baselines.nodes2000.loadTime)
    })

    it('BASELINE: 500 nodes - 60fps update cycle', () => {
      const store = useNodesStore()
      store.nodes.push(...generateMockNodes(500))

      const frames = 60
      const timings: number[] = []

      for (let i = 0; i < frames; i++) {
        const start = performance.now()
        store.nodes.forEach(n => { n.canvas_x += 1; n.canvas_y += 0.5 })
        timings.push(performance.now() - start)
      }

      const avg = timings.reduce((a, b) => a + b, 0) / timings.length
      const max = Math.max(...timings)
      const p95 = timings.sort((a, b) => a - b)[Math.floor(frames * 0.95)]

      console.log(`[BASELINE] 500 nodes update: avg=${avg.toFixed(2)}ms, p95=${p95.toFixed(2)}ms, max=${max.toFixed(2)}ms`)
      expect(avg).toBeLessThan(baselines.nodes500.updateTime)
    })

    it('BASELINE: 1000 nodes - 60fps update cycle', () => {
      const store = useNodesStore()
      store.nodes.push(...generateMockNodes(1000))

      const frames = 60
      const timings: number[] = []

      for (let i = 0; i < frames; i++) {
        const start = performance.now()
        store.nodes.forEach(n => { n.canvas_x += 1; n.canvas_y += 0.5 })
        timings.push(performance.now() - start)
      }

      const avg = timings.reduce((a, b) => a + b, 0) / timings.length
      const max = Math.max(...timings)
      const p95 = timings.sort((a, b) => a - b)[Math.floor(frames * 0.95)]

      console.log(`[BASELINE] 1000 nodes update: avg=${avg.toFixed(2)}ms, p95=${p95.toFixed(2)}ms, max=${max.toFixed(2)}ms`)
      expect(avg).toBeLessThan(baselines.nodes1000.updateTime)
    })

    it('BASELINE: 2000 nodes - 30fps minimum update cycle', () => {
      const store = useNodesStore()
      store.nodes.push(...generateMockNodes(2000))

      const frames = 30
      const timings: number[] = []

      for (let i = 0; i < frames; i++) {
        const start = performance.now()
        store.nodes.forEach(n => { n.canvas_x += 1; n.canvas_y += 0.5 })
        timings.push(performance.now() - start)
      }

      const avg = timings.reduce((a, b) => a + b, 0) / timings.length
      const max = Math.max(...timings)
      const p95 = timings.sort((a, b) => a - b)[Math.floor(frames * 0.95)]

      console.log(`[BASELINE] 2000 nodes update: avg=${avg.toFixed(2)}ms, p95=${p95.toFixed(2)}ms, max=${max.toFixed(2)}ms`)
      expect(avg).toBeLessThan(baselines.nodes2000.updateTime)
    })

    it('BASELINE: Edge creation - 2000 edges', () => {
      const store = useNodesStore()
      store.nodes.push(...generateMockNodes(500))

      const start = performance.now()
      for (let i = 0; i < 2000; i++) {
        store.edges.push({
          id: `edge-${i}`,
          source_node_id: `node-${i % 500}`,
          target_node_id: `node-${(i + 1) % 500}`,
          label: null,
          link_type: 'related',
          weight: 1,
          created_at: Date.now(),
        })
      }
      const elapsed = performance.now() - start

      console.log(`[BASELINE] 2000 edges create: ${elapsed.toFixed(2)}ms (target: <200ms)`)
      expect(elapsed).toBeLessThan(200)
    })
  })
})
