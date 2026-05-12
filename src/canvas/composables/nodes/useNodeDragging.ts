/**
 * Node dragging composable
 *
 * Handles node drag interactions including multi-select dragging
 */

import { ref, type Ref } from 'vue'
import { NODE_DEFAULTS } from '../../constants'
import type { Node, Frame } from '../../../types'

export interface UseNodeDraggingContext {
  store: {
    getNode: (id: string) => Node | undefined
    updateNodePosition: (id: string, x: number, y: number) => void
    selectNode: (id: string, multi: boolean) => void
    selectedNodeIds: string[]
    filteredNodes: Node[]
    filteredEdges: Array<{ id: string; source_node_id: string; target_node_id: string }>
    frames: Frame[]
    assignNodesToFrame: (nodeIds: string[], frameId: string | null) => void
    refreshNodeFromFile: (id: string) => void
    nodeLayoutVersion: number
    updateNodeFilePath?: (nodeId: string, filePath: string) => void
  }
  // File sync dependencies (optional)
  checkFileCollision?: (nodeId: string, targetFolder: string) => Promise<string | null>
  moveNodeFile?: (nodeId: string, targetFolder: string, collisionResolution?: string) => Promise<string>
  markProgrammaticMove?: (nodeId: string) => void
  getVaultPath?: () => string | null
  // Collision dialog callback - returns resolution: 'cancel', 'rename:newname', or 'replace'
  showCollisionDialog?: (
    sourceFileName: string,
    targetFolder: string,
    existingFileName: string
  ) => Promise<{ resolution: 'cancel' | 'rename' | 'replace'; newName?: string }>
  scale: Ref<number>
  offset: Ref<{ x: number; y: number }>
  canvasRef: Ref<HTMLDivElement | null>
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
  optimizeNodeEntrypoints: (
    nodeId: string,
    edges: Array<{ id: string; source_node_id: string; target_node_id: string }>,
    nodeMap: Map<
      string,
      { id: string; canvas_x: number; canvas_y: number; width: number; height: number }
    >
  ) => void
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
    isLODMode,
    isSemanticZoomCollapsed,
    editingNodeId,
    editingTitleId,
    selectedEdge,
    isCreatingEdge,
    edgeStartNode,
    edgePreviewEnd,
    pushOverlappingNodesAway,
    pushUndo,
    screenToCanvas,
    zoomToNode,
    optimizeNodeEntrypoints,
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

    // Capture undo state before dragging
    pushUndo()

    pendingDragNode.value = nodeId

    // If node is already selected, don't change selection (allows multi-drag)
    // Only select if not already selected
    if (!store.selectedNodeIds.includes(nodeId)) {
      store.selectNode(nodeId, e.shiftKey || e.metaKey)
    }
    selectedEdge.value = null

    // Optimize entry points for this node (wrapped in try-catch to not break click handling)
    try {
      const optNodeMap = new Map<
        string,
        { id: string; canvas_x: number; canvas_y: number; width: number; height: number }
      >()
      for (const n of store.filteredNodes) {
        optNodeMap.set(n.id, {
          id: n.id,
          canvas_x: n.canvas_x,
          canvas_y: n.canvas_y,
          width: n.width || NODE_DEFAULTS.WIDTH,
          height: n.height || NODE_DEFAULTS.HEIGHT,
        })
      }
      const edgeDefs = store.filteredEdges.map(edge => ({
        id: edge.id,
        source_node_id: edge.source_node_id,
        target_node_id: edge.target_node_id,
      }))
      optimizeNodeEntrypoints(nodeId, edgeDefs, optNodeMap)
    } catch (err) {
      console.error('[optimizeNodeEntrypoints] Error:', err)
    }

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

