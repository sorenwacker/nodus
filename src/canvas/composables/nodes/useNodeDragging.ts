/**
 * Node dragging composable
 *
 * Handles node drag interactions including multi-select dragging
 */

import { isOverStorylinePanel as overStorylinePanel } from '../util/dragDropTarget'
import { ref, type Ref } from 'vue'
import type { Node } from '../../../types'

export interface UseNodeDraggingContext {
  store: {
    getNode: (id: string) => Node | undefined
    updateNodePosition: (id: string, x: number, y: number, options?: { skipLayoutTrigger?: boolean; skipPersist?: boolean }) => void
    persistNodePosition: (id: string) => void
    triggerLayoutUpdate: () => void
    selectNode: (id: string, multi: boolean) => void
    selectedNodeIds: string[]
    filteredNodes: Node[]
    filteredEdges: Array<{ id: string; source_node_id: string; target_node_id: string }>
    refreshNodeFromFile: (id: string) => void
    nodeLayoutVersion: number
  }
  scale: Ref<number>
  offset: Ref<{ x: number; y: number }>
  canvasRef: Ref<HTMLElement | null>
  gridLockEnabled: Ref<boolean>
  snapToGrid: (value: number) => number
  neighborhoodMode: Ref<boolean>
  focusNodeId: Ref<string | null>
  isLODMode: Ref<boolean>
  isSemanticZoomCollapsed: Ref<boolean>
  editingNodeId: Ref<string | null>
  editingTitleId: Ref<string | null>
  selectedEdge: Ref<string | null>
  isCreatingEdge: Ref<boolean>
  edgeStartNode: Ref<string | null>
  edgePreviewEnd: Ref<{ x: number; y: number }>
  layoutNeighborhood: (focusId: string) => void
  pushOverlappingNodesAway: (sourceId: string) => void
  pushUndo: () => void
  screenToCanvas: (clientX: number, clientY: number) => { x: number; y: number }
  zoomToNode: (nodeId: string) => void
  onFullscreenOpen?: (nodeId: string) => void
  onEdgePreviewMove: (e: PointerEvent) => void
  onEdgeCreate: (e: PointerEvent) => void
  setLastDragEndTime: (time: number) => void
}

export interface UseNodeDraggingReturn {
  // State
  draggingNode: Ref<string | null>
  dragStart: Ref<{ x: number; y: number; nodeX: number; nodeY: number }>
  multiDragInitial: Ref<Map<string, { x: number; y: number }>>

  // Functions
  onNodePointerDown: (e: PointerEvent, nodeId: string) => void
  onNodeDrag: (e: PointerEvent) => void
  stopNodeDrag: (e: PointerEvent) => void
}

