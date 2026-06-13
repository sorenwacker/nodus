/**
 * Frame Handlers
 *
 * Handles frame creation, update, deletion, and node assignment operations.
 */

import type { Frame } from '../../types'
import type { McpFrame } from '../types'
import { JsonRpcErrorCodes } from '../types'
import type { McpStoreInterface } from '../messageHandler'
import { normalizeColor, McpError } from './nodeHandlers'

/**
 * Convert internal Frame to MCP format
 */
export function frameToMcp(frame: Frame): McpFrame {
  return {
    id: frame.id,
    title: frame.title,
    canvas_x: frame.canvas_x,
    canvas_y: frame.canvas_y,
    width: frame.width,
    height: frame.height,
    color: frame.color,
    parent_frame_id: frame.parent_frame_id,
  }
}

/**
 * Helper: Fit frame to its nodes and resolve overlaps with other frames
 */
async function fitFrameToNodesAndResolveOverlaps(
  store: McpStoreInterface,
  frameId: string
): Promise<void> {
  const frame = store.getFrame(frameId)
  if (!frame) return

  const padding = 20
  const titleHeight = 50

  // Get all nodes in this frame
  const nodesInFrame = store.getFilteredNodes().filter((n) => n.frame_id === frameId)
  if (nodesInFrame.length === 0) return

  // Calculate bounding box of all nodes
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const node of nodesInFrame) {
    minX = Math.min(minX, node.canvas_x)
    minY = Math.min(minY, node.canvas_y)
    maxX = Math.max(maxX, node.canvas_x + node.width)
    maxY = Math.max(maxY, node.canvas_y + node.height)
  }

  // Calculate required frame size with padding
  const requiredWidth = maxX - minX + padding * 2
  const requiredHeight = maxY - minY + padding * 2 + titleHeight

  // Only resize if needed (frame too small)
  const newWidth = Math.max(frame.width, requiredWidth)
  const newHeight = Math.max(frame.height, requiredHeight)

  if (newWidth !== frame.width || newHeight !== frame.height) {
    await store.updateFrameSize(frameId, newWidth, newHeight)
  }

  // Resolve overlaps with other frames
  const allFrames = store.getFilteredFrames()
  const updatedFrame = store.getFrame(frameId)
  if (!updatedFrame) return

  for (const otherFrame of allFrames) {
    if (otherFrame.id === frameId) continue

    // Check for overlap
    const overlap = !(
      updatedFrame.canvas_x + updatedFrame.width < otherFrame.canvas_x ||
      otherFrame.canvas_x + otherFrame.width < updatedFrame.canvas_x ||
      updatedFrame.canvas_y + updatedFrame.height < otherFrame.canvas_y ||
      otherFrame.canvas_y + otherFrame.height < updatedFrame.canvas_y
    )

    if (overlap) {
      // Push other frame to the right
      const newX = updatedFrame.canvas_x + updatedFrame.width + 20
      await store.updateFramePosition(otherFrame.id, newX, otherFrame.canvas_y)
    }
  }
}

/**
 * Helper: Pull nodes inside frame bounds
 */
async function pullNodesInsideFrame(store: McpStoreInterface, frameId: string): Promise<void> {
  const frame = store.getFrame(frameId)
  if (!frame) return

  const padding = 20
  const titleHeight = 50
  const nodesInFrame = store.getFilteredNodes().filter((n) => n.frame_id === frameId)

  for (const node of nodesInFrame) {
    const minX = frame.canvas_x + padding
    const minY = frame.canvas_y + padding + titleHeight
    const maxX = frame.canvas_x + frame.width - node.width - padding
    const maxY = frame.canvas_y + frame.height - node.height - padding

    // Check if node is outside
    if (node.canvas_x < minX || node.canvas_x > maxX || node.canvas_y < minY || node.canvas_y > maxY) {
      const newX = Math.max(minX, Math.min(maxX, node.canvas_x))
      const newY = Math.max(minY, Math.min(maxY, node.canvas_y))
      await store.updateNodePosition(node.id, newX, newY)
    }
  }
}

