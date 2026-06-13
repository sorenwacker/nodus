/**
 * Frame operations composable
 *
 * Handles frame collision resolution and node organization within frames.
 */
import type { Node, Frame } from '../../../types'
import {
  resolveFrameOverlaps,
  organizeFrameNodes,
  type FrameWithId,
  type FrameForOrganize,
  type NodeForOrganize,
} from '../layout/useFrameCollision'

/**
 * Context for frame operations
 */
export interface UseFrameOperationsContext {
  /** Store functions */
  store: {
    get filteredFrames(): Frame[]
    get filteredNodes(): Node[]
    getNode: (id: string) => Node | undefined
    updateFramePosition: (id: string, x: number, y: number) => void
    updateNodePosition: (id: string, x: number, y: number) => Promise<void>
  }
}

/**
 * Return type for useFrameOperations
 */
export interface UseFrameOperationsReturn {
  /** Resolve frame-to-frame collisions after drag or resize */
  resolveFrameCollisions: () => void
  /** Organize nodes for a specific frame (pull members in, push others out) */
  organizeFrame: (frameId: string) => Promise<void>
}

/**
 * Composable for frame collision and organization operations
 *
 * Provides functions to resolve frame overlaps and organize nodes within frames.
 */
export function useFrameOperations(ctx: UseFrameOperationsContext): UseFrameOperationsReturn {
  const { store } = ctx

  /**
   * Resolve frame-to-frame collisions after drag or resize
   */
  function resolveFrameCollisions() {
    const allFrames = store.filteredFrames
    if (allFrames.length < 2) return

    // Build frames with ID for collision detection
    const framesForCollision: FrameWithId[] = allFrames.map(f => ({
      id: f.id,
      canvas_x: f.canvas_x,
      canvas_y: f.canvas_y,
      width: f.width,
      height: f.height,
      parent_frame_id: f.parent_frame_id,
    }))

    // Resolve overlaps (40px gap, max 10 iterations)
    const resolvedPositions = resolveFrameOverlaps(framesForCollision, 40, 10)

    // Apply resolved positions and move contained nodes
    for (const frame of allFrames) {
      const resolvedPos = resolvedPositions.get(frame.id)
      if (!resolvedPos) continue

      const deltaX = resolvedPos.x - frame.canvas_x
      const deltaY = resolvedPos.y - frame.canvas_y

      // Skip if no movement needed
      if (Math.abs(deltaX) < 1 && Math.abs(deltaY) < 1) continue

      // Update frame position
      store.updateFramePosition(frame.id, resolvedPos.x, resolvedPos.y)

      // Move contained nodes with the frame (use frame_id from database)
      const nodesInFrame = store.filteredNodes.filter(n => n.frame_id === frame.id)
      for (const node of nodesInFrame) {
        store.updateNodePosition(node.id, node.canvas_x + deltaX, node.canvas_y + deltaY)
      }
    }
  }

  /**
   * Organize nodes for a specific frame:
   * - Nodes 50%+ inside get pulled fully inside
   * - Nodes just overlapping (<50%) get pushed out
   */
  async function organizeFrame(frameId: string) {
    const frame = store.filteredFrames.find(f => f.id === frameId)
    if (!frame) return

    const allNodes = store.filteredNodes

    // Build node data
    const nodesForOrganize: NodeForOrganize[] = allNodes.map(n => ({
      id: n.id,
      canvas_x: n.canvas_x,
      canvas_y: n.canvas_y,
      width: n.width,
      height: n.height,
    }))

    // Build frame data
    const frameForOrganize: FrameForOrganize = {
      id: frame.id,
      canvas_x: frame.canvas_x,
      canvas_y: frame.canvas_y,
      width: frame.width,
      height: frame.height,
    }

    // Run organization
    const newPositions = organizeFrameNodes(nodesForOrganize, frameForOrganize, 20)

    // Apply new positions
    for (const [nodeId, pos] of newPositions) {
      const node = store.getNode(nodeId)
      if (!node) continue

      const dx = Math.abs(pos.x - node.canvas_x)
      const dy = Math.abs(pos.y - node.canvas_y)
      if (dx > 1 || dy > 1) {
        await store.updateNodePosition(nodeId, pos.x, pos.y)
      }
    }
  }

  return {
    resolveFrameCollisions,
    organizeFrame,
  }
}