export function useNodeDragging(ctx: UseNodeDraggingContext): UseNodeDraggingReturn {
  const {
    store,
    snapToGrid,
    editingNodeId,
    editingTitleId,
    selectedEdge,
    isCreatingEdge,
    edgeStartNode,
    edgePreviewEnd,
    pushUndo,
    screenToCanvas,
    zoomToNode,
    onEdgePreviewMove,
    onEdgeCreate,
    setLastDragEndTime,
  } = ctx

  // State
  const draggingNode = ref<string | null>(null)
  const pendingDragNode = ref<string | null>(null) // Set on mousedown, promoted to draggingNode on movement
  const dragStart = ref({ x: 0, y: 0, nodeX: 0, nodeY: 0 })
  const multiDragInitial = ref<Map<string, { x: number; y: number }>>(new Map())
  const DRAG_THRESHOLD = 3 // Pixels of movement before we consider it a drag

  function onNodePointerDown(e: PointerEvent, nodeId: string) {
    e.stopPropagation()

    // Prevent text selection on shift+click or alt+click
    if (e.shiftKey || e.altKey) {
      e.preventDefault()
    }

    // Don't start drag if editing this node (content or title)
    if (editingNodeId.value === nodeId || editingTitleId.value === nodeId) {
      return
    }

    // Cmd+click (Mac) / Ctrl+click (Windows/Linux) to open fullscreen modal
    if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey) {
      if (ctx.onFullscreenOpen) {
        ctx.onFullscreenOpen(nodeId)
      } else {
        // Fallback to zoom if no fullscreen handler
        zoomToNode(nodeId)
      }
      return
    }

    // Alt+drag to create edge
    if (e.altKey) {
      const node = store.getNode(nodeId)
      if (node) {
        isCreatingEdge.value = true
        edgeStartNode.value = nodeId
        const pos = screenToCanvas(e.clientX, e.clientY)
        edgePreviewEnd.value = pos
        document.addEventListener('pointermove', onEdgePreviewMove)
        document.addEventListener('pointerup', onEdgeCreate)
      }
      return
    }

    const node = store.getNode(nodeId)
    if (!node) return

    // Note: File sync is handled by the file watcher composable, not on click.
    // Removed refreshNodeFromFile(nodeId) call to avoid file I/O blocking UI.

    // Undo state is captured only once movement promotes this to a real drag
    // (see onPointerMove). Pushing here would clear the redo stack on every
    // plain click.
    pendingDragNode.value = nodeId

    // If node is already selected, don't change selection (allows multi-drag)
    // Only select if not already selected
    if (!store.selectedNodeIds.includes(nodeId)) {
      // Ctrl is the multi-select modifier on Windows and Linux
      store.selectNode(nodeId, e.shiftKey || e.metaKey || e.ctrlKey)
    }
    selectedEdge.value = null

    const pos = screenToCanvas(e.clientX, e.clientY)
    dragStart.value = {
      x: pos.x,
      y: pos.y,
      nodeX: node.canvas_x,
      nodeY: node.canvas_y,
    }

    // Store initial positions for all selected nodes (multi-drag)
    multiDragInitial.value.clear()
    if (store.selectedNodeIds.length > 1 && store.selectedNodeIds.includes(nodeId)) {
      for (const id of store.selectedNodeIds) {
        const n = store.getNode(id)
        if (n) {
          multiDragInitial.value.set(id, { x: n.canvas_x, y: n.canvas_y })
        }
      }
    }

    document.addEventListener('pointermove', onNodeDrag)
    document.addEventListener('pointerup', stopNodeDrag)
    document.addEventListener('pointercancel', cleanupDrag)
    window.addEventListener('blur', cleanupDrag)
  }

  // Cleanup function for when drag is interrupted (blur, pointercancel, etc.)
  function cleanupDrag() {
    // The drag moved nodes with skipPersist, so the positions it reached exist
    // only in memory until they are flushed. Clearing without flushing left the
    // node where it was dropped on screen and back where it started on the next
    // load (PRODUCT_DESIGN.md > Persisting an interrupted drag)
    const movedIds =
      multiDragInitial.value.size > 0
        ? [...multiDragInitial.value.keys()]
        : draggingNode.value
          ? [draggingNode.value]
          : []
    for (const id of movedIds) {
      store.persistNodePosition(id)
    }

    if (pendingDragNode.value) {
      pendingDragNode.value = null
    }
    if (draggingNode.value) {
      draggingNode.value = null
    }
    multiDragInitial.value.clear()
    document.body.classList.remove('node-dragging')
    document.removeEventListener('pointermove', onNodeDrag)
    document.removeEventListener('pointerup', stopNodeDrag)
    document.removeEventListener('pointercancel', cleanupDrag)
    window.removeEventListener('blur', cleanupDrag)
  }

  function onNodeDrag(e: PointerEvent) {
    // Safety check: if no buttons are pressed, stop dragging
    // This handles cases where pointerup was missed (window blur, etc.)
    if (e.buttons === 0) {
      cleanupDrag()
      return
    }

    const pos = screenToCanvas(e.clientX, e.clientY)
    const dx = pos.x - dragStart.value.x
    const dy = pos.y - dragStart.value.y

    // Promote pending drag to actual drag once movement threshold is exceeded
    if (pendingDragNode.value && !draggingNode.value) {
      const distance = Math.sqrt(dx * dx + dy * dy)
      if (distance < DRAG_THRESHOLD) return // Not enough movement yet

      // Capture undo state now that this is a real drag, not a plain click
      pushUndo()

      // Start actual drag
      draggingNode.value = pendingDragNode.value
      pendingDragNode.value = null
      document.body.classList.add('node-dragging')
    }

    if (!draggingNode.value) return

    // Move all selected nodes if multi-dragging
    // Skip layout trigger during drag for performance - will trigger once at drag end
    if (multiDragInitial.value.size > 0) {
      for (const [id, initial] of multiDragInitial.value) {
        const newX = snapToGrid(initial.x + dx)
        const newY = snapToGrid(initial.y + dy)
        store.updateNodePosition(id, newX, newY, { skipLayoutTrigger: true, skipPersist: true })
      }
    } else {
      const newX = snapToGrid(dragStart.value.nodeX + dx)
      const newY = snapToGrid(dragStart.value.nodeY + dy)
      store.updateNodePosition(draggingNode.value, newX, newY, { skipLayoutTrigger: true, skipPersist: true })
    }
  }

  function stopNodeDrag(e: PointerEvent) {
    // Clear pending drag if no actual drag started
    if (pendingDragNode.value) {
      pendingDragNode.value = null
    }

    const draggedNodeId = draggingNode.value
    // Nothing was dragged unless the pointer passed the threshold.
    //
    // `multiDragInitial` is filled on pointerdown, before any movement, while
    // `draggingNode` is only set once the drag begins. Deriving the list from
    // multiDragInitial alone meant a plain click with several nodes selected
    // was treated as a drag - for a click that moved nothing
    // (PRODUCT_DESIGN.md > Telling a click from a drag)
    const draggedNodeIds = !draggedNodeId
      ? []
      : multiDragInitial.value.size > 0
        ? [...multiDragInitial.value.keys()]
        : [draggedNodeId]

    // Check if drag ended over storyline panel (using global state set by StorylinePanel)
    // Read through the module the panel writes, rather than a structural cast
    // over a window property (PRODUCT_DESIGN.md > Dropping a node on the
    // storyline panel)
    const isOverStorylinePanel = overStorylinePanel.value
    if (isOverStorylinePanel && draggedNodeIds.length > 0) {
      // Reset nodes to original positions (don't move them on canvas)
      if (multiDragInitial.value.size > 0) {
        for (const [id, initial] of multiDragInitial.value) {
          store.updateNodePosition(id, initial.x, initial.y)
        }
      } else if (draggedNodeId) {
        store.updateNodePosition(draggedNodeId, dragStart.value.nodeX, dragStart.value.nodeY)
      }
      // Emit event for storyline panel to handle
      window.dispatchEvent(
        new CustomEvent('node-dropped-on-storyline', {
          detail: { nodeIds: draggedNodeIds, x: e.clientX, y: e.clientY },
        })
      )
    }

    // Persist final positions once, now that the live drag (which ran with
    // skipPersist) has ended
    for (const nodeId of draggedNodeIds) {
      store.persistNodePosition(nodeId)
    }

    // Trigger layout update once at drag end (was skipped during drag for performance)
    store.triggerLayoutUpdate()

    draggingNode.value = null
    multiDragInitial.value.clear()
    setLastDragEndTime(Date.now())
    document.body.classList.remove('node-dragging')
    document.removeEventListener('pointermove', onNodeDrag)
    document.removeEventListener('pointerup', stopNodeDrag)
    document.removeEventListener('pointercancel', cleanupDrag)
    window.removeEventListener('blur', cleanupDrag)
  }

  return {
    draggingNode,
    dragStart,
    multiDragInitial,
    onNodePointerDown,
    onNodeDrag,
    stopNodeDrag,
  }
}