export function handleListFrames(store: McpStoreInterface): McpFrame[] {
  return store.getFilteredFrames().map(frameToMcp)
}

export function handleGetFrame(store: McpStoreInterface, params: { id: string }): McpFrame {
  const frame = store.getFrame(params.id)
  if (!frame) {
    throw new McpError(
      JsonRpcErrorCodes.INVALID_PARAMS,
      `Frame not found: ${params.id}`
    )
  }
  return frameToMcp(frame)
}

export function handleCreateFrame(
  store: McpStoreInterface,
  params: { title: string; x?: number; y?: number; width?: number; height?: number; color?: string }
): { id: string } {
  const frame = store.createFrame(
    params.x ?? 100,
    params.y ?? 100,
    params.width ?? 400,
    params.height ?? 300,
    params.title
  )

  // Set color if provided
  if (params.color) {
    const color = normalizeColor(params.color)
    if (color) {
      store.updateFrameColor(frame.id, color)
    }
  }

  return { id: frame.id }
}

export async function handleUpdateFrame(
  store: McpStoreInterface,
  params: {
    id: string
    updates: { title?: string; x?: number; y?: number; width?: number; height?: number; color?: string | null }
  }
): Promise<{ success: boolean }> {
  const frame = store.getFrame(params.id)
  if (!frame) {
    throw new McpError(
      JsonRpcErrorCodes.INVALID_PARAMS,
      `Frame not found: ${params.id}`
    )
  }

  const { updates } = params

  if (updates.title !== undefined) {
    await store.updateFrameTitle(params.id, updates.title)
  }

  if (updates.x !== undefined && updates.y !== undefined) {
    await store.updateFramePosition(params.id, updates.x, updates.y)
  }

  if (updates.width !== undefined && updates.height !== undefined) {
    await store.updateFrameSize(params.id, updates.width, updates.height)
  }

  if (updates.color !== undefined) {
    const color = normalizeColor(updates.color)
    await store.updateFrameColor(params.id, color)
  }

  return { success: true }
}

export function handleDeleteFrame(store: McpStoreInterface, params: { id: string }): { success: boolean } {
  const frame = store.getFrame(params.id)
  if (!frame) {
    throw new McpError(
      JsonRpcErrorCodes.INVALID_PARAMS,
      `Frame not found: ${params.id}`
    )
  }

  store.deleteFrame(params.id)
  return { success: true }
}

export function handleGetNodesInFrame(
  store: McpStoreInterface,
  params: { frame_id: string }
): Array<{ id: string; title: string; frame_id: string | null }> {
  const frame = store.getFrame(params.frame_id)
  if (!frame) {
    throw new McpError(
      JsonRpcErrorCodes.INVALID_PARAMS,
      `Frame not found: ${params.frame_id}`
    )
  }

  // Find nodes assigned to this frame
  const nodes = store.getFilteredNodes().filter((node) => node.frame_id === params.frame_id)

  return nodes.map((n) => ({ id: n.id, title: n.title, frame_id: n.frame_id }))
}

export async function handleAssignNodeToFrame(
  store: McpStoreInterface,
  params: { node_id: string; frame_id: string }
): Promise<{ success: boolean; moved: boolean }> {
  const node = store.getNode(params.node_id)
  if (!node) {
    throw new McpError(
      JsonRpcErrorCodes.INVALID_PARAMS,
      `Node not found: ${params.node_id}`
    )
  }

  const frame = store.getFrame(params.frame_id)
  if (!frame) {
    throw new McpError(
      JsonRpcErrorCodes.INVALID_PARAMS,
      `Frame not found: ${params.frame_id}`
    )
  }

  store.assignNodesToFrame([params.node_id], params.frame_id)

  // Move node inside frame if it's outside
  const padding = 20
  const nodeRight = node.canvas_x + node.width
  const nodeBottom = node.canvas_y + node.height
  const frameRight = frame.canvas_x + frame.width - padding
  const frameBottom = frame.canvas_y + frame.height - padding

  const isOutside =
    node.canvas_x < frame.canvas_x + padding ||
    node.canvas_y < frame.canvas_y + padding ||
    nodeRight > frameRight ||
    nodeBottom > frameBottom

  let moved = false
  if (isOutside) {
    // Place node at top-left of frame with padding
    const newX = frame.canvas_x + padding
    const newY = frame.canvas_y + padding + 40 // Extra space for frame title
    await store.updateNodePosition(params.node_id, newX, newY)
    moved = true
  }

  // Fit frame to nodes and resolve overlaps
  await fitFrameToNodesAndResolveOverlaps(store, params.frame_id)

  return { success: true, moved }
}

