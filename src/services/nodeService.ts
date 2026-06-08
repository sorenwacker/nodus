/**
 * NodeService - Central service for node mutations with guaranteed undo
 *
 * Wraps store mutations with automatic undo capture.
 * All code paths that delete or move nodes should use this service
 * to ensure undo works consistently.
 */

import type { Node, Edge } from '../types'

/**
 * Undo provider interface - subset of useUndoRedo return type
 */
export interface UndoProvider {
  pushDeletionUndo: (node: Node, edges: Edge[]) => void
  pushPositionUndo: (positions: Map<string, { x: number; y: number }>) => void
}

/**
 * Store interface for NodeService - low-level operations
 */
export interface NodeServiceStore {
  getNode: (id: string) => Node | undefined
  deleteNode: (id: string) => Promise<void>
  deleteNodes: (ids: string[]) => Promise<void>
  updateNodePosition: (id: string, x: number, y: number) => Promise<void>
}

/**
 * Dependencies for NodeService
 */
export interface NodeServiceDeps {
  store: NodeServiceStore
  undo: UndoProvider
  getEdges: () => Edge[]
}

/**
 * NodeService class
 *
 * Provides mutation methods that automatically capture undo state
 * before executing the operation.
 */
export class NodeService {
  private store: NodeServiceStore
  private undo: UndoProvider
  private getEdges: () => Edge[]

  constructor(deps: NodeServiceDeps) {
    this.store = deps.store
    this.undo = deps.undo
    this.getEdges = deps.getEdges
  }

  /**
   * Delete a single node with undo support
   */
  async deleteNode(id: string): Promise<void> {
    const node = this.store.getNode(id)
    if (!node) return

    // Capture connected edges before deletion
    const connectedEdges = this.getEdges().filter(
      e => e.source_node_id === id || e.target_node_id === id
    )

    // Push to undo stack BEFORE deleting
    this.undo.pushDeletionUndo(node, connectedEdges)

    // Execute deletion
    await this.store.deleteNode(id)
  }

  /**
   * Delete multiple nodes with undo support (single undo entry for all)
   *
   * Note: For batch deletions, we push each node to undo separately
   * so they can be restored individually. A more sophisticated approach
   * would be to create a batch undo entry.
   */
  async deleteNodes(ids: string[]): Promise<void> {
    if (ids.length === 0) return

    const edges = this.getEdges()

    // Capture all nodes and their edges before deletion
    for (const id of ids) {
      const node = this.store.getNode(id)
      if (!node) continue

      const connectedEdges = edges.filter(
        e => e.source_node_id === id || e.target_node_id === id
      )

      // Push each to undo stack
      this.undo.pushDeletionUndo(node, connectedEdges)
    }

    // Execute batch deletion
    await this.store.deleteNodes(ids)
  }

  /**
   * Move a single node with undo support
   */
  async moveNode(id: string, x: number, y: number): Promise<void> {
    const node = this.store.getNode(id)
    if (!node) return

    // Capture current position before move
    const positions = new Map<string, { x: number; y: number }>()
    positions.set(id, { x: node.canvas_x, y: node.canvas_y })

    // Push to undo stack BEFORE moving
    this.undo.pushPositionUndo(positions)

    // Execute move
    await this.store.updateNodePosition(id, x, y)
  }

  /**
   * Move multiple nodes with undo support (single undo entry for all)
   */
  async moveNodes(moves: Array<{ id: string; x: number; y: number }>): Promise<void> {
    if (moves.length === 0) return

    // Capture current positions before moves
    const positions = new Map<string, { x: number; y: number }>()

    for (const move of moves) {
      const node = this.store.getNode(move.id)
      if (node) {
        positions.set(move.id, { x: node.canvas_x, y: node.canvas_y })
      }
    }

    if (positions.size === 0) return

    // Push single undo entry for all moves
    this.undo.pushPositionUndo(positions)

    // Execute all moves
    for (const move of moves) {
      await this.store.updateNodePosition(move.id, move.x, move.y)
    }
  }
}
