import { describe, it, expect, vi } from 'vitest'
import { useContextMenu } from '../canvas/composables/selection/useContextMenu'

describe('Context Menu', () => {
  const createMockDeps = (selectedIds: string[] = []) => ({
    getSelectedNodeIds: vi.fn(() => selectedIds),
    addNodeToStoryline: vi.fn().mockResolvedValue(undefined),
    createStoryline: vi.fn().mockResolvedValue({ id: 'storyline-1', title: 'Test' }),
    moveNodesToWorkspace: vi.fn().mockResolvedValue(undefined),
  })

  describe('affectedNodeIds snapshot', () => {
    it('should capture single node when right-clicking unselected node', () => {
      const deps = createMockDeps([]) // No selection
      const contextMenu = useContextMenu(deps)

      const mockEvent = { clientX: 100, clientY: 100 } as PointerEvent
      contextMenu.open(mockEvent, 'node-1')

      expect(contextMenu.affectedNodeIds.value).toEqual(['node-1'])
      expect(contextMenu.nodeCount.value).toBe(1)
    })

    it('should capture single node when right-clicking node not in selection', () => {
      const deps = createMockDeps(['node-2', 'node-3']) // Different nodes selected
      const contextMenu = useContextMenu(deps)

      const mockEvent = { clientX: 100, clientY: 100 } as PointerEvent
      contextMenu.open(mockEvent, 'node-1')

      // Should use only the clicked node, not the selection
      expect(contextMenu.affectedNodeIds.value).toEqual(['node-1'])
      expect(contextMenu.nodeCount.value).toBe(1)
    })

    it('should capture all selected nodes when right-clicking node in selection', () => {
      const deps = createMockDeps(['node-1', 'node-2', 'node-3'])
      const contextMenu = useContextMenu(deps)

      const mockEvent = { clientX: 100, clientY: 100 } as PointerEvent
      contextMenu.open(mockEvent, 'node-2') // Click one of the selected nodes

      // Should use the full selection
      expect(contextMenu.affectedNodeIds.value).toEqual(['node-1', 'node-2', 'node-3'])
      expect(contextMenu.nodeCount.value).toBe(3)
    })

    it('should preserve snapshot even if selection changes after menu opens', () => {
      let currentSelection = ['node-1', 'node-2']
      const deps = {
        ...createMockDeps(),
        getSelectedNodeIds: vi.fn(() => currentSelection),
      }
      const contextMenu = useContextMenu(deps)

      const mockEvent = { clientX: 100, clientY: 100 } as PointerEvent
      contextMenu.open(mockEvent, 'node-1')

      // Snapshot captured
      expect(contextMenu.affectedNodeIds.value).toEqual(['node-1', 'node-2'])

      // Simulate selection changing (e.g., user clicks elsewhere)
      currentSelection = []

      // Affected nodes should still be the snapshot
      expect(contextMenu.affectedNodeIds.value).toEqual(['node-1', 'node-2'])
    })

    it('should clear snapshot when menu closes', () => {
      const deps = createMockDeps(['node-1', 'node-2'])
      const contextMenu = useContextMenu(deps)

      const mockEvent = { clientX: 100, clientY: 100 } as PointerEvent
      contextMenu.open(mockEvent, 'node-1')
      expect(contextMenu.affectedNodeIds.value.length).toBe(2)

      contextMenu.close()

      expect(contextMenu.affectedNodeIds.value).toEqual([])
      expect(contextMenu.visible.value).toBe(false)
    })
  })

  describe('workspace operations', () => {
    it('should move affected nodes to workspace', async () => {
      const deps = createMockDeps(['node-1', 'node-2'])
      const contextMenu = useContextMenu(deps)

      const mockEvent = { clientX: 100, clientY: 100 } as PointerEvent
      contextMenu.open(mockEvent, 'node-1')

      await contextMenu.moveToWorkspace('workspace-1')

      expect(deps.moveNodesToWorkspace).toHaveBeenCalledWith(
        ['node-1', 'node-2'],
        'workspace-1'
      )
      expect(contextMenu.visible.value).toBe(false)
    })
  })

  describe('storyline operations', () => {
    it('should add affected nodes to storyline', async () => {
      const deps = createMockDeps(['node-1', 'node-2'])
      const contextMenu = useContextMenu(deps)

      const mockEvent = { clientX: 100, clientY: 100 } as PointerEvent
      contextMenu.open(mockEvent, 'node-1')

      await contextMenu.addToStoryline('storyline-1')

      expect(deps.addNodeToStoryline).toHaveBeenCalledTimes(2)
      expect(deps.addNodeToStoryline).toHaveBeenCalledWith('storyline-1', 'node-1')
      expect(deps.addNodeToStoryline).toHaveBeenCalledWith('storyline-1', 'node-2')
    })
  })
})
