/**
 * Frame operations composable
 * Handles frame creation, dragging, resizing, and title editing
 */
import { ref, nextTick, type Ref } from 'vue'
import type { Frame, Node } from '../../../types'
import { NODE_DEFAULTS } from '../../constants'

interface Point {
  x: number
  y: number
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
  updateFramePosition: (id: string, x: number, y: number, options?: { skipPersist?: boolean }) => void
  persistFramePosition: (id: string) => void
  updateFrameSize: (id: string, w: number, h: number, options?: { skipPersist?: boolean }) => void
  persistFrameSize: (id: string) => void
  updateFrameTitle: (id: string, title: string) => void
  updateNodePosition: (id: string, x: number, y: number, options?: { skipLayoutTrigger?: boolean; skipPersist?: boolean }) => void
  persistNodePosition: (id: string) => void
  assignNodesToFrame: (nodeIds: string[], frameId: string | null) => void
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
  /** Callback to resolve frame-to-frame overlaps after drag or resize */
  resolveFrameCollisions?: () => void
  /** Callback to capture frame positions for undo before drag starts */
  pushFramePositionUndo?: () => void
  /** Callback to organize nodes after frame resize (pull members in, push others out) */
  organizeFrameNodes?: (frameId: string) => void
}

export function useFrames(options: UseFramesOptions) {
  const { store, viewState, screenToCanvas, snapToGrid, resolveFrameCollisions, pushFramePositionUndo, organizeFrameNodes } = options

  // A press has to travel this far, in screen pixels, before it counts as a
  // drag rather than a click. Panning applies the same 3px rule in
  // useCanvasPan; without it here, selecting a frame moved it, and a pen or
  // touch contact - which never holds perfectly still - moved it every time.
  const FRAME_DRAG_THRESHOLD_PX = 3

  // State
  const draggingFrame = ref<string | null>(null)
  /**
   * The frame under an armed press that has not yet passed the threshold.
   * It becomes draggingFrame on the first qualifying move.
   */
  const pendingDragFrame = ref<string | null>(null)
  const frameDragStart = ref({ x: 0, y: 0, frameX: 0, frameY: 0 })
  /** Screen coords of the press, for the threshold test */
  const frameDragOrigin = ref({ x: 0, y: 0 })
  const frameContainedNodes = ref<Map<string, { x: number; y: number }>>(new Map())
  const resizingFrame = ref<string | null>(null)
  const resizeDirection = ref<string>('se')
  const frameResizeStart = ref({ x: 0, y: 0, width: 0, height: 0, frameX: 0, frameY: 0 })
  const editingFrameId = ref<string | null>(null)
  const editFrameTitle = ref('')
  const pendingFramePlacement = ref(false)

  function onPointerDown(e: PointerEvent, frameId: string) {
    e.preventDefault()
    store.selectFrame(frameId)
    store.selectNode(null)

    const frame = store.frames.find(f => f.id === frameId)
    if (!frame) return

    // Arm the drag; it only starts once the pointer clears the threshold.
    //
    // The undo snapshot is deliberately not taken here. Taking it on every
    // press pushed a frame-geometry entry for plain selection clicks too, so
    // the stack filled with snapshots identical to the current state and undo
    // appeared to do nothing - it was restoring geometry that had never
    // changed. It is captured in beginDrag instead, once a move is real.
    pendingDragFrame.value = frameId
    frameDragOrigin.value = { x: e.clientX, y: e.clientY }
    const pos = screenToCanvas(e.clientX, e.clientY)
    frameDragStart.value = {
      x: pos.x,
      y: pos.y,
      frameX: frame.canvas_x,
      frameY: frame.canvas_y,
    }

    // The nodes that travel with the frame are its members, by frame_id.
    //
    // This decided membership by spatial overlap instead, so dragging a frame
    // carried unrelated nodes that merely sat on top of it and left behind
    // members that had been moved outside its bounds. Every other frame-aware
    // path in this module group states the opposite rule: frame_id is the only
    // source of truth, with no spatial fallback, because overlap makes
    // membership depend on where things happen to be
    // (PRODUCT_DESIGN.md > What belongs to a frame)
    frameContainedNodes.value.clear()
    for (const node of store.filteredNodes) {
      if (node.frame_id === frame.id) {
        frameContainedNodes.value.set(node.id, { x: node.canvas_x, y: node.canvas_y })
      }
    }

    document.addEventListener('pointermove', onDrag)
    document.addEventListener('pointerup', stopDrag)
  }

  /** Promote an armed press to a real drag, recording undo at that moment. */
  function beginDrag(frameId: string) {
    pushFramePositionUndo?.()
    pendingDragFrame.value = null
    draggingFrame.value = frameId
  }

  function onDrag(e: PointerEvent) {
    if (pendingDragFrame.value) {
      const dxScreen = e.clientX - frameDragOrigin.value.x
      const dyScreen = e.clientY - frameDragOrigin.value.y
      if (
        Math.abs(dxScreen) <= FRAME_DRAG_THRESHOLD_PX &&
        Math.abs(dyScreen) <= FRAME_DRAG_THRESHOLD_PX
      ) {
        return
      }
      beginDrag(pendingDragFrame.value)
    }
    if (!draggingFrame.value) return
    const pos = screenToCanvas(e.clientX, e.clientY)
    const dx = pos.x - frameDragStart.value.x
    const dy = pos.y - frameDragStart.value.y
    const newX = snapToGrid(frameDragStart.value.frameX + dx)
    const newY = snapToGrid(frameDragStart.value.frameY + dy)
    // Update in memory only during the drag; the backend writes (one IPC per
    // frame and per contained node per pointermove otherwise) are flushed once
    // on pointerup in stopDrag.
    store.updateFramePosition(draggingFrame.value, newX, newY, { skipPersist: true })

    // Move contained nodes with the frame
    for (const [nodeId, initialPos] of frameContainedNodes.value) {
      const newNodeX = snapToGrid(initialPos.x + dx)
      const newNodeY = snapToGrid(initialPos.y + dy)
      store.updateNodePosition(nodeId, newNodeX, newNodeY, { skipLayoutTrigger: true, skipPersist: true })
    }
  }

  function stopDrag() {
    const frameId = draggingFrame.value
    // Persist final positions of the frame and every node it carried
    if (frameId) {
      store.persistFramePosition(frameId)
      for (const nodeId of frameContainedNodes.value.keys()) {
        store.persistNodePosition(nodeId)
      }
    }
    const dragged = frameId !== null
    draggingFrame.value = null
    pendingDragFrame.value = null
    frameContainedNodes.value.clear()
    document.removeEventListener('pointermove', onDrag)
    document.removeEventListener('pointerup', stopDrag)
    // Only after a real drag. A press that never cleared the threshold moved
    // nothing, so resolving collisions would shift frames the user did not
    // touch - and would do it with no undo entry behind it.
    if (dragged) resolveFrameCollisions?.()
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

    // Memory only during the gesture; both are flushed once on pointerup
    // (PRODUCT_DESIGN.md > Persisting a gesture)
    store.updateFramePosition(resizingFrame.value, newX, newY, { skipPersist: true })
    store.updateFrameSize(resizingFrame.value, newWidth, newHeight, { skipPersist: true })
  }

  function stopResize() {
    const frameId = resizingFrame.value
    resizingFrame.value = null
    // Store where the resize landed, since the gesture wrote memory only
    if (frameId) {
      store.persistFramePosition(frameId)
      store.persistFrameSize(frameId)
    }
    document.removeEventListener('pointermove', onResize)
    document.removeEventListener('pointerup', stopResize)
    // Resolve frame-to-frame collisions after resize ends
    resolveFrameCollisions?.()
    // Organize nodes: pull members in, push non-members out
    if (frameId) {
      organizeFrameNodes?.(frameId)
    }
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