      // Start actual drag
      draggingNode.value = pendingDragNode.value
      pendingDragNode.value = null
      document.body.classList.add('node-dragging')
    }

    if (!draggingNode.value) return

    // Move all selected nodes if multi-dragging
    if (multiDragInitial.value.size > 0) {
      for (const [id, initial] of multiDragInitial.value) {
        const newX = snapToGrid(initial.x + dx)
        const newY = snapToGrid(initial.y + dy)
        store.updateNodePosition(id, newX, newY)
      }
    } else {
      const newX = snapToGrid(dragStart.value.nodeX + dx)
      const newY = snapToGrid(dragStart.value.nodeY + dy)
      store.updateNodePosition(draggingNode.value, newX, newY)
    }
  }

  function stopNodeDrag(e: PointerEvent) {
    // Clear pending drag if no actual drag started
    if (pendingDragNode.value) {
      pendingDragNode.value = null
    }

    const draggedNodeId = draggingNode.value
    const draggedNodeIds =
      multiDragInitial.value.size > 0
        ? [...multiDragInitial.value.keys()]
        : draggedNodeId
          ? [draggedNodeId]
          : []

    // Check if drag ended over storyline panel
    const storylinePanel = document.querySelector('.storyline-panel')
    let droppedOnStoryline = false
    if (storylinePanel && draggedNodeIds.length > 0) {
      const rect = storylinePanel.getBoundingClientRect()
      if (
        e.clientX >= rect.left &&
        e.clientX <= rect.right &&
        e.clientY >= rect.top &&
        e.clientY <= rect.bottom
      ) {
        droppedOnStoryline = true
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
    }

    // Push overlapping nodes away after drag (only if not dropped on storyline)
    // Skip in dot mode (LOD or semantic zoom collapsed) - circles are small, pushing based on full node size doesn't make sense
    if (!droppedOnStoryline && !isLODMode.value && !isSemanticZoomCollapsed.value) {
      if (multiDragInitial.value.size > 0) {
        for (const id of multiDragInitial.value.keys()) {
          pushOverlappingNodesAway(id)
        }
      } else if (draggingNode.value) {
        pushOverlappingNodesAway(draggingNode.value)
      }

      // Assign nodes to frame if dropped inside one
      // Uses hysteresis for resistance: harder to enter (70%), easier to stay (exit at 20%)
      for (const nodeId of draggedNodeIds) {
        const node = store.getNode(nodeId)
        if (!node) continue

        const nodeWidth = node.width || 200
        const nodeHeight = node.height || 120
        const nodeArea = nodeWidth * nodeHeight
        const currentFrameId = node.frame_id
        let assignedFrameId: string | null = currentFrameId // Keep current by default
        let assignedFrame: Frame | undefined

        // Check overlap with current frame first (for exit resistance)
        if (currentFrameId) {
          const currentFrame = store.frames.find(f => f.id === currentFrameId)
          if (currentFrame) {
            const overlapX = Math.max(
              0,
              Math.min(node.canvas_x + nodeWidth, currentFrame.canvas_x + currentFrame.width) -
                Math.max(node.canvas_x, currentFrame.canvas_x)
            )
            const overlapY = Math.max(
              0,
              Math.min(node.canvas_y + nodeHeight, currentFrame.canvas_y + currentFrame.height) -
                Math.max(node.canvas_y, currentFrame.canvas_y)
            )
            const overlapArea = overlapX * overlapY

            // Exit resistance: need to drag mostly out (< 20% overlap) to leave frame
            const overlapRatio = overlapArea / nodeArea
            if (overlapRatio < 0.2) {
              assignedFrameId = null // Exiting current frame
              assignedFrame = undefined
            } else {
              // Stay in current frame
              assignedFrameId = currentFrameId
              assignedFrame = currentFrame
            }
          }
        }

        // If not in a frame or just exited, check for entering a new frame
        if (!assignedFrameId) {
          for (const frame of store.frames) {
            const overlapX = Math.max(
              0,
              Math.min(node.canvas_x + nodeWidth, frame.canvas_x + frame.width) -
                Math.max(node.canvas_x, frame.canvas_x)
            )
            const overlapY = Math.max(
              0,
              Math.min(node.canvas_y + nodeHeight, frame.canvas_y + frame.height) -
                Math.max(node.canvas_y, frame.canvas_y)
            )
            const overlapArea = overlapX * overlapY

            // Entry resistance: need significant overlap (70%) to enter a frame
            const entryRatio = overlapArea / nodeArea
            if (entryRatio > 0.7) {
              assignedFrameId = frame.id
              assignedFrame = frame
              break
            }
          }
        }

        // Update frame assignment if changed
        if (node.frame_id !== assignedFrameId) {
          store.assignNodesToFrame([nodeId], assignedFrameId)

          // Move file to frame's folder if:
          // 1. Node has a file_path
          // 2. Target frame has a folder_path
          // 3. File move function is available
          if (
            node.file_path &&
            ctx.moveNodeFile &&
            ctx.getVaultPath
          ) {
            const vaultPath = ctx.getVaultPath()
            if (vaultPath) {
              const targetFolder = assignedFrame?.folder_path
                ? `${vaultPath}/${assignedFrame.folder_path}`
                : vaultPath // Move to vault root if no frame or frame has no folder_path

              // Check for collision first if collision check is available
              const handleFileMove = async () => {
                let collisionResolution: string | undefined

                // Check if there's a collision
                if (ctx.checkFileCollision && ctx.showCollisionDialog) {
                  const collisionFileName = await ctx.checkFileCollision(nodeId, targetFolder)

                  if (collisionFileName) {
                    // Show dialog and get user's choice
                    const sourceFileName = node.file_path!.split('/').pop() || 'file.md'
                    const dialogResult = await ctx.showCollisionDialog(
                      sourceFileName,
                      targetFolder,
                      collisionFileName
                    )

                    if (dialogResult.resolution === 'cancel') {
                      // User cancelled - revert frame assignment
                      store.assignNodesToFrame([nodeId], node.frame_id)
                      return
                    }

                    if (dialogResult.resolution === 'rename' && dialogResult.newName) {
                      collisionResolution = dialogResult.newName
                    } else if (dialogResult.resolution === 'replace') {
                      collisionResolution = 'replace'
                    }
                  }
                }

                // Mark as programmatic move to prevent watcher from reacting
                ctx.markProgrammaticMove?.(nodeId)

                // Move file
                try {
                  const newPath = await ctx.moveNodeFile!(nodeId, targetFolder, collisionResolution)
                  store.updateNodeFilePath?.(nodeId, newPath)
                } catch (err) {
                  console.error(`Failed to move file for node ${nodeId}:`, err)
                  // Revert frame assignment on failure
                  store.assignNodesToFrame([nodeId], node.frame_id)
                }
              }

              // Execute file move asynchronously
              handleFileMove()
            }
          }
        }
      }
    }

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