export function handleRemoveNodeFromFrame(
  store: McpStoreInterface,
  params: { node_id: string }
): { success: boolean } {
  const node = store.getNode(params.node_id)
  if (!node) {
    throw new McpError(
      JsonRpcErrorCodes.INVALID_PARAMS,
      `Node not found: ${params.node_id}`
    )
  }

  store.assignNodesToFrame([params.node_id], null)
  return { success: true }
}

export async function handleBatchAssignNodesToFrame(
  store: McpStoreInterface,
  params: { node_ids: string[]; frame_id?: string | null }
): Promise<{ success: boolean; count: number; moved: number }> {
  const frameId = params.frame_id ?? null

  // Validate frame exists if assigning to a frame
  const frame = frameId !== null ? store.getFrame(frameId) : null
  if (frameId !== null && !frame) {
    throw new McpError(
      JsonRpcErrorCodes.INVALID_PARAMS,
      `Frame not found: ${frameId}`
    )
  }

  // Filter to valid nodes
  const validNodeIds = params.node_ids.filter((id) => store.getNode(id))
  store.assignNodesToFrame(validNodeIds, frameId)

  // Move nodes inside frame if assigning to a frame
  let movedCount = 0
  if (frame) {
    const padding = 20
    const frameLeft = frame.canvas_x + padding
    const frameTop = frame.canvas_y + padding + 40 // Extra space for frame title
    const frameRight = frame.canvas_x + frame.width - padding
    const frameBottom = frame.canvas_y + frame.height - padding

    for (let i = 0; i < validNodeIds.length; i++) {
      const node = store.getNode(validNodeIds[i])
      if (!node) continue

      const nodeRight = node.canvas_x + node.width
      const nodeBottom = node.canvas_y + node.height

      const isOutside =
        node.canvas_x < frameLeft ||
        node.canvas_y < frameTop ||
        nodeRight > frameRight ||
        nodeBottom > frameBottom

      if (isOutside) {
        // Stack nodes vertically inside frame
        const newX = frameLeft
        const newY = frameTop + i * (node.height + 10)
        await store.updateNodePosition(validNodeIds[i], newX, newY)
        movedCount++
      }
    }

    // Fit frame to nodes and resolve overlaps
    await fitFrameToNodesAndResolveOverlaps(store, frameId)
  }

  return { success: true, count: validNodeIds.length, moved: movedCount }
}

export async function handleBatchMoveFrames(
  store: McpStoreInterface,
  params: { moves: Array<{ id: string; x: number; y: number }> }
): Promise<{ success: boolean; count: number }> {
  let count = 0
  for (const move of params.moves) {
    const frame = store.getFrame(move.id)
    if (!frame) continue

    // Calculate delta to move nodes with frame
    const dx = move.x - frame.canvas_x
    const dy = move.y - frame.canvas_y

    // Move frame
    await store.updateFramePosition(move.id, move.x, move.y)

    // Move all nodes assigned to this frame
    const nodesInFrame = store.getFilteredNodes().filter((n) => n.frame_id === move.id)
    for (const node of nodesInFrame) {
      await store.updateNodePosition(node.id, node.canvas_x + dx, node.canvas_y + dy)
    }

    count++
  }

  return { success: true, count }
}

