import { describe, it, expect, vi } from 'vitest'
import { useEdgeManipulation } from '../canvas/composables/edges/useEdgeManipulation'
import type { Edge } from '../types'

describe('Edge Manipulation', () => {
  const createMockEdge = (id: string, sourceId: string, targetId: string, label?: string | null): Edge => ({
    id,
    source_node_id: sourceId,
    target_node_id: targetId,
    link_type: 'related',
    label: label ?? null,
    directed: true,
    created_at: new Date().toISOString(),
  })

  describe('changeEdgeLabel', () => {
    it('updates edge label locally and persists to database', async () => {
      const mockEdge = createMockEdge('edge-1', 'node-1', 'node-2')
      const edges = [mockEdge]
      const updateEdgeLabelMock = vi.fn().mockResolvedValue(undefined)

      const mockStore = {
        getNode: vi.fn(),
        getEdges: () => edges,
        getFilteredEdges: () => edges,
        getFilteredNodes: () => [],
        createNode: vi.fn(),
        createEdge: vi.fn(),
        deleteEdge: vi.fn(),
        updateEdgeDirected: vi.fn(),
        updateEdgeLabel: updateEdgeLabelMock,
        selectNode: vi.fn(),
      }

      const { selectedEdge, changeEdgeLabel } = useEdgeManipulation({
        store: mockStore,
        screenToCanvas: (x, y) => ({ x, y }),
      })

      // Select the edge
      selectedEdge.value = 'edge-1'

      // Change the label
      await changeEdgeLabel('my-label')

      // Check local update
      expect(mockEdge.label).toBe('my-label')

      // Check persistence was called
      expect(updateEdgeLabelMock).toHaveBeenCalledWith('edge-1', 'my-label')
    })

    it('clears label when empty string is provided', async () => {
      const mockEdge = createMockEdge('edge-1', 'node-1', 'node-2', 'existing-label')
      const edges = [mockEdge]
      const updateEdgeLabelMock = vi.fn().mockResolvedValue(undefined)

      const mockStore = {
        getNode: vi.fn(),
        getEdges: () => edges,
        getFilteredEdges: () => edges,
        getFilteredNodes: () => [],
        createNode: vi.fn(),
        createEdge: vi.fn(),
        deleteEdge: vi.fn(),
        updateEdgeDirected: vi.fn(),
        updateEdgeLabel: updateEdgeLabelMock,
        selectNode: vi.fn(),
      }

      const { selectedEdge, changeEdgeLabel } = useEdgeManipulation({
        store: mockStore,
        screenToCanvas: (x, y) => ({ x, y }),
      })

      selectedEdge.value = 'edge-1'
      await changeEdgeLabel('')

      // Empty string should become null
      expect(mockEdge.label).toBeNull()
      expect(updateEdgeLabelMock).toHaveBeenCalledWith('edge-1', null)
    })

    it('does nothing if no edge is selected', async () => {
      const mockEdge = createMockEdge('edge-1', 'node-1', 'node-2')
      const edges = [mockEdge]
      const updateEdgeLabelMock = vi.fn()

      const mockStore = {
        getNode: vi.fn(),
        getEdges: () => edges,
        getFilteredEdges: () => edges,
        getFilteredNodes: () => [],
        createNode: vi.fn(),
        createEdge: vi.fn(),
        deleteEdge: vi.fn(),
        updateEdgeDirected: vi.fn(),
        updateEdgeLabel: updateEdgeLabelMock,
        selectNode: vi.fn(),
      }

      const { changeEdgeLabel } = useEdgeManipulation({
        store: mockStore,
        screenToCanvas: (x, y) => ({ x, y }),
      })

      // No edge selected - should not call updateEdgeLabel
      await changeEdgeLabel('test')

      expect(updateEdgeLabelMock).not.toHaveBeenCalled()
    })
  })

  describe('reverseEdge', () => {
    it('reverses edge direction while preserving label', async () => {
      const mockEdge = createMockEdge('edge-1', 'node-1', 'node-2', 'depends on')
      const edges = [mockEdge]
      const newEdge = createMockEdge('edge-2', 'node-2', 'node-1', 'depends on')

      const mockStore = {
        getNode: vi.fn(),
        getEdges: () => edges,
        getFilteredEdges: () => edges,
        getFilteredNodes: () => [],
        createNode: vi.fn(),
        createEdge: vi.fn().mockResolvedValue(newEdge),
        deleteEdge: vi.fn().mockResolvedValue(undefined),
        updateEdgeDirected: vi.fn(),
        updateEdgeLabel: vi.fn(),
        selectNode: vi.fn(),
      }

      const { selectedEdge, reverseEdge } = useEdgeManipulation({
        store: mockStore,
        screenToCanvas: (x, y) => ({ x, y }),
      })

      selectedEdge.value = 'edge-1'
      await reverseEdge()

      // Should delete old edge
      expect(mockStore.deleteEdge).toHaveBeenCalledWith('edge-1')

      // Should create new edge with swapped source/target, preserving
      // link_type, label, color, direction, and storyline membership
      expect(mockStore.createEdge).toHaveBeenCalledWith({
        source_node_id: 'node-2',
        target_node_id: 'node-1',
        link_type: 'related',
        label: 'depends on',
        color: undefined,
        directed: true,
        storyline_id: undefined,
      })

      // Should select the new edge
      expect(selectedEdge.value).toBe('edge-2')
    })
  })

  describe('isEdgeDirected', () => {
    it('returns true for directed edges', () => {
      const mockEdge = createMockEdge('edge-1', 'node-1', 'node-2')
      mockEdge.directed = true
      const edges = [mockEdge]

      const mockStore = {
        getNode: vi.fn(),
        getEdges: () => edges,
        getFilteredEdges: () => edges,
        getFilteredNodes: () => [],
        createNode: vi.fn(),
        createEdge: vi.fn(),
        deleteEdge: vi.fn(),
        updateEdgeDirected: vi.fn(),
        updateEdgeLabel: vi.fn(),
        selectNode: vi.fn(),
      }

      const { isEdgeDirected } = useEdgeManipulation({
        store: mockStore,
        screenToCanvas: (x, y) => ({ x, y }),
      })

      expect(isEdgeDirected('edge-1')).toBe(true)
    })

    it('returns false for non-directed edges', () => {
      const mockEdge = createMockEdge('edge-1', 'node-1', 'node-2')
      mockEdge.directed = false
      const edges = [mockEdge]

      const mockStore = {
        getNode: vi.fn(),
        getEdges: () => edges,
        getFilteredEdges: () => edges,
        getFilteredNodes: () => [],
        createNode: vi.fn(),
        createEdge: vi.fn(),
        deleteEdge: vi.fn(),
        updateEdgeDirected: vi.fn(),
        updateEdgeLabel: vi.fn(),
        selectNode: vi.fn(),
      }

      const { isEdgeDirected } = useEdgeManipulation({
        store: mockStore,
        screenToCanvas: (x, y) => ({ x, y }),
      })

      expect(isEdgeDirected('edge-1')).toBe(false)
    })

    it('returns true by default for missing directed field', () => {
      const mockEdge = createMockEdge('edge-1', 'node-1', 'node-2')
      // Remove the directed field to simulate old data
      delete (mockEdge as Partial<Edge>).directed
      const edges = [mockEdge]

      const mockStore = {
        getNode: vi.fn(),
        getEdges: () => edges,
        getFilteredEdges: () => edges,
        getFilteredNodes: () => [],
        createNode: vi.fn(),
        createEdge: vi.fn(),
        deleteEdge: vi.fn(),
        updateEdgeDirected: vi.fn(),
        updateEdgeLabel: vi.fn(),
        selectNode: vi.fn(),
      }

      const { isEdgeDirected } = useEdgeManipulation({
        store: mockStore,
        screenToCanvas: (x, y) => ({ x, y }),
      })

      expect(isEdgeDirected('edge-1')).toBe(true)
    })
  })
})
