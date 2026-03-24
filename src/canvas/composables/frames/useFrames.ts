/**
 * Frame operations composable
 * Handles frame creation, dragging, resizing, and title editing
 */
import { ref, nextTick, type Ref } from 'vue'
import { NODE_DEFAULTS } from '../../constants'

interface Point {
  x: number
  y: number
}

interface Node {
  id: string
  canvas_x: number
  canvas_y: number
  width?: number
  height?: number
}

interface Frame {
  id: string
  canvas_x: number
  canvas_y: number
  width: number
  height: number
  title: string
}

interface Store {
  frames: Frame[]
  filteredNodes: Node[]
  selectedNodeIds: string[]
  selectedFrameId: string | null
  selectFrame: (id: string | null) => void
  selectNode: (id: string | null) => void
  createFrame: (x: number, y: number, w: number, h: number, title: string) => Frame
  deleteFrame: (id: string) => void
  updateFramePosition: (id: string, x: number, y: number) => void
  updateFrameSize: (id: string, w: number, h: number) => void
  updateFrameTitle: (id: string, title: string) => void
  updateNodePosition: (id: string, x: number, y: number) => void
}

interface ViewState {
  scale: Ref<number>
  offsetX: Ref<number>
  offsetY: Ref<number>
  canvasRect: () => DOMRect | null
}

export interface UseFramesOptions {
  store: Store
  viewState: ViewState
  screenToCanvas: (x: number, y: number) => Point
  snapToGrid: (value: number) => number
}

