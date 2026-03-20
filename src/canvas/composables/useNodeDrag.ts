/**
 * Node drag composable
 * Manages dragging nodes on the canvas
 */
import { ref } from 'vue'
import type { Node } from '../../types'

export interface NodeDragStore {
  getNode: (id: string) => Node | undefined
  selectedNodeIds: string[]
  updateNodePosition: (id: string, x: number, y: number) => Promise<void>
}

export interface UseNodeDragOptions {
  store: NodeDragStore
  screenToCanvas: (x: number, y: number) => { x: number; y: number }
  snapToGrid?: (value: number) => number
  onDragStart?: () => void
  onDragEnd?: () => void
}

export function useNodeDrag(options: UseNodeDragOptions) {
  const { store, screenToCanvas, snapToGrid = (v) => v, onDragStart, onDragEnd } = options

  const draggingNode = ref<string | null>(null)
  const dragStart = ref({ x: 0, y: 0, nodeX: 0, nodeY: 0 })
  const multiDragInitial = ref<Map<string, { x: number; y: number }>>(new Map())

  function onNodeMouseDown(e: MouseEvent, nodeId: string) {
    if (e.button !== 0) return // Left click only

    const node = store.getNode(nodeId)
    if (!node) return

    draggingNode.value = nodeId
    const canvasPos = screenToCanvas(e.clientX, e.clientY)
    dragStart.value = {
      x: canvasPos.x,
      y: canvasPos.y,
      nodeX: node.canvas_x,
      nodeY: node.canvas_y,
    }

    // If dragging a selected node, store initial positions of all selected nodes
    if (store.selectedNodeIds.includes(nodeId)) {
      multiDragInitial.value.clear()
      for (const id of store.selectedNodeIds) {
        const n = store.getNode(id)
        if (n) {
          multiDragInitial.value.set(id, { x: n.canvas_x, y: n.canvas_y })
        }
      }
    } else {
      multiDragInitial.value.clear()
    }

    onDragStart?.()
    document.addEventListener('mousemove', onNodeDrag)
    document.addEventListener('mouseup', stopNodeDrag)
  }

  function onNodeDrag(e: MouseEvent) {
    if (!draggingNode.value) return

    const canvasPos = screenToCanvas(e.clientX, e.clientY)
    const dx = canvasPos.x - dragStart.value.x
    const dy = canvasPos.y - dragStart.value.y

    // If multi-select drag, move all selected nodes
    if (multiDragInitial.value.size > 0) {
      for (const [id, initial] of multiDragInitial.value) {
        const node = store.getNode(id)
        if (node) {
          node.canvas_x = snapToGrid(initial.x + dx)
          node.canvas_y = snapToGrid(initial.y + dy)
        }
      }
    } else {
      // Single node drag
      const node = store.getNode(draggingNode.value)
      if (node) {
        node.canvas_x = snapToGrid(dragStart.value.nodeX + dx)
        node.canvas_y = snapToGrid(dragStart.value.nodeY + dy)
      }
    }
  }

  async function stopNodeDrag() {
    document.removeEventListener('mousemove', onNodeDrag)
    document.removeEventListener('mouseup', stopNodeDrag)

    if (!draggingNode.value) return

    // Persist positions
    if (multiDragInitial.value.size > 0) {
      for (const id of multiDragInitial.value.keys()) {
        const node = store.getNode(id)
        if (node) {
          await store.updateNodePosition(id, node.canvas_x, node.canvas_y)
        }
      }
    } else {
      const node = store.getNode(draggingNode.value)
      if (node) {
        await store.updateNodePosition(draggingNode.value, node.canvas_x, node.canvas_y)
      }
    }

    onDragEnd?.()
    draggingNode.value = null
    multiDragInitial.value.clear()
  }

  return {
    draggingNode,
    dragStart,
    multiDragInitial,
    onNodeMouseDown,
    onNodeDrag,
    stopNodeDrag,
  }
}
