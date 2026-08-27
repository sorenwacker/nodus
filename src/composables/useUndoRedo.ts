/**
 * Undo/Redo composable
 * Manages position, content, deletion, and creation undo/redo stacks
 */
import { ref } from 'vue'
import type { Node, Edge } from '../types'

interface PositionSnapshot {
  type: 'position'
  positions: Map<string, { x: number; y: number }>
}

interface ContentSnapshot {
  type: 'content'
  content: { nodeId: string; oldContent: string | null; oldTitle: string }
}

interface DeletionSnapshot {
  type: 'deletion'
  deletion: { node: Node; edges: Edge[] }
}

interface CreationSnapshot {
  type: 'creation'
  creation: {
    nodeIds: string[]
    /** The nodes themselves, so a redo can restore what an undo removed */
    nodes?: Node[]
  }
}

/**
 * Several nodes' content and titles as one step.
 *
 * A batch rewrite is one action to the user. Recording an entry per node would
 * mean pressing undo once per node to reverse one instruction
 * (PRODUCT_DESIGN.md > Recording an undo step).
 */
interface ContentsSnapshot {
  type: 'contents'
  contents: Map<string, { content: string | null; title: string }>
}

interface ColorSnapshot {
  type: 'color'
  colors: Map<string, string | null>
}

interface SizeSnapshot {
  type: 'size'
  sizes: Map<string, { width: number; height: number; x: number; y: number }>
}

/**
 * A frame's geometry: where it is AND how big it is.
 *
 * Position alone left a fitted frame restored to its old place at its new size,
 * because fitting changes both (PRODUCT_DESIGN.md > Recording an undo step).
 */
interface FrameGeometrySnapshot {
  type: 'frame-geometry'
  frames: Map<string, { x: number; y: number; width: number; height: number }>
}

interface FrameAssignmentSnapshot {
  type: 'frame-assignment'
  assignments: Map<string, string | null> // nodeId -> frame_id
}

interface StorylineNodesSnapshot {
  type: 'storyline-nodes'
  storylineId: string
  nodeIds: string[] // previous order of node IDs
}

export type UndoSnapshot = PositionSnapshot | ContentSnapshot | ContentsSnapshot | DeletionSnapshot | CreationSnapshot | ColorSnapshot | SizeSnapshot | FrameGeometrySnapshot | FrameAssignmentSnapshot | StorylineNodesSnapshot

export interface UndoRedoStore {
  getNode: (id: string) => Node | undefined
  getFilteredNodes: () => Node[]
  updateNodePosition: (id: string, x: number, y: number) => Promise<void>
  updateNodeSize: (id: string, width: number, height: number) => Promise<void>
  updateNodeContent: (id: string, content: string) => Promise<void>
  updateNodeTitle: (id: string, title: string) => Promise<void>
  updateNodeColor: (id: string, color: string | null) => Promise<void>
  restoreNode: (node: Node) => Promise<void>
  restoreEdge: (edge: Edge) => void
  deleteNode: (id: string) => Promise<void>
  // Frame operations
  getFilteredFrames?: () => Array<{
    id: string
    canvas_x: number
    canvas_y: number
    width: number
    height: number
  }>
  updateFramePosition?: (id: string, x: number, y: number) => void
  updateFrameSize?: (id: string, width: number, height: number) => void
  assignNodesToFrame?: (nodeIds: string[], frameId: string | null) => void
  // Storyline operations
  getStorylineNodeIds?: (storylineId: string) => string[]
  reorderStorylineNodes?: (storylineId: string, nodeIds: string[]) => Promise<void>
}

export interface UseUndoRedoOptions {
  store: UndoRedoStore
  showToast: (message: string, type: 'error' | 'success' | 'info') => void
  maxUndo?: number
}