export function useFrames(options: UseFramesOptions) {
  const { store, viewState, screenToCanvas, snapToGrid } = options

  // State
  const draggingFrame = ref<string | null>(null)
  const frameDragStart = ref({ x: 0, y: 0, frameX: 0, frameY: 0 })
  const frameContainedNodes = ref<Map<string, { x: number; y: number }>>(new Map())
  const resizingFrame = ref<string | null>(null)
  const resizeDirection = ref<string>('se')
  const frameResizeStart = ref({ x: 0, y: 0, width: 0, height: 0, frameX: 0, frameY: 0 })
  const editingFrameId = ref<string | null>(null)
  const editFrameTitle = ref('')
  const pendingFramePlacement = ref(false)

  function onPointerDown(e: PointerEvent, frameId: string) {
    console.log('[Frame] onPointerDown:', frameId)
    e.preventDefault()
    store.selectFrame(frameId)
    console.log('[Frame] selectedFrameId after selectFrame:', store.selectedFrameId)
    store.selectNode(null)
    // Log all frames to verify CSS class should apply
    console.log('[Frame] frames in store:', store.frames.map(f => ({ id: f.id, title: f.title })))

    const frame = store.frames.find(f => f.id === frameId)
    if (!frame) return

    draggingFrame.value = frameId
    const pos = screenToCanvas(e.clientX, e.clientY)
    frameDragStart.value = {
      x: pos.x,
      y: pos.y,
      frameX: frame.canvas_x,
      frameY: frame.canvas_y,
    }

    // Find nodes inside the frame and store their initial positions
    frameContainedNodes.value.clear()
    for (const node of store.filteredNodes) {
      const nodeRight = node.canvas_x + (node.width || NODE_DEFAULTS.WIDTH)
      const nodeBottom = node.canvas_y + (node.height || NODE_DEFAULTS.HEIGHT)
      const frameRight = frame.canvas_x + frame.width
      const frameBottom = frame.canvas_y + frame.height

      // Check if node overlaps with frame (at least 50% inside)
      const overlapX = Math.max(0, Math.min(nodeRight, frameRight) - Math.max(node.canvas_x, frame.canvas_x))
      const overlapY = Math.max(0, Math.min(nodeBottom, frameBottom) - Math.max(node.canvas_y, frame.canvas_y))
      const nodeArea = (node.width || NODE_DEFAULTS.WIDTH) * (node.height || NODE_DEFAULTS.HEIGHT)
      const overlapArea = overlapX * overlapY

      if (overlapArea > nodeArea * 0.5) {
        frameContainedNodes.value.set(node.id, { x: node.canvas_x, y: node.canvas_y })
      }
    }

    document.addEventListener('pointermove', onDrag)
    document.addEventListener('pointerup', stopDrag)
  }

  function onDrag(e: PointerEvent) {
    if (!draggingFrame.value) return
    const pos = screenToCanvas(e.clientX, e.clientY)
    const dx = pos.x - frameDragStart.value.x
    const dy = pos.y - frameDragStart.value.y
    const newX = snapToGrid(frameDragStart.value.frameX + dx)
    const newY = snapToGrid(frameDragStart.value.frameY + dy)
    store.updateFramePosition(draggingFrame.value, newX, newY)

    // Move contained nodes with the frame
    for (const [nodeId, initialPos] of frameContainedNodes.value) {
      const newNodeX = snapToGrid(initialPos.x + dx)
      const newNodeY = snapToGrid(initialPos.y + dy)
      store.updateNodePosition(nodeId, newNodeX, newNodeY)
    }
  }

  function stopDrag() {
    draggingFrame.value = null
    frameContainedNodes.value.clear()
    document.removeEventListener('pointermove', onDrag)
    document.removeEventListener('pointerup', stopDrag)
  }

  function startResize(e: PointerEvent, frameId: string, direction = 'se') {
    e.preventDefault()
    const frame = store.frames.find(f => f.id === frameId)
    if (!frame) return

    resizingFrame.value = frameId
    resizeDirection.value = direction
    frameResizeStart.value = {
      x: e.clientX,
      y: e.clientY,
      width: frame.width,
      height: frame.height,
      frameX: frame.canvas_x,
      frameY: frame.canvas_y,
    }

    document.addEventListener('pointermove', onResize)
    document.addEventListener('pointerup', stopResize)
  }

  function onResize(e: PointerEvent) {
    if (!resizingFrame.value) return
    const dx = (e.clientX - frameResizeStart.value.x) / viewState.scale.value
    const dy = (e.clientY - frameResizeStart.value.y) / viewState.scale.value
    const dir = resizeDirection.value
    const minWidth = 200
    const minHeight = 100

    let newX = frameResizeStart.value.frameX
    let newY = frameResizeStart.value.frameY
    let newWidth = frameResizeStart.value.width
    let newHeight = frameResizeStart.value.height

    // Handle horizontal resize
    if (dir.includes('e')) {
      newWidth = Math.max(minWidth, frameResizeStart.value.width + dx)
    } else if (dir.includes('w')) {
      const widthChange = Math.min(dx, frameResizeStart.value.width - minWidth)
      newWidth = frameResizeStart.value.width - widthChange
      newX = frameResizeStart.value.frameX + widthChange
    }

    // Handle vertical resize
    if (dir.includes('s')) {
      newHeight = Math.max(minHeight, frameResizeStart.value.height + dy)
    } else if (dir.includes('n')) {
      const heightChange = Math.min(dy, frameResizeStart.value.height - minHeight)
      newHeight = frameResizeStart.value.height - heightChange
      newY = frameResizeStart.value.frameY + heightChange
    }

    store.updateFramePosition(resizingFrame.value, newX, newY)
    store.updateFrameSize(resizingFrame.value, newWidth, newHeight)
  }

  function stopResize() {
    resizingFrame.value = null
    document.removeEventListener('pointermove', onResize)
    document.removeEventListener('pointerup', stopResize)
  }

  function startEditingTitle(frameId: string) {
    const frame = store.frames.find(f => f.id === frameId)
    if (!frame) return
    editingFrameId.value = frameId
    editFrameTitle.value = frame.title
    nextTick(() => {
      const input = document.querySelector('.frame-title-editor') as HTMLInputElement
      input?.focus()
      input?.select()
    })
  }

  function saveTitle() {
    if (editingFrameId.value && editFrameTitle.value.trim()) {
      store.updateFrameTitle(editingFrameId.value, editFrameTitle.value.trim())
    }
    editingFrameId.value = null
  }

  function cancelTitleEditing() {
    editingFrameId.value = null
  }

  function createAtCenter() {
    const rect = viewState.canvasRect()
    if (!rect) {
      console.error('createFrameAtCenter: canvasRef not available')
      return
    }

    // If nodes are selected, create frame around them immediately
    if (store.selectedNodeIds.length > 0) {
      const selectedNodes = store.filteredNodes.filter(n => store.selectedNodeIds.includes(n.id))
      const padding = 40

      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
      for (const node of selectedNodes) {
        minX = Math.min(minX, node.canvas_x)
        minY = Math.min(minY, node.canvas_y)
        maxX = Math.max(maxX, node.canvas_x + (node.width || NODE_DEFAULTS.WIDTH))
        maxY = Math.max(maxY, node.canvas_y + (node.height || NODE_DEFAULTS.HEIGHT))
      }

      const frameX = minX - padding
      const frameY = minY - padding
      const frameWidth = maxX - minX + padding * 2
      const frameHeight = maxY - minY + padding * 2

      const frame = store.createFrame(frameX, frameY, frameWidth, frameHeight, 'Frame')
      store.selectFrame(frame.id)
      store.selectNode(null)
      return
    }

    // No selection - enable placement mode (wait for click)
    pendingFramePlacement.value = true
  }

  function createAtPosition(x: number, y: number) {
    const frame = store.createFrame(x - 200, y - 150, 400, 300, 'New Frame')
    store.selectFrame(frame.id)
    pendingFramePlacement.value = false
  }

  function cancelPlacement() {
    pendingFramePlacement.value = false
  }

  function deleteSelected() {
    if (store.selectedFrameId) {
      store.deleteFrame(store.selectedFrameId)
      store.selectFrame(null)
    }
  }

  return {
    // State
    draggingFrame,
    resizingFrame,
    editingFrameId,
    editFrameTitle,
    pendingFramePlacement,

    // Functions
    onPointerDown,
    startResize,
    startEditingTitle,
    saveTitle,
    cancelTitleEditing,
    createAtCenter,
    createAtPosition,
    cancelPlacement,
    deleteSelected,
  }
}
