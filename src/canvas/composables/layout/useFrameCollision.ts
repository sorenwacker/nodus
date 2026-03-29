/**
 * Frame collision utilities
 * Functions for handling node-frame spatial relationships
 */
import { NODE_DEFAULTS } from '../../constants'

export interface FrameRect {
  canvas_x: number
  canvas_y: number
  width: number
  height: number
}

export interface NodeSize {
  width?: number
  height?: number
}

/**
 * Check if a node is spatially inside a frame (50%+ overlap)
 */
export function isNodeInFrame(
  nodeX: number,
  nodeY: number,
  nodeWidth: number,
  nodeHeight: number,
  frame: FrameRect
): boolean {
  const nodeArea = nodeWidth * nodeHeight

  const overlapX = Math.max(0,
    Math.min(nodeX + nodeWidth, frame.canvas_x + frame.width) -
    Math.max(nodeX, frame.canvas_x))
  const overlapY = Math.max(0,
    Math.min(nodeY + nodeHeight, frame.canvas_y + frame.height) -
    Math.max(nodeY, frame.canvas_y))

  return overlapX * overlapY > nodeArea * 0.5
}

/**
 * Push nodes out of frame boundaries after layout calculation.
 * Ensures nodes don't end up inside frames.
 */
export function pushNodesOutOfFrames(
  positions: Map<string, { x: number; y: number }>,
  nodeMap: Map<string, NodeSize>,
  frames: FrameRect[]
): Map<string, { x: number; y: number }> {
  if (frames.length === 0) return positions

  const result = new Map<string, { x: number; y: number }>()
  const framePadding = 20

  for (const [nodeId, pos] of positions) {
    const nodeInfo = nodeMap.get(nodeId)
    const nodeWidth = nodeInfo?.width || NODE_DEFAULTS.WIDTH
    const nodeHeight = nodeInfo?.height || NODE_DEFAULTS.HEIGHT
    let newX = pos.x
    let newY = pos.y

    // Check collision with each frame and push out
    for (const frame of frames) {
      const nodeRight = newX + nodeWidth
      const nodeBottom = newY + nodeHeight
      const frameRight = frame.canvas_x + frame.width
      const frameBottom = frame.canvas_y + frame.height

      // Check if node overlaps frame
      const overlapX = newX < frameRight && nodeRight > frame.canvas_x
      const overlapY = newY < frameBottom && nodeBottom > frame.canvas_y

      if (overlapX && overlapY) {
        // Calculate push distances for each direction
        const pushLeft = nodeRight - frame.canvas_x
        const pushRight = frameRight - newX
        const pushUp = nodeBottom - frame.canvas_y
        const pushDown = frameBottom - newY

        // Find minimum push distance and apply
        const minPush = Math.min(pushLeft, pushRight, pushUp, pushDown)
        if (minPush === pushLeft) {
          newX = frame.canvas_x - nodeWidth - framePadding
        } else if (minPush === pushRight) {
          newX = frameRight + framePadding
        } else if (minPush === pushUp) {
          newY = frame.canvas_y - nodeHeight - framePadding
        } else {
          newY = frameBottom + framePadding
        }
      }
    }

    result.set(nodeId, { x: newX, y: newY })
  }

  return result
}

/**
 * Constrain nodes to stay within a frame's boundaries.
 * Used for frame-scoped layout to prevent nodes from leaving the frame.
 */
export function constrainNodesToFrame(
  positions: Map<string, { x: number; y: number }>,
  nodeMap: Map<string, NodeSize>,
  frame: FrameRect,
  padding = 20
): Map<string, { x: number; y: number }> {
  const result = new Map<string, { x: number; y: number }>()

  for (const [nodeId, pos] of positions) {
    const nodeInfo = nodeMap.get(nodeId)
    const nodeWidth = nodeInfo?.width || NODE_DEFAULTS.WIDTH
    const nodeHeight = nodeInfo?.height || NODE_DEFAULTS.HEIGHT

    // Constrain X position
    const minX = frame.canvas_x + padding
    const maxX = frame.canvas_x + frame.width - nodeWidth - padding
    const newX = Math.max(minX, Math.min(maxX, pos.x))

    // Constrain Y position
    const minY = frame.canvas_y + padding
    const maxY = frame.canvas_y + frame.height - nodeHeight - padding
    const newY = Math.max(minY, Math.min(maxY, pos.y))

    result.set(nodeId, { x: newX, y: newY })
  }

  return result
}