export function useUndoRedo(options: UseUndoRedoOptions) {
  const { store, showToast, maxUndo = 50 } = options

  const undoStack = ref<UndoSnapshot[]>([])
  const redoStack = ref<UndoSnapshot[]>([])

  function capturePositionSnapshot(): PositionSnapshot {
    const positions = new Map<string, { x: number; y: number }>()
    for (const node of store.getFilteredNodes()) {
      positions.set(node.id, { x: node.canvas_x, y: node.canvas_y })
    }
    return { type: 'position', positions }
  }

  function pushUndo() {
    const snapshot = capturePositionSnapshot()
    if (snapshot.positions.size === 0) {
      return // Don't push empty snapshots
    }
    undoStack.value.push(snapshot)
    if (undoStack.value.length > maxUndo) {
      undoStack.value.shift()
    }
    redoStack.value = []
  }

  /**
   * Push a position snapshot with specific positions (for MCP undo integration)
   */
  function pushPositionUndo(positions: Map<string, { x: number; y: number }>) {
    if (positions.size === 0) return
    undoStack.value.push({
      type: 'position',
      positions: new Map(positions),
    })
    if (undoStack.value.length > maxUndo) {
      undoStack.value.shift()
    }
    redoStack.value = []
  }

  function pushContentUndo(nodeId: string, oldContent: string | null, oldTitle: string) {
    undoStack.value.push({
      type: 'content',
      content: { nodeId, oldContent, oldTitle },
    })
    if (undoStack.value.length > maxUndo) {
      undoStack.value.shift()
    }
    redoStack.value = []
  }

  function pushDeletionUndo(node: Node, edges: Edge[]) {
    undoStack.value.push({
      type: 'deletion',
      deletion: { node: { ...node }, edges: edges.map((e) => ({ ...e })) },
    })
    if (undoStack.value.length > maxUndo) {
      undoStack.value.shift()
    }
    redoStack.value = []
  }

  function pushCreationUndo(nodeIds: string[]) {
    if (nodeIds.length === 0) return
    // Keep the nodes, not only their ids: undo soft-deletes them, and a redo
    // then has nothing to look up (PRODUCT_DESIGN.md > Redoing a delete or a
    // create)
    const nodes = nodeIds
      .map(id => store.getNode(id))
      .filter((n): n is Node => n !== undefined)
    undoStack.value.push({
      type: 'creation',
      creation: { nodeIds: [...nodeIds], nodes },
    })
    if (undoStack.value.length > maxUndo) {
      undoStack.value.shift()
    }
    redoStack.value = []
  }

  function pushContentsUndo(
    entries: Array<{ nodeId: string; content: string | null; title: string }>
  ) {
    if (entries.length === 0) return
    const contents = new Map(entries.map(e => [e.nodeId, { content: e.content, title: e.title }]))
    undoStack.value.push({ type: 'contents', contents })
    if (undoStack.value.length > maxUndo) {
      undoStack.value.shift()
    }
    redoStack.value = []
  }

  function pushColorUndo(nodeColors: Map<string, string | null>) {
    if (nodeColors.size === 0) return
    undoStack.value.push({
      type: 'color',
      colors: new Map(nodeColors),
    })
    if (undoStack.value.length > maxUndo) {
      undoStack.value.shift()
    }
    redoStack.value = []
  }

  function pushSizeUndo(nodeSizes: Map<string, { width: number; height: number; x: number; y: number }>) {
    if (nodeSizes.size === 0) return
    undoStack.value.push({
      type: 'size',
      sizes: new Map(nodeSizes),
    })
    if (undoStack.value.length > maxUndo) {
      undoStack.value.shift()
    }
    redoStack.value = []
  }

  function captureFrameGeometrySnapshot(): FrameGeometrySnapshot | null {
    if (!store.getFilteredFrames) return null
    const frames = new Map<string, { x: number; y: number; width: number; height: number }>()
    for (const frame of store.getFilteredFrames()) {
      frames.set(frame.id, {
        x: frame.canvas_x,
        y: frame.canvas_y,
        width: frame.width,
        height: frame.height,
      })
    }
    return { type: 'frame-geometry', frames }
  }

  function pushFramePositionUndo() {
    const snapshot = captureFrameGeometrySnapshot()
    if (!snapshot || snapshot.frames.size === 0) return
    undoStack.value.push(snapshot)
    if (undoStack.value.length > maxUndo) {
      undoStack.value.shift()
    }
    redoStack.value = []
  }

  function pushFrameAssignmentUndo(assignments: Map<string, string | null>) {
    if (assignments.size === 0) return
    undoStack.value.push({
      type: 'frame-assignment',
      assignments: new Map(assignments),
    })
    if (undoStack.value.length > maxUndo) {
      undoStack.value.shift()
    }
    redoStack.value = []
  }

  function pushStorylineNodesUndo(storylineId: string, nodeIds: string[]) {
    undoStack.value.push({
      type: 'storyline-nodes',
      storylineId,
      nodeIds: [...nodeIds],
    })
    if (undoStack.value.length > maxUndo) {
      undoStack.value.shift()
    }
    redoStack.value = []
  }

  async function undo() {
    if (undoStack.value.length === 0) {
      showToast('Nothing to undo', 'info')
      return
    }
    const snapshot = undoStack.value.pop()!

    if (snapshot.type === 'position') {
      redoStack.value.push(capturePositionSnapshot())
      for (const [id, pos] of snapshot.positions) {
        await store.updateNodePosition(id, pos.x, pos.y)
      }
      showToast('Undo position', 'info')
    } else if (snapshot.type === 'content') {
      const node = store.getNode(snapshot.content.nodeId)
      if (node) {
        // Save current state for redo
        redoStack.value.push({
          type: 'content',
          content: {
            nodeId: node.id,
            oldContent: node.markdown_content,
            oldTitle: node.title,
          },
        })
        // Restore old content
        await store.updateNodeContent(node.id, snapshot.content.oldContent || '')
        await store.updateNodeTitle(node.id, snapshot.content.oldTitle)
        showToast('Undo content', 'info')
      }
    } else if (snapshot.type === 'deletion') {
      // Restore deleted node. The snapshot goes on the redo stack so the delete
      // can be repeated (PRODUCT_DESIGN.md > Redoing a delete or a create)
      const { node, edges } = snapshot.deletion
      redoStack.value.push({ type: 'deletion', deletion: { node, edges } })
      await store.restoreNode(node)
      // Restore connected edges
      for (const edge of edges) {
        store.restoreEdge(edge)
      }
      showToast('Undo deletion', 'info')
    } else if (snapshot.type === 'creation') {
      // Delete created nodes (e.g., from PDF import)
      redoStack.value.push({ type: 'creation', creation: snapshot.creation })
      for (const nodeId of snapshot.creation.nodeIds) {
        await store.deleteNode(nodeId)
      }
      showToast(`Undo: deleted ${snapshot.creation.nodeIds.length} nodes`, 'info')
    } else if (snapshot.type === 'contents') {
      // Current state goes on the redo stack, then the recorded state applies
      const current = new Map<string, { content: string | null; title: string }>()
      for (const [id] of snapshot.contents) {
        const node = store.getNode(id)
        if (node) current.set(id, { content: node.markdown_content, title: node.title })
      }
      redoStack.value.push({ type: 'contents', contents: current })
      for (const [id, previous] of snapshot.contents) {
        await store.updateNodeContent(id, previous.content || '')
        await store.updateNodeTitle(id, previous.title)
      }
      showToast(`Undo: restored ${snapshot.contents.size} nodes`, 'info')
    } else if (snapshot.type === 'color') {
      // Save current colors for redo
      const currentColors = new Map<string, string | null>()
      for (const [id] of snapshot.colors) {
        const node = store.getNode(id)
        if (node) {
          currentColors.set(id, node.color_theme ?? null)
        }
      }
      redoStack.value.push({ type: 'color', colors: currentColors })
      // Restore old colors
      for (const [id, color] of snapshot.colors) {
        await store.updateNodeColor(id, color)
      }
      showToast('Undo color', 'info')
    } else if (snapshot.type === 'size') {
      // Save current sizes for redo
      const currentSizes = new Map<string, { width: number; height: number; x: number; y: number }>()
      for (const [id] of snapshot.sizes) {
        const node = store.getNode(id)
        if (node) {
          currentSizes.set(id, {
            width: node.width ?? 200,
            height: node.height ?? 100,
            x: node.canvas_x,
            y: node.canvas_y,
          })
        }
      }
      redoStack.value.push({ type: 'size', sizes: currentSizes })
      // Restore old sizes
      for (const [id, size] of snapshot.sizes) {
        await store.updateNodeSize(id, size.width, size.height)
        await store.updateNodePosition(id, size.x, size.y)
      }
      showToast('Undo resize', 'info')
    } else if (snapshot.type === 'frame-geometry') {
      // Save current frame positions for redo
      const currentSnapshot = captureFrameGeometrySnapshot()
      if (currentSnapshot) {
        redoStack.value.push(currentSnapshot)
      }
      // Restore old frame positions
      if (store.updateFramePosition) {
        for (const [id, geometry] of snapshot.frames) {
          store.updateFramePosition(id, geometry.x, geometry.y)
          store.updateFrameSize?.(id, geometry.width, geometry.height)
        }
      }
      showToast('Undo frame geometry', 'info')
    } else if (snapshot.type === 'frame-assignment') {
      // Save current frame assignments for redo
      const currentAssignments = new Map<string, string | null>()
      for (const [nodeId] of snapshot.assignments) {
        const node = store.getNode(nodeId)
        if (node) {
          currentAssignments.set(nodeId, node.frame_id ?? null)
        }
      }
      redoStack.value.push({ type: 'frame-assignment', assignments: currentAssignments })
      // Restore old frame assignments
      if (store.assignNodesToFrame) {
        // Group by frame_id for batch assignment
        const byFrame = new Map<string | null, string[]>()
        for (const [nodeId, frameId] of snapshot.assignments) {
          if (!byFrame.has(frameId)) {
            byFrame.set(frameId, [])
          }
          byFrame.get(frameId)!.push(nodeId)
        }
        for (const [frameId, nodeIds] of byFrame) {
          store.assignNodesToFrame(nodeIds, frameId)
        }
      }
      showToast('Undo frame assignment', 'info')
    } else if (snapshot.type === 'storyline-nodes') {
      // Save current order for redo
      if (store.getStorylineNodeIds && store.reorderStorylineNodes) {
        const currentNodeIds = store.getStorylineNodeIds(snapshot.storylineId)
        redoStack.value.push({
          type: 'storyline-nodes',
          storylineId: snapshot.storylineId,
          nodeIds: currentNodeIds,
        })
        // Restore old order
        await store.reorderStorylineNodes(snapshot.storylineId, snapshot.nodeIds)
        showToast('Undo storyline reorder', 'info')
      }
    }
  }

  async function redo() {
    if (redoStack.value.length === 0) return
    const snapshot = redoStack.value.pop()!

    if (snapshot.type === 'position') {
      undoStack.value.push(capturePositionSnapshot())
      for (const [id, pos] of snapshot.positions) {
        await store.updateNodePosition(id, pos.x, pos.y)
      }
      showToast('Redo position', 'info')
    } else if (snapshot.type === 'content') {
      const node = store.getNode(snapshot.content.nodeId)
      if (node) {
        // Save current state for undo
        undoStack.value.push({
          type: 'content',
          content: {
            nodeId: node.id,
            oldContent: node.markdown_content,
            oldTitle: node.title,
          },
        })
        // Apply redo content
        await store.updateNodeContent(node.id, snapshot.content.oldContent || '')
        await store.updateNodeTitle(node.id, snapshot.content.oldTitle)
        showToast('Redo content', 'info')
      }
    } else if (snapshot.type === 'deletion') {
      // Redo a delete: remove the node again, and put the snapshot back on the
      // undo stack so it can be restored once more
      const { node, edges } = snapshot.deletion
      undoStack.value.push({ type: 'deletion', deletion: { node, edges } })
      await store.deleteNode(node.id)
      showToast('Redo deletion', 'info')
    } else if (snapshot.type === 'creation') {
      // Redo a create: bring the nodes back. Restore rather than create, so
      // the ids the snapshot refers to stay valid for a further undo
      undoStack.value.push({ type: 'creation', creation: snapshot.creation })
      for (const node of snapshot.creation.nodes ?? []) {
        await store.restoreNode(node)
      }
      showToast(`Redo: restored ${snapshot.creation.nodeIds.length} nodes`, 'info')
    } else if (snapshot.type === 'contents') {
      const current = new Map<string, { content: string | null; title: string }>()
      for (const [id] of snapshot.contents) {
        const node = store.getNode(id)
        if (node) current.set(id, { content: node.markdown_content, title: node.title })
      }
      undoStack.value.push({ type: 'contents', contents: current })
      for (const [id, next] of snapshot.contents) {
        await store.updateNodeContent(id, next.content || '')
        await store.updateNodeTitle(id, next.title)
      }
      showToast(`Redo: restored ${snapshot.contents.size} nodes`, 'info')
    } else if (snapshot.type === 'color') {
      // Save current colors for undo
      const currentColors = new Map<string, string | null>()
      for (const [id] of snapshot.colors) {
        const node = store.getNode(id)
        if (node) {
          currentColors.set(id, node.color_theme ?? null)
        }
      }
      undoStack.value.push({ type: 'color', colors: currentColors })
      // Apply redo colors
      for (const [id, color] of snapshot.colors) {
        await store.updateNodeColor(id, color)
      }
      showToast('Redo color', 'info')
    } else if (snapshot.type === 'size') {
      // Save current sizes for undo
      const currentSizes = new Map<string, { width: number; height: number; x: number; y: number }>()
      for (const [id] of snapshot.sizes) {
        const node = store.getNode(id)
        if (node) {
          currentSizes.set(id, {
            width: node.width ?? 200,
            height: node.height ?? 100,
            x: node.canvas_x,
            y: node.canvas_y,
          })
        }
      }
      undoStack.value.push({ type: 'size', sizes: currentSizes })
      // Apply redo sizes
      for (const [id, size] of snapshot.sizes) {
        await store.updateNodeSize(id, size.width, size.height)
        await store.updateNodePosition(id, size.x, size.y)
      }
      showToast('Redo resize', 'info')
    } else if (snapshot.type === 'frame-geometry') {
      // Save current frame positions for undo
      const currentSnapshot = captureFrameGeometrySnapshot()
      if (currentSnapshot) {
        undoStack.value.push(currentSnapshot)
      }
      // Apply redo frame positions
      if (store.updateFramePosition) {
        for (const [id, geometry] of snapshot.frames) {
          store.updateFramePosition(id, geometry.x, geometry.y)
          store.updateFrameSize?.(id, geometry.width, geometry.height)
        }
      }
      showToast('Redo frame geometry', 'info')
    } else if (snapshot.type === 'frame-assignment') {
      // Save current frame assignments for undo
      const currentAssignments = new Map<string, string | null>()
      for (const [nodeId] of snapshot.assignments) {
        const node = store.getNode(nodeId)
        if (node) {
          currentAssignments.set(nodeId, node.frame_id ?? null)
        }
      }
      undoStack.value.push({ type: 'frame-assignment', assignments: currentAssignments })
      // Apply redo frame assignments
      if (store.assignNodesToFrame) {
        const byFrame = new Map<string | null, string[]>()
        for (const [nodeId, frameId] of snapshot.assignments) {
          if (!byFrame.has(frameId)) {
            byFrame.set(frameId, [])
          }
          byFrame.get(frameId)!.push(nodeId)
        }
        for (const [frameId, nodeIds] of byFrame) {
          store.assignNodesToFrame(nodeIds, frameId)
        }
      }
      showToast('Redo frame assignment', 'info')
    } else if (snapshot.type === 'storyline-nodes') {
      // Save current order for undo
      if (store.getStorylineNodeIds && store.reorderStorylineNodes) {
        const currentNodeIds = store.getStorylineNodeIds(snapshot.storylineId)
        undoStack.value.push({
          type: 'storyline-nodes',
          storylineId: snapshot.storylineId,
          nodeIds: currentNodeIds,
        })
        // Apply redo order
        await store.reorderStorylineNodes(snapshot.storylineId, snapshot.nodeIds)
        showToast('Redo storyline reorder', 'info')
      }
    }
  }

  function canUndo() {
    return undoStack.value.length > 0
  }

  function canRedo() {
    return redoStack.value.length > 0
  }

  function clear() {
    undoStack.value = []
    redoStack.value = []
  }

  return {
    undoStack,
    redoStack,
    pushUndo,
    pushPositionUndo,
    pushContentUndo,
    pushDeletionUndo,
    pushCreationUndo,
    pushContentsUndo,
    pushColorUndo,
    pushSizeUndo,
    pushFramePositionUndo,
    pushFrameAssignmentUndo,
    pushStorylineNodesUndo,
    undo,
    redo,
    canUndo,
    canRedo,
    clear,
  }
}
