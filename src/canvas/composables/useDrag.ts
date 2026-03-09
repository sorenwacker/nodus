/**
 * Drag composable
 * Handles node dragging with multi-select support
 */
import { ref } from 'vue'

interface DragState {
  nodeId: string
  startX: number
  startY: number
  nodeStartX: number
  nodeStartY: number
  otherNodes: Array<{ id: string; startX: number; startY: number }>
}

export function useDrag() {
  const isDragging = ref(false)
  const dragState = ref<DragState | null>(null)

  function startDrag(
    nodeId: string,
    clientX: number,
    clientY: number,
    nodeX: number,
    nodeY: number,
    selectedNodeIds: Set<string>,
    getNodePosition: (id: string) => { canvas_x: number; canvas_y: number } | undefined,
    scale: number
  ) {
    isDragging.value = true

    // Collect positions of other selected nodes for multi-drag
    const otherNodes: DragState['otherNodes'] = []
    if (selectedNodeIds.has(nodeId)) {
      for (const id of selectedNodeIds) {
        if (id !== nodeId) {
          const pos = getNodePosition(id)
          if (pos) {
            otherNodes.push({ id, startX: pos.canvas_x, startY: pos.canvas_y })
          }
        }
      }
    }

    dragState.value = {
      nodeId,
      startX: clientX / scale,
      startY: clientY / scale,
      nodeStartX: nodeX,
      nodeStartY: nodeY,
      otherNodes,
    }
  }

  function updateDrag(
    clientX: number,
    clientY: number,
    scale: number,
    updatePosition: (id: string, x: number, y: number) => void,
    snapToGrid: boolean = false,
    gridSize: number = 20
  ) {
    if (!isDragging.value || !dragState.value) return

    const dx = clientX / scale - dragState.value.startX
    const dy = clientY / scale - dragState.value.startY

    let newX = dragState.value.nodeStartX + dx
    let newY = dragState.value.nodeStartY + dy

    if (snapToGrid) {
      newX = Math.round(newX / gridSize) * gridSize
      newY = Math.round(newY / gridSize) * gridSize
    }

    // Update primary node
    updatePosition(dragState.value.nodeId, newX, newY)

    // Update other selected nodes (maintain relative positions)
    for (const other of dragState.value.otherNodes) {
      let otherX = other.startX + dx
      let otherY = other.startY + dy

      if (snapToGrid) {
        otherX = Math.round(otherX / gridSize) * gridSize
        otherY = Math.round(otherY / gridSize) * gridSize
      }

      updatePosition(other.id, otherX, otherY)
    }
  }

  function endDrag(
    persistPosition: (id: string, x: number, y: number) => Promise<void>,
    getNodePosition: (id: string) => { canvas_x: number; canvas_y: number } | undefined
  ): Promise<void[]> {
    if (!isDragging.value || !dragState.value) {
      isDragging.value = false
      dragState.value = null
      return Promise.resolve([])
    }

    const promises: Promise<void>[] = []

    // Persist primary node position
    const primaryPos = getNodePosition(dragState.value.nodeId)
    if (primaryPos) {
      promises.push(persistPosition(dragState.value.nodeId, primaryPos.canvas_x, primaryPos.canvas_y))
    }

    // Persist other selected nodes
    for (const other of dragState.value.otherNodes) {
      const pos = getNodePosition(other.id)
      if (pos) {
        promises.push(persistPosition(other.id, pos.canvas_x, pos.canvas_y))
      }
    }

    isDragging.value = false
    dragState.value = null

    return Promise.all(promises)
  }

  function cancelDrag() {
    isDragging.value = false
    dragState.value = null
  }

  return {
    isDragging,
    dragState,
    startDrag,
    updateDrag,
    endDrag,
    cancelDrag,
  }
}
