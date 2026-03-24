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
  creation: { nodeIds: string[] }
}

interface ColorSnapshot {
  type: 'color'
  colors: Map<string, string | null>
}

interface SizeSnapshot {
  type: 'size'
  sizes: Map<string, { width: number; height: number; x: number; y: number }>
}

export type UndoSnapshot = PositionSnapshot | ContentSnapshot | DeletionSnapshot | CreationSnapshot | ColorSnapshot | SizeSnapshot

export interface UndoRedoStore {
  getNode: (id: string) => Node | undefined
  getFilteredNodes: () => Node[]
  updateNodePosition: (id: string, x: number, y: number) => Promise<void>
  updateNodeSize: (id: string, width: number, height: number) => Promise<void>
  updateNodeContent: (id: string, content: string) => Promise<void>
  updateNodeTitle: (id: string, title: string) => Promise<void>
  updateNodeColor: (id: string, color: string | null) => Promise<void>
  restoreNode: (node: Node) => Promise<void>
  restoreEdge: (edge: Edge) => Promise<void>
  deleteNode: (id: string) => Promise<void>
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
    undoStack.value.push({
      type: 'creation',
      creation: { nodeIds: [...nodeIds] },
    })
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
      // Restore deleted node
      const { node, edges } = snapshot.deletion
      await store.restoreNode(node)
      // Restore connected edges
      for (const edge of edges) {
        await store.restoreEdge(edge)
      }
      showToast('Undo deletion', 'info')
    } else if (snapshot.type === 'creation') {
      // Delete created nodes (e.g., from PDF import)
      for (const nodeId of snapshot.creation.nodeIds) {
        await store.deleteNode(nodeId)
      }
      showToast(`Undo: deleted ${snapshot.creation.nodeIds.length} nodes`, 'info')
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
    pushContentUndo,
    pushDeletionUndo,
    pushCreationUndo,
    pushColorUndo,
    pushSizeUndo,
    undo,
    redo,
    canUndo,
    canRedo,
    clear,
  }
}
