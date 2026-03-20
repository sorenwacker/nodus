/**
 * Node resize composable
 * Manages resizing nodes on the canvas
 */
import { ref } from 'vue'
import type { Node } from '../../types'

export interface NodeResizeStore {
  getNode: (id: string) => Node | undefined
  selectedNodeIds: string[]
  updateNodeSize: (id: string, width: number, height: number) => Promise<void>
  updateNodePosition: (id: string, x: number, y: number) => Promise<void>
}

export interface UseNodeResizeOptions {
  store: NodeResizeStore
  screenToCanvas: (x: number, y: number) => { x: number; y: number }
  minWidth?: number
  minHeight?: number
  onResizeStart?: () => void
  onResizeEnd?: () => void
}

export function useNodeResize(options: UseNodeResizeOptions) {
  const {
    store,
    screenToCanvas,
    minWidth = 150,
    minHeight = 80,
    onResizeStart,
    onResizeEnd
  } = options

  const resizingNode = ref<string | null>(null)
  const resizeDirection = ref<string>('se') // n, s, e, w, nw, ne, se, sw
  const resizeStart = ref({ x: 0, y: 0, width: 0, height: 0, nodeX: 0, nodeY: 0 })
  const resizePreview = ref({ width: 0, height: 0, x: 0, y: 0 })
  const multiResizeInitial = ref<Map<string, { width: number; height: number; x: number; y: number }>>(new Map())

  function onResizeMouseDown(e: MouseEvent, nodeId: string, direction: string) {
    e.stopPropagation()
    e.preventDefault()

    const node = store.getNode(nodeId)
    if (!node) return

    resizingNode.value = nodeId
    resizeDirection.value = direction

    const canvasPos = screenToCanvas(e.clientX, e.clientY)
    resizeStart.value = {
      x: canvasPos.x,
      y: canvasPos.y,
      width: node.width || 200,
      height: node.height || 150,
      nodeX: node.canvas_x,
      nodeY: node.canvas_y,
    }
    resizePreview.value = {
      width: node.width || 200,
      height: node.height || 150,
      x: node.canvas_x,
      y: node.canvas_y,
    }

    // If resizing a selected node, store initial sizes of all selected nodes
    if (store.selectedNodeIds.includes(nodeId)) {
      multiResizeInitial.value.clear()
      for (const id of store.selectedNodeIds) {
        const n = store.getNode(id)
        if (n) {
          multiResizeInitial.value.set(id, {
            width: n.width || 200,
            height: n.height || 150,
            x: n.canvas_x,
            y: n.canvas_y,
          })
        }
      }
    } else {
      multiResizeInitial.value.clear()
    }

    onResizeStart?.()
    document.addEventListener('mousemove', onResizeMove)
    document.addEventListener('mouseup', stopResize)
  }

  function onResizeMove(e: MouseEvent) {
    if (!resizingNode.value) return

    const canvasPos = screenToCanvas(e.clientX, e.clientY)
    const dx = canvasPos.x - resizeStart.value.x
    const dy = canvasPos.y - resizeStart.value.y
    const dir = resizeDirection.value

    let newWidth = resizeStart.value.width
    let newHeight = resizeStart.value.height
    let newX = resizeStart.value.nodeX
    let newY = resizeStart.value.nodeY

    // Calculate new dimensions based on direction
    if (dir.includes('e')) newWidth = Math.max(minWidth, resizeStart.value.width + dx)
    if (dir.includes('w')) {
      newWidth = Math.max(minWidth, resizeStart.value.width - dx)
      newX = resizeStart.value.nodeX + (resizeStart.value.width - newWidth)
    }
    if (dir.includes('s')) newHeight = Math.max(minHeight, resizeStart.value.height + dy)
    if (dir.includes('n')) {
      newHeight = Math.max(minHeight, resizeStart.value.height - dy)
      newY = resizeStart.value.nodeY + (resizeStart.value.height - newHeight)
    }

    resizePreview.value = { width: newWidth, height: newHeight, x: newX, y: newY }

    // Apply to node(s)
    if (multiResizeInitial.value.size > 0) {
      const widthRatio = newWidth / resizeStart.value.width
      const heightRatio = newHeight / resizeStart.value.height

      for (const [id, initial] of multiResizeInitial.value) {
        const node = store.getNode(id)
        if (node) {
          node.width = Math.max(minWidth, initial.width * widthRatio)
          node.height = Math.max(minHeight, initial.height * heightRatio)
        }
      }
    } else {
      const node = store.getNode(resizingNode.value)
      if (node) {
        node.width = newWidth
        node.height = newHeight
        node.canvas_x = newX
        node.canvas_y = newY
      }
    }
  }

  async function stopResize() {
    document.removeEventListener('mousemove', onResizeMove)
    document.removeEventListener('mouseup', stopResize)

    if (!resizingNode.value) return

    // Persist sizes
    if (multiResizeInitial.value.size > 0) {
      for (const id of multiResizeInitial.value.keys()) {
        const node = store.getNode(id)
        if (node) {
          await store.updateNodeSize(id, node.width || 200, node.height || 150)
        }
      }
    } else {
      const node = store.getNode(resizingNode.value)
      if (node) {
        await store.updateNodeSize(resizingNode.value, node.width || 200, node.height || 150)
        await store.updateNodePosition(resizingNode.value, node.canvas_x, node.canvas_y)
      }
    }

    onResizeEnd?.()
    resizingNode.value = null
    multiResizeInitial.value.clear()
  }

  function isResizing(nodeId: string): boolean {
    return resizingNode.value === nodeId
  }

  return {
    resizingNode,
    resizeDirection,
    resizeStart,
    resizePreview,
    multiResizeInitial,
    onResizeMouseDown,
    onResizeMove,
    stopResize,
    isResizing,
  }
}
