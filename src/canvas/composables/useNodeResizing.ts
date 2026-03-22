/**
 * Node resizing composable
 *
 * Handles node resize interactions including multi-select resizing
 */

import { ref, type Ref } from 'vue'
import { NODE_DEFAULTS } from '../constants'
import type { Node } from '../../types'

export interface UseNodeResizingContext {
  store: {
    getNode: (id: string) => Node | undefined
    updateNodeSize: (id: string, width: number, height: number) => void
    updateNodePosition: (id: string, x: number, y: number) => void
    selectedNodeIds: string[]
  }
  scale: Ref<number>
  gridLockEnabled: Ref<boolean>
  snapToGrid: (value: number) => number
  neighborhoodMode: Ref<boolean>
  focusNodeId: Ref<string | null>
  layoutNeighborhood: (focusId: string) => void
  pushOverlappingNodesAway: (sourceId: string) => void
  setLastDragEndTime: (time: number) => void
}

export interface UseNodeResizingReturn {
  // State
  resizingNode: Ref<string | null>
  resizeDirection: Ref<string>
  resizeStart: Ref<{ x: number; y: number; width: number; height: number; nodeX: number; nodeY: number }>
  resizePreview: Ref<{ width: number; height: number; x: number; y: number }>

  // Functions
  onResizeMouseDown: (e: MouseEvent, nodeId: string, direction?: string) => void
  onResizeMove: (e: MouseEvent) => void
  stopResize: () => void
}

export function useNodeResizing(ctx: UseNodeResizingContext): UseNodeResizingReturn {
  const {
    store,
    scale,
    gridLockEnabled,
    snapToGrid,
    neighborhoodMode,
    focusNodeId,
    layoutNeighborhood,
    pushOverlappingNodesAway,
    setLastDragEndTime,
  } = ctx

  // State
  const resizingNode = ref<string | null>(null)
  const resizeDirection = ref<string>('se')
  const resizeStart = ref({ x: 0, y: 0, width: 0, height: 0, nodeX: 0, nodeY: 0 })
  const resizePreview = ref({ width: 0, height: 0, x: 0, y: 0 })
  const multiResizeInitial = ref<Map<string, { width: number; height: number; x: number; y: number }>>(new Map())

  function onResizeMouseDown(e: MouseEvent, nodeId: string, direction: string = 'se') {
    e.stopPropagation()
    e.preventDefault()

    const node = store.getNode(nodeId)
    if (!node) return

    resizingNode.value = nodeId
    resizeDirection.value = direction
    resizeStart.value = {
      x: e.clientX,
      y: e.clientY,
      width: node.width || NODE_DEFAULTS.WIDTH,
      height: node.height || NODE_DEFAULTS.HEIGHT,
      nodeX: node.canvas_x,
      nodeY: node.canvas_y,
    }
    resizePreview.value = {
      width: node.width || NODE_DEFAULTS.WIDTH,
      height: node.height || NODE_DEFAULTS.HEIGHT,
      x: node.canvas_x,
      y: node.canvas_y,
    }

    // Store initial sizes of all selected nodes for multi-resize
    multiResizeInitial.value.clear()
    if (store.selectedNodeIds.includes(nodeId) && store.selectedNodeIds.length > 1) {
      for (const id of store.selectedNodeIds) {
        const n = store.getNode(id)
        if (n) {
          multiResizeInitial.value.set(id, {
            width: n.width || NODE_DEFAULTS.WIDTH,
            height: n.height || NODE_DEFAULTS.HEIGHT,
            x: n.canvas_x,
            y: n.canvas_y,
          })
        }
      }
    }

    document.addEventListener('mousemove', onResizeMove)
    document.addEventListener('mouseup', stopResize)
  }

  function onResizeMove(e: MouseEvent) {
    if (!resizingNode.value) return

    const dx = (e.clientX - resizeStart.value.x) / scale.value
    const dy = (e.clientY - resizeStart.value.y) / scale.value
    const dir = resizeDirection.value

    let width = resizeStart.value.width
    let height = resizeStart.value.height
    let x = resizeStart.value.nodeX
    let y = resizeStart.value.nodeY

    // Handle horizontal resize
    if (dir.includes('e')) {
      width = Math.max(120, resizeStart.value.width + dx)
    } else if (dir.includes('w')) {
      const newWidth = Math.max(120, resizeStart.value.width - dx)
      x = resizeStart.value.nodeX + (resizeStart.value.width - newWidth)
      width = newWidth
    }

    // Handle vertical resize
    if (dir.includes('s')) {
      height = Math.max(60, resizeStart.value.height + dy)
    } else if (dir.includes('n')) {
      const newHeight = Math.max(60, resizeStart.value.height - dy)
      y = resizeStart.value.nodeY + (resizeStart.value.height - newHeight)
      height = newHeight
    }

    // Apply grid snap if enabled
    if (gridLockEnabled.value) {
      width = snapToGrid(width)
      height = snapToGrid(height)
      x = snapToGrid(x)
      y = snapToGrid(y)
    }

    resizePreview.value = { width, height, x, y }

    // Update all selected nodes to the SAME size (not proportional)
    if (multiResizeInitial.value.size > 0) {
      for (const [id] of multiResizeInitial.value) {
        if (id === resizingNode.value) continue
        const n = store.getNode(id)
        if (n) {
          // Direct mutation for live preview
          ;(n as { width: number }).width = width
          ;(n as { height: number }).height = height
        }
      }
    }
  }

  function stopResize() {
    if (resizingNode.value) {
      const nodeId = resizingNode.value
      const { width, height, x, y } = resizePreview.value

      // Update primary node size and position
      store.updateNodeSize(nodeId, width, height)
      store.updateNodePosition(nodeId, x, y)

      // Update all other selected nodes to the SAME size
      if (multiResizeInitial.value.size > 0) {
        for (const [id] of multiResizeInitial.value) {
          if (id === nodeId) continue
          store.updateNodeSize(id, width, height)
        }
      }

      // In neighborhood mode, re-layout to adapt to new sizes
      if (neighborhoodMode.value && focusNodeId.value) {
        setTimeout(() => layoutNeighborhood(focusNodeId.value!), 10)
      } else {
        pushOverlappingNodesAway(nodeId)
      }
    }
    resizingNode.value = null
    multiResizeInitial.value.clear()
    setLastDragEndTime(Date.now())
    document.removeEventListener('mousemove', onResizeMove)
    document.removeEventListener('mouseup', stopResize)
  }

  return {
    resizingNode,
    resizeDirection,
    resizeStart,
    resizePreview,
    onResizeMouseDown,
    onResizeMove,
    stopResize,
  }
}
