/**
 * An interrupted drag keeps the positions it reached.
 *
 * A drag updates positions with `skipPersist` and flushes once at the end.
 * `cleanupDrag` - the handler for `pointercancel`, window blur, and a pointer
 * released unseen - cleared the drag state without flushing, so the node stayed
 * where it was dropped on screen and jumped back on the next load
 * (PRODUCT_DESIGN.md > Persisting an interrupted drag).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref } from 'vue'
import type { Node } from '../types'

function makeNode(id: string): Node {
  return {
    id,
    title: id,
    file_path: null,
    markdown_content: null,
    node_type: 'note',
    canvas_x: 0,
    canvas_y: 0,
    width: 200,
    height: 120,
    frame_id: null,
    workspace_id: null,
    created_at: 0,
    updated_at: 0,
  } as Node
}

describe('an interrupted drag', () => {
  let persistNodePosition: ReturnType<typeof vi.fn>
  let nodes: Node[]

  function context() {
    nodes = [makeNode('a'), makeNode('b')]
    persistNodePosition = vi.fn()
    return {
      store: {
        getNode: (id: string) => nodes.find(n => n.id === id),
        updateNodePosition: (id: string, x: number, y: number) => {
          const node = nodes.find(n => n.id === id)
          if (node) {
            node.canvas_x = x
            node.canvas_y = y
          }
        },
        persistNodePosition,
        triggerLayoutUpdate: vi.fn(),
        selectNode: vi.fn(),
        selectedNodeIds: [] as string[],
        filteredNodes: nodes,
        filteredEdges: [],
        frames: [],
        assignNodesToFrame: vi.fn(),
        refreshNodeFromFile: vi.fn(),
        nodeLayoutVersion: 0,
      },
      scale: ref(1),
      offset: ref({ x: 0, y: 0 }),
      canvasRef: ref(null),
      gridLockEnabled: ref(false),
      snapToGrid: (v: number) => v,
      neighborhoodMode: ref(false),
      focusNodeId: ref(null),
      isLODMode: ref(false),
      isSemanticZoomCollapsed: ref(false),
      editingNodeId: ref(null),
      editingTitleId: ref(null),
      selectedEdge: ref(null),
      isCreatingEdge: ref(false),
      edgeStartNode: ref(null),
      edgePreviewEnd: ref({ x: 0, y: 0 }),
      layoutNeighborhood: vi.fn(),
      pushOverlappingNodesAway: vi.fn(),
      pushUndo: vi.fn(),
      pushFrameAssignmentUndo: vi.fn(),
      screenToCanvas: (x: number, y: number) => ({ x, y }),
      zoomToNode: vi.fn(),
      onEdgePreviewMove: vi.fn(),
    } as never
  }

  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('stores where the dragged node landed', async () => {
    const { useNodeDragging } = await import('../canvas/composables/nodes/useNodeDragging')
    const dragging = useNodeDragging(context())

    dragging.onNodePointerDown(
      new PointerEvent('pointerdown', { clientX: 0, clientY: 0, button: 0 }),
      'a'
    )
    // Move far enough to pass the drag threshold
    document.dispatchEvent(
      new PointerEvent('pointermove', { clientX: 80, clientY: 60, buttons: 1 })
    )
    // The pointer is cancelled rather than released
    document.dispatchEvent(new PointerEvent('pointercancel'))

    expect(persistNodePosition).toHaveBeenCalledWith('a')
  })

  it('stores every node of a multi-node drag', async () => {
    const { useNodeDragging } = await import('../canvas/composables/nodes/useNodeDragging')
    const ctx = context()
    ;(ctx as { store: { selectedNodeIds: string[] } }).store.selectedNodeIds = ['a', 'b']
    const dragging = useNodeDragging(ctx)

    dragging.onNodePointerDown(
      new PointerEvent('pointerdown', { clientX: 0, clientY: 0, button: 0 }),
      'a'
    )
    document.dispatchEvent(
      new PointerEvent('pointermove', { clientX: 80, clientY: 60, buttons: 1 })
    )
    document.dispatchEvent(new PointerEvent('pointercancel'))

    const persisted = persistNodePosition.mock.calls.map(c => c[0]).sort()
    expect(persisted).toEqual(['a', 'b'])
  })

  it('stores nothing when the drag never passed the threshold', async () => {
    // A click that never moved has no position to store
    const { useNodeDragging } = await import('../canvas/composables/nodes/useNodeDragging')
    const dragging = useNodeDragging(context())

    dragging.onNodePointerDown(
      new PointerEvent('pointerdown', { clientX: 0, clientY: 0, button: 0 }),
      'a'
    )
    document.dispatchEvent(new PointerEvent('pointercancel'))

    expect(persistNodePosition).not.toHaveBeenCalled()
  })
})
