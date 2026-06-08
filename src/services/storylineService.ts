/**
 * StorylineService - Central service for storyline mutations with guaranteed undo
 *
 * Wraps store mutations with automatic undo capture.
 * All code paths that modify storyline node order should use this service
 * to ensure undo works consistently.
 */

/**
 * Undo provider interface for storylines
 */
export interface StorylineUndoProvider {
  pushStorylineNodesUndo: (storylineId: string, nodeIds: string[]) => void
}

/**
 * Store interface for StorylineService
 */
export interface StorylineServiceStore {
  getStorylineNodeIds: (storylineId: string) => string[]
  reorderStorylineNodes: (storylineId: string, nodeIds: string[]) => Promise<void>
  addNodeToStoryline: (storylineId: string, nodeId: string, position?: number) => Promise<void>
  removeNodeFromStoryline: (storylineId: string, nodeId: string) => Promise<void>
}

/**
 * Dependencies for StorylineService
 */
export interface StorylineServiceDeps {
  store: StorylineServiceStore
  undo: StorylineUndoProvider
}

/**
 * StorylineService class
 *
 * Provides mutation methods that automatically capture undo state
 * before executing the operation.
 */
export class StorylineService {
  private store: StorylineServiceStore
  private undo: StorylineUndoProvider

  constructor(deps: StorylineServiceDeps) {
    this.store = deps.store
    this.undo = deps.undo
  }

  /**
   * Reorder nodes in a storyline with undo support
   */
  async reorderNodes(storylineId: string, newNodeIds: string[]): Promise<void> {
    // Capture current order before reordering
    const currentNodeIds = this.store.getStorylineNodeIds(storylineId)

    // Push to undo stack BEFORE reordering
    this.undo.pushStorylineNodesUndo(storylineId, currentNodeIds)

    // Execute reorder
    await this.store.reorderStorylineNodes(storylineId, newNodeIds)
  }

  /**
   * Add a node to a storyline with undo support
   */
  async addNode(storylineId: string, nodeId: string, position?: number): Promise<void> {
    // Capture current order before adding
    const currentNodeIds = this.store.getStorylineNodeIds(storylineId)

    // Push to undo stack BEFORE adding
    this.undo.pushStorylineNodesUndo(storylineId, currentNodeIds)

    // Execute add
    await this.store.addNodeToStoryline(storylineId, nodeId, position)
  }

  /**
   * Remove a node from a storyline with undo support
   */
  async removeNode(storylineId: string, nodeId: string): Promise<void> {
    // Capture current order before removing
    const currentNodeIds = this.store.getStorylineNodeIds(storylineId)

    // Push to undo stack BEFORE removing
    this.undo.pushStorylineNodesUndo(storylineId, currentNodeIds)

    // Execute remove
    await this.store.removeNodeFromStoryline(storylineId, nodeId)
  }
}
