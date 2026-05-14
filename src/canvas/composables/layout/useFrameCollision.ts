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

// ============================================================================
// Frame Node Organization - Attract members, repel non-members
// ============================================================================

export interface NodeForOrganize {
  id: string
  canvas_x: number
  canvas_y: number
  width?: number
  height?: number
}

export interface FrameForOrganize extends FrameRect {
  id: string
}

/**
 * Organize nodes relative to a single frame after resize:
 * - Any node overlapping the frame gets pulled fully inside
 * - Nodes not touching the frame stay where they are
 *
 * This ensures nodes stay in their frame when you resize it smaller.
 */
export function organizeFrameNodes(
  nodes: NodeForOrganize[],
  frame: FrameForOrganize,
  padding = 20
): Map<string, { x: number; y: number }> {
  const result = new Map<string, { x: number; y: number }>()

  for (const node of nodes) {
    const nodeWidth = node.width || NODE_DEFAULTS.WIDTH
    const nodeHeight = node.height || NODE_DEFAULTS.HEIGHT

    // Check if node overlaps frame at all
    const isTouching = isNodeTouchingFrame(node.canvas_x, node.canvas_y, nodeWidth, nodeHeight, frame, 0)

    if (isTouching) {
      // Node overlaps frame - constrain it to be fully inside
      const minX = frame.canvas_x + padding
      const minY = frame.canvas_y + padding
      const maxX = frame.canvas_x + frame.width - nodeWidth - padding
      const maxY = frame.canvas_y + frame.height - nodeHeight - padding

      // Clamp position to frame bounds (handle small frames)
      const clampedMaxX = Math.max(minX, maxX)
      const clampedMaxY = Math.max(minY, maxY)
      const newX = Math.max(minX, Math.min(clampedMaxX, node.canvas_x))
      const newY = Math.max(minY, Math.min(clampedMaxY, node.canvas_y))

      result.set(node.id, { x: newX, y: newY })
    } else {
      // Node doesn't touch frame - keep position
      result.set(node.id, { x: node.canvas_x, y: node.canvas_y })
    }
  }

  return result
}

/**
 * Check if a node is fully inside a frame (with padding)
 */
export function isNodeFullyInsideFrame(
  nodeX: number,
  nodeY: number,
  nodeWidth: number,
  nodeHeight: number,
  frame: FrameRect,
  padding = 0
): boolean {
  const nodeRight = nodeX + nodeWidth
  const nodeBottom = nodeY + nodeHeight

  return (
    nodeX >= frame.canvas_x + padding &&
    nodeRight <= frame.canvas_x + frame.width - padding &&
    nodeY >= frame.canvas_y + padding &&
    nodeBottom <= frame.canvas_y + frame.height - padding
  )
}

// ============================================================================
// Frame-to-Frame Collision Detection and Resolution
// ============================================================================

export interface FrameWithId extends FrameRect {
  id: string
  parent_frame_id?: string | null
}

/**
 * Check if two frames overlap (including gap between them).
 * Returns true if frames are overlapping or closer than the specified gap.
 */
export function doFramesOverlap(
  frame1: FrameRect,
  frame2: FrameRect,
  gap = 40
): boolean {
  const f1Right = frame1.canvas_x + frame1.width + gap
  const f1Bottom = frame1.canvas_y + frame1.height + gap
  const f2Right = frame2.canvas_x + frame2.width + gap
  const f2Bottom = frame2.canvas_y + frame2.height + gap

  // Check for overlap with gap padding
  const overlapX = frame1.canvas_x < f2Right && f1Right > frame2.canvas_x
  const overlapY = frame1.canvas_y < f2Bottom && f1Bottom > frame2.canvas_y

  return overlapX && overlapY
}

/**
 * Calculate the separation vector needed to push frame2 away from frame1.
 * Returns { dx, dy } representing the minimum displacement to eliminate overlap.
 * Push direction is determined by the dominant axis (horizontal or vertical).
 */
