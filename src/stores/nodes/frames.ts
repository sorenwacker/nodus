/**
 * Frame operations for the nodes store
 */

import { invoke } from '../../lib/tauri'
import { storeLogger } from '../../lib/logger'
import type { Node, NodeStoreDependencies } from './types'

/**
 * Create a frame in the current workspace
 */
export function createFrame(
  deps: NodeStoreDependencies,
  x: number,
  y: number,
  width = 400,
  height = 300,
  title = 'Frame'
): string {
  const { workspaceStore, framesStore } = deps
  const wsId = workspaceStore.currentWorkspaceId
  const workspaceForBackend = wsId === 'default' ? null : wsId
  return framesStore.createFrame(x, y, width, height, title, workspaceForBackend)
}

/**
 * Update frame position - forwarded to frames store
 */
export function updateFramePosition(
  framesStore: NodeStoreDependencies['framesStore'],
  id: string,
  x: number,
  y: number,
  options?: { skipPersist?: boolean }
): void {
  framesStore.updateFramePosition(id, x, y, options)
}

/**
 * Persist a frame's current position - forwarded to frames store
 */
export function persistFramePosition(
  framesStore: NodeStoreDependencies['framesStore'],
  id: string
): void {
  framesStore.persistFramePosition(id)
}

/**
 * Update frame size - forwarded to frames store
 */
export function updateFrameSize(
  framesStore: NodeStoreDependencies['framesStore'],
  id: string,
  width: number,
  height: number
): void {
  framesStore.updateFrameSize(id, width, height)
}

/**
 * Update frame title - forwarded to frames store
 */
export function updateFrameTitle(
  framesStore: NodeStoreDependencies['framesStore'],
  id: string,
  title: string
): void {
  framesStore.updateFrameTitle(id, title)
}

/**
 * Update frame color - forwarded to frames store
 */
export function updateFrameColor(
  framesStore: NodeStoreDependencies['framesStore'],
  id: string,
  color: string | null
): void {
  framesStore.updateFrameColor(id, color)
}

/**
 * Delete a frame, unassigning nodes first
 */
export function deleteFrame(
  deps: NodeStoreDependencies,
  id: string
): void {
  const { state, framesStore } = deps
  // Unassign nodes from this frame first
  for (const node of state.nodes.value) {
    if (node.frame_id === id) {
      node.frame_id = null
    }
  }
  framesStore.deleteFrame(id)
}

/**
 * Select a frame, clearing node selection
 */
export function selectFrame(
  deps: NodeStoreDependencies,
  id: string | null
): void {
  const { state, framesStore } = deps
  framesStore.selectFrame(id)
  if (id) {
    state.selectedNodeIds.value = []
  }
}

/**
 * Assign nodes to a frame
 */
export function assignNodesToFrame(
  nodes: Node[],
  nodeIds: string[],
  frameId: string | null
): void {
  for (const node of nodes) {
    if (nodeIds.includes(node.id) && node.frame_id !== frameId) {
      node.frame_id = frameId
      // Persist to backend
      invoke('assign_node_to_frame', { nodeId: node.id, frameId }).catch((e) =>
        storeLogger.error('Failed to assign node to frame:', e)
      )
    }
  }
}