export async function handleBatchResizeFrames(
  store: McpStoreInterface,
  params: { resizes: Array<{ id: string; width: number; height: number }> }
): Promise<{ success: boolean; count: number }> {
  let count = 0
  for (const resize of params.resizes) {
    const frame = store.getFrame(resize.id)
    if (!frame) continue

    await store.updateFrameSize(resize.id, resize.width, resize.height)

    // Pull nodes inside if they would be outside after resize
    await pullNodesInsideFrame(store, resize.id)

    count++
  }

  return { success: true, count }
}

export async function handleFitFrameToContents(
  store: McpStoreInterface,
  params: { frame_id: string }
): Promise<{ success: boolean; resized: boolean }> {
  const frame = store.getFrame(params.frame_id)
  if (!frame) {
    throw new McpError(
      JsonRpcErrorCodes.INVALID_PARAMS,
      `Frame not found: ${params.frame_id}`
    )
  }

  await fitFrameToNodesAndResolveOverlaps(store, params.frame_id)
  return { success: true, resized: true }
}

export async function handleFitAllFrames(store: McpStoreInterface): Promise<{ success: boolean; count: number }> {
  const frames = store.getFilteredFrames()
  let count = 0

  for (const frame of frames) {
    const nodesInFrame = store.getFilteredNodes().filter((n) => n.frame_id === frame.id)
    if (nodesInFrame.length > 0) {
      await fitFrameToNodesAndResolveOverlaps(store, frame.id)
      count++
    }
  }

  // Final pass to resolve any remaining overlaps
  await handleResolveFrameOverlaps(store)

  return { success: true, count }
}

export function handleCheckFrameOverlaps(
  store: McpStoreInterface
): Array<{ frame1: { id: string; title: string }; frame2: { id: string; title: string }; overlap: { x: number; y: number; width: number; height: number } }> {
  const frames = store.getFilteredFrames()
  const overlaps: Array<{ frame1: { id: string; title: string }; frame2: { id: string; title: string }; overlap: { x: number; y: number; width: number; height: number } }> = []

  for (let i = 0; i < frames.length; i++) {
    for (let j = i + 1; j < frames.length; j++) {
      const f1 = frames[i]
      const f2 = frames[j]

      // Calculate overlap rectangle
      const overlapX = Math.max(f1.canvas_x, f2.canvas_x)
      const overlapY = Math.max(f1.canvas_y, f2.canvas_y)
      const overlapRight = Math.min(f1.canvas_x + f1.width, f2.canvas_x + f2.width)
      const overlapBottom = Math.min(f1.canvas_y + f1.height, f2.canvas_y + f2.height)

      if (overlapRight > overlapX && overlapBottom > overlapY) {
        overlaps.push({
          frame1: { id: f1.id, title: f1.title },
          frame2: { id: f2.id, title: f2.title },
          overlap: {
            x: overlapX,
            y: overlapY,
            width: overlapRight - overlapX,
            height: overlapBottom - overlapY,
          },
        })
      }
    }
  }

  return overlaps
}

export async function handleResolveFrameOverlaps(store: McpStoreInterface): Promise<{ success: boolean; resolved: number }> {
  const frames = store.getFilteredFrames()
  let resolved = 0

  // Sort frames by x position (left to right)
  const sortedFrames = [...frames].sort((a, b) => a.canvas_x - b.canvas_x)

  for (let i = 0; i < sortedFrames.length; i++) {
    const frame = sortedFrames[i]

    for (let j = i + 1; j < sortedFrames.length; j++) {
      const otherFrame = sortedFrames[j]

      // Check for overlap
      const overlaps = !(
        frame.canvas_x + frame.width < otherFrame.canvas_x ||
        otherFrame.canvas_x + otherFrame.width < frame.canvas_x ||
        frame.canvas_y + frame.height < otherFrame.canvas_y ||
        otherFrame.canvas_y + otherFrame.height < frame.canvas_y
      )

      if (overlaps) {
        // Push other frame to the right
        const newX = frame.canvas_x + frame.width + 20
        await store.updateFramePosition(otherFrame.id, newX, otherFrame.canvas_y)
        // Update local reference for cascade resolution
        otherFrame.canvas_x = newX
        resolved++
      }
    }
  }

  return { success: true, resolved }
}