export function calculateFrameSeparation(
  frame1: FrameRect,
  frame2: FrameRect,
  gap = 40
): { dx: number; dy: number } {
  // Calculate centers
  const center1X = frame1.canvas_x + frame1.width / 2
  const center1Y = frame1.canvas_y + frame1.height / 2
  const center2X = frame2.canvas_x + frame2.width / 2
  const center2Y = frame2.canvas_y + frame2.height / 2

  // Vector from frame1 center to frame2 center
  const vecX = center2X - center1X
  const vecY = center2Y - center1Y

  // Calculate overlap amounts in each direction
  const overlapRight = (frame1.canvas_x + frame1.width + gap) - frame2.canvas_x
  const overlapLeft = (frame2.canvas_x + frame2.width + gap) - frame1.canvas_x
  const overlapBottom = (frame1.canvas_y + frame1.height + gap) - frame2.canvas_y
  const overlapTop = (frame2.canvas_y + frame2.height + gap) - frame1.canvas_y

  // Determine push direction based on center offset (dominant axis)
  if (Math.abs(vecX) >= Math.abs(vecY)) {
    // Push horizontally
    if (vecX >= 0) {
      // Frame2 is to the right, push right
      return { dx: overlapRight, dy: 0 }
    } else {
      // Frame2 is to the left, push left
      return { dx: -overlapLeft, dy: 0 }
    }
  } else {
    // Push vertically
    if (vecY >= 0) {
      // Frame2 is below, push down
      return { dx: 0, dy: overlapBottom }
    } else {
      // Frame2 is above, push up
      return { dx: 0, dy: -overlapTop }
    }
  }
}

/**
 * Resolve all frame overlaps by iteratively pushing frames apart.
 * Child frames (with parent_frame_id) are skipped - they move with their parent.
 * Returns a map of frame IDs to their new positions.
 */
export function resolveFrameOverlaps(
  frames: FrameWithId[],
  gap = 40,
  maxIterations = 10
): Map<string, { x: number; y: number }> {
  // Filter out child frames - they move with their parents
  const topLevelFrames = frames.filter(f => !f.parent_frame_id)

  // Create mutable positions map
  const positions = new Map<string, { x: number; y: number }>()
  for (const frame of topLevelFrames) {
    positions.set(frame.id, { x: frame.canvas_x, y: frame.canvas_y })
  }

  // Create size map for overlap checks
  const sizes = new Map<string, { width: number; height: number }>()
  for (const frame of topLevelFrames) {
    sizes.set(frame.id, { width: frame.width, height: frame.height })
  }

  // Iteratively resolve overlaps
  for (let iteration = 0; iteration < maxIterations; iteration++) {
    let hasOverlap = false

    // Check all frame pairs
    for (let i = 0; i < topLevelFrames.length; i++) {
      for (let j = i + 1; j < topLevelFrames.length; j++) {
        const frame1 = topLevelFrames[i]
        const frame2 = topLevelFrames[j]
        const pos1 = positions.get(frame1.id)!
        const pos2 = positions.get(frame2.id)!
        const size1 = sizes.get(frame1.id)!
        const size2 = sizes.get(frame2.id)!

        // Build temporary rects for overlap check
        const rect1: FrameRect = {
          canvas_x: pos1.x,
          canvas_y: pos1.y,
          width: size1.width,
          height: size1.height,
        }
        const rect2: FrameRect = {
          canvas_x: pos2.x,
          canvas_y: pos2.y,
          width: size2.width,
          height: size2.height,
        }

        if (doFramesOverlap(rect1, rect2, gap)) {
          hasOverlap = true
          const separation = calculateFrameSeparation(rect1, rect2, gap)

          // Push the second frame (frame2) away
          positions.set(frame2.id, {
            x: pos2.x + separation.dx,
            y: pos2.y + separation.dy,
          })
        }
      }
    }

    // Exit early if no overlaps found
    if (!hasOverlap) break
  }

  return positions
}
