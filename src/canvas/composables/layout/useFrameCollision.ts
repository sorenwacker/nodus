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
 * Used for determining which frame a node "belongs to"
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
 * Check if a node has ANY overlap with a frame (even 1 pixel)
 * Used for layout protection - nodes touching frames shouldn't be moved by global layout
 */
export function isNodeTouchingFrame(
  nodeX: number,
  nodeY: number,
  nodeWidth: number,
  nodeHeight: number,
  frame: FrameRect,
  padding = 0
): boolean {
  const nodeRight = nodeX + nodeWidth
  const nodeBottom = nodeY + nodeHeight
  const frameRight = frame.canvas_x + frame.width
  const frameBottom = frame.canvas_y + frame.height

  // Check if rectangles overlap (including padding zone)
  const overlapX = nodeX - padding < frameRight && nodeRight + padding > frame.canvas_x
  const overlapY = nodeY - padding < frameBottom && nodeBottom + padding > frame.canvas_y

  return overlapX && overlapY
}

/**
 * Check if a node's center is inside a frame
 * Alternative containment check
 */
export function isNodeCenterInFrame(
  nodeX: number,
  nodeY: number,
  nodeWidth: number,
  nodeHeight: number,
  frame: FrameRect
): boolean {
  const nodeCenterX = nodeX + nodeWidth / 2
  const nodeCenterY = nodeY + nodeHeight / 2
  const frameRight = frame.canvas_x + frame.width
  const frameBottom = frame.canvas_y + frame.height

  return (
    nodeCenterX >= frame.canvas_x &&
    nodeCenterX <= frameRight &&
    nodeCenterY >= frame.canvas_y &&
    nodeCenterY <= frameBottom
  )
}

/**
 * Push nodes fully out of frame boundaries after layout calculation.
 * Ensures no part of a node overlaps with frames.
 * Iterates until no more overlaps occur (handles adjacent frames).
 */
export function pushNodesOutOfFrames(
  positions: Map<string, { x: number; y: number }>,
  nodeMap: Map<string, NodeSize>,
  frames: FrameRect[]
): Map<string, { x: number; y: number }> {
  if (frames.length === 0) return positions

  const result = new Map<string, { x: number; y: number }>()
  const framePadding = 30 // Gap between node edge and frame edge
  const maxIterations = 10 // Prevent infinite loops

  for (const [nodeId, pos] of positions) {
    const nodeInfo = nodeMap.get(nodeId)
    const nodeWidth = nodeInfo?.width || NODE_DEFAULTS.WIDTH
    const nodeHeight = nodeInfo?.height || NODE_DEFAULTS.HEIGHT
    let newX = pos.x
    let newY = pos.y

    // Iterate until no overlaps or max iterations reached
    for (let iteration = 0; iteration < maxIterations; iteration++) {
      let hasOverlap = false

      for (const frame of frames) {
        const nodeRight = newX + nodeWidth
        const nodeBottom = newY + nodeHeight
        const frameRight = frame.canvas_x + frame.width
        const frameBottom = frame.canvas_y + frame.height

        // Check if node overlaps frame
        const overlapX = newX < frameRight && nodeRight > frame.canvas_x
        const overlapY = newY < frameBottom && nodeBottom > frame.canvas_y

        if (overlapX && overlapY) {
          hasOverlap = true

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

      // Exit early if no overlaps found
      if (!hasOverlap) break
    }

    result.set(nodeId, { x: newX, y: newY })
  }

  return result
}

/**
 * Constrain nodes to stay fully within a frame's boundaries.
 * Used for frame-scoped layout to prevent nodes from leaving the frame.
 * Ensures the entire node rectangle stays inside the frame with padding.
 */
export function constrainNodesToFrame(
  positions: Map<string, { x: number; y: number }>,
  nodeMap: Map<string, NodeSize>,
  frame: FrameRect,
  padding = 30
): Map<string, { x: number; y: number }> {
  const result = new Map<string, { x: number; y: number }>()

  for (const [nodeId, pos] of positions) {
    const nodeInfo = nodeMap.get(nodeId)
    const nodeWidth = nodeInfo?.width || NODE_DEFAULTS.WIDTH
    const nodeHeight = nodeInfo?.height || NODE_DEFAULTS.HEIGHT

    // Constrain X position - ensure full node width stays inside
    const minX = frame.canvas_x + padding
    const maxX = frame.canvas_x + frame.width - nodeWidth - padding
    // Handle case where frame is smaller than node
    const clampedMaxX = Math.max(minX, maxX)
    const newX = Math.max(minX, Math.min(clampedMaxX, pos.x))

    // Constrain Y position - ensure full node height stays inside
    const minY = frame.canvas_y + padding
    const maxY = frame.canvas_y + frame.height - nodeHeight - padding
    // Handle case where frame is smaller than node
    const clampedMaxY = Math.max(minY, maxY)
    const newY = Math.max(minY, Math.min(clampedMaxY, pos.y))

    result.set(nodeId, { x: newX, y: newY })
  }

  return result
}
