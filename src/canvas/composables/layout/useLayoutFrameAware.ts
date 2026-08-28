/**
 * Frame-aware layout utilities
 * Handles preparation and post-processing for layouts that respect frame boundaries
 */
import { NODE_DEFAULTS } from '../../constants'
import { constrainNodesToFrame, resolveFrameOverlaps, type FrameRect, type NodeSize } from './useFrameCollision'

// Constant for frame virtual node prefix
export const FRAME_PREFIX = '___FRAME___'

export interface Node {
  id: string
  canvas_x: number
  canvas_y: number
  width?: number
  height?: number
  frame_id?: string | null
}

export interface Frame {
  id: string
  canvas_x: number
  canvas_y: number
  width: number
  height: number
  title?: string
  parent_frame_id?: string | null
}

export interface Edge {
  id: string
  source_node_id: string
  target_node_id: string
}

/**
 * Shared context for frame-aware layout algorithms
 */
export interface FrameAwareLayoutContext {
  virtualNodes: Node[]
  allFrames: Frame[]
  frameNodes: Map<string, Node[]>
  frameId: string | null
  centerX: number
  centerY: number
  nodes: Node[]
  targetFrame: FrameRect | null
}

/**
 * Result of preparing layout data structures
 */
export interface PreparedLayoutData {
  layoutNodes: Array<{ id: string; x: number; y: number; width: number; height: number }>
  layoutEdges: Array<{ source: string; target: string }>
  frameSnapshot: Map<string, { x: number; y: number }>
  nodeToFrameId: Map<string, string>
  /**
   * Frame-relative offsets of member nodes captured when the layout starts.
   * Targets are computed as frame position + offset, never incrementally from
   * the node's current (possibly mid-animation) position, so interrupted or
   * repeated runs cannot displace nodes relative to their frame.
   */
  nodeFrameOffsets: Map<string, { dx: number; dy: number }>
}

/**
 * Prepare layout data structures for frame-aware layouts (force, hierarchical)
 */
export function prepareFrameAwareLayout(
  ctx: FrameAwareLayoutContext,
  edges: Edge[]
): PreparedLayoutData {
  const { virtualNodes, allFrames, frameNodes, frameId } = ctx

  // Build layout nodes from virtualNodes
  const layoutNodes = virtualNodes.map(n => ({
    id: n.id,
    x: n.canvas_x,
    y: n.canvas_y,
    width: n.width || NODE_DEFAULTS.WIDTH,
    height: n.height || NODE_DEFAULTS.HEIGHT,
  }))

  const frameSnapshot = new Map<string, { x: number; y: number }>()
  const nodeToFrameId = new Map<string, string>()
  const nodeFrameOffsets = new Map<string, { dx: number; dy: number }>()

  if (!frameId) {
    // Global layout: add frames as virtual nodes
    const framePos = new Map<string, { x: number; y: number }>()
    for (const frame of allFrames) {
      frameSnapshot.set(frame.id, { x: frame.canvas_x, y: frame.canvas_y })
      framePos.set(frame.id, { x: frame.canvas_x, y: frame.canvas_y })
      layoutNodes.push({
        id: FRAME_PREFIX + frame.id,
        x: frame.canvas_x + frame.width / 2,
        y: frame.canvas_y + frame.height / 2,
        width: frame.width,
        height: frame.height,
      })
    }

    // Map framed nodes to their frame and capture their frame-relative
    // offset, clamped into the frame bounds: a run then repairs any node that
    // previously escaped its frame instead of preserving the escape
    const frameById = new Map(allFrames.map(f => [f.id, f]))
    const clampPadding = 10
    for (const [fId, nodesInFrame] of frameNodes) {
      const pos = framePos.get(fId)
      const frame = frameById.get(fId)
      for (const node of nodesInFrame) {
        nodeToFrameId.set(node.id, fId)
        if (pos && frame) {
          const nodeW = node.width || NODE_DEFAULTS.WIDTH
          const nodeH = node.height || NODE_DEFAULTS.HEIGHT
          const maxDx = Math.max(clampPadding, frame.width - nodeW - clampPadding)
          const maxDy = Math.max(clampPadding, frame.height - nodeH - clampPadding)
          nodeFrameOffsets.set(node.id, {
            dx: Math.min(Math.max(node.canvas_x - pos.x, clampPadding), maxDx),
            dy: Math.min(Math.max(node.canvas_y - pos.y, clampPadding), maxDy),
          })
        }
      }
    }
  }

  // Build a set of all layout node IDs
  const layoutNodeIds = new Set(layoutNodes.map(n => n.id))

  // Build edges - remap framed nodes to their frame's virtual node
  const layoutEdges = edges
    .map(e => {
      if (!frameId) {
        const sourceFrameId = nodeToFrameId.get(e.source_node_id)
        const targetFrameId = nodeToFrameId.get(e.target_node_id)
        return {
          source: sourceFrameId ? FRAME_PREFIX + sourceFrameId : e.source_node_id,
          target: targetFrameId ? FRAME_PREFIX + targetFrameId : e.target_node_id,
        }
      }
      return {
        source: e.source_node_id,
        target: e.target_node_id,
      }
    })
    .filter(e => layoutNodeIds.has(e.source) && layoutNodeIds.has(e.target))
    .filter(e => e.source !== e.target)

  return { layoutNodes, layoutEdges, frameSnapshot, nodeToFrameId, nodeFrameOffsets }
}

/**
 * Process layout results for frame-aware layouts
 * Handles frame movement and constraint application
 */
export function processFrameAwareLayoutResults(
  ctx: FrameAwareLayoutContext,
  positions: Map<string, { x: number; y: number }>,
  prepared: Pick<PreparedLayoutData, 'frameSnapshot' | 'nodeFrameOffsets'>,
  updateFramePosition: (id: string, x: number, y: number) => void,
  pushOutOfFrames: (targets: Map<string, { x: number; y: number }>, nodeSizes: Map<string, NodeSize>) => Map<string, { x: number; y: number }>,
  updateFrameSize?: (id: string, width: number, height: number) => void
): Map<string, { x: number; y: number }> {
  const { virtualNodes, allFrames, frameNodes, frameId, nodes, targetFrame } = ctx
  const { frameSnapshot, nodeFrameOffsets } = prepared

  // Build final targets map - exclude frame virtual nodes
  const nodeTargets = new Map<string, { x: number; y: number }>()
  for (const [id, pos] of positions) {
    if (!id.startsWith(FRAME_PREFIX)) {
      nodeTargets.set(id, pos)
    }
  }

  // For global layout, move frames and their contents together as rigid
  // units, then resolve frame-frame overlaps so repeated runs cannot stack
  // frames on top of each other
  if (!frameId) {
    // Prospective frame positions from the layout result
    const prospective = allFrames.map(frame => {
      const newPos = positions.get(FRAME_PREFIX + frame.id)
      const oldPos = frameSnapshot.get(frame.id)
      const x = newPos && oldPos ? newPos.x - frame.width / 2 : frame.canvas_x
      const y = newPos && oldPos ? newPos.y - frame.height / 2 : frame.canvas_y
      return {
        id: frame.id,
        canvas_x: x,
        canvas_y: y,
        width: frame.width,
        height: frame.height,
        parent_frame_id: frame.parent_frame_id ?? null,
      }
    })

    // Push overlapping frames apart before committing anything
    const resolved = resolveFrameOverlaps(prospective)

    for (const frame of allFrames) {
      const planned = prospective.find(p => p.id === frame.id)!
      const finalPos = resolved.get(frame.id) ?? { x: planned.canvas_x, y: planned.canvas_y }

      if (Math.abs(finalPos.x - frame.canvas_x) >= 1 || Math.abs(finalPos.y - frame.canvas_y) >= 1) {
        updateFramePosition(frame.id, finalPos.x, finalPos.y)
      }

      // Member node targets come from the offsets captured at snapshot time,
      // never from the node's current (possibly mid-animation) position.
      //
      // A node the layout positioned in its own right keeps that position. When
      // there is a selection, framed nodes take part in the layout and receive
      // real positions; moving them rigidly with their frame put them back
      // exactly where they started - the symptom including them was meant to
      // remove. Nodes that did not take part still travel with the frame
      // (PRODUCT_DESIGN.md > Layout of a selection).
      const nodesInFrame = frameNodes.get(frame.id) || []
      for (const node of nodesInFrame) {
        if (positions.has(node.id)) continue
        const offset = nodeFrameOffsets.get(node.id)
        if (offset) {
          nodeTargets.set(node.id, { x: finalPos.x + offset.dx, y: finalPos.y + offset.dy })
        }
      }
    }
  }

  // Handle frame-scoped layout
  if (frameId && targetFrame && updateFrameSize) {
    // Instead of constraining nodes, expand the frame to fit the layout
    const padding = 30
    const nodeSizes = new Map(nodes.map(n => [n.id, { width: n.width || NODE_DEFAULTS.WIDTH, height: n.height || NODE_DEFAULTS.HEIGHT }]))

    // Calculate bounding box of all node positions
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const [nodeId, pos] of nodeTargets) {
      const size = nodeSizes.get(nodeId)
      if (!size) continue
      minX = Math.min(minX, pos.x)
      minY = Math.min(minY, pos.y)
      maxX = Math.max(maxX, pos.x + size.width)
      maxY = Math.max(maxY, pos.y + size.height)
    }

    if (Number.isFinite(minX) && Number.isFinite(minY)) {
      // Calculate required frame bounds with padding
      const requiredLeft = minX - padding
      const requiredTop = minY - padding
      const requiredRight = maxX + padding
      const requiredBottom = maxY + padding

      // Expand frame if needed (never shrink)
      let newFrameX = targetFrame.canvas_x
      let newFrameY = targetFrame.canvas_y
      let newFrameWidth = targetFrame.width
      let newFrameHeight = targetFrame.height

      // Expand left
      if (requiredLeft < targetFrame.canvas_x) {
        const expandBy = targetFrame.canvas_x - requiredLeft
        newFrameX = requiredLeft
        newFrameWidth += expandBy
      }

      // Expand top
      if (requiredTop < targetFrame.canvas_y) {
        const expandBy = targetFrame.canvas_y - requiredTop
        newFrameY = requiredTop
        newFrameHeight += expandBy
      }

      // Expand right
      const currentRight = newFrameX + newFrameWidth
      if (requiredRight > currentRight) {
        newFrameWidth = requiredRight - newFrameX
      }

      // Expand bottom
      const currentBottom = newFrameY + newFrameHeight
      if (requiredBottom > currentBottom) {
        newFrameHeight = requiredBottom - newFrameY
      }

      // Apply frame changes
      const posChanged = newFrameX !== targetFrame.canvas_x || newFrameY !== targetFrame.canvas_y
      const sizeChanged = newFrameWidth !== targetFrame.width || newFrameHeight !== targetFrame.height

      if (posChanged) {
        updateFramePosition(frameId, newFrameX, newFrameY)
      }
      if (sizeChanged) {
        updateFrameSize(frameId, newFrameWidth, newFrameHeight)
      }
    }

    // Return positions as-is (frame expanded to fit, no node constraint needed)
    return nodeTargets
  } else if (frameId) {
    // Frame-scoped but no updateFrameSize available - fall back to constraint
    return targetFrame
      ? constrainNodesToFrame(nodeTargets, new Map(nodes.map(n => [n.id, { width: n.width, height: n.height }])), targetFrame)
      : nodeTargets
  } else {
    // Global: push unframed nodes out of frames
    const unframedIds = new Set(virtualNodes.map(n => n.id))
    const unframedTargets = new Map<string, { x: number; y: number }>()
    const framedTargets = new Map<string, { x: number; y: number }>()

    for (const [id, pos] of nodeTargets) {
      if (unframedIds.has(id)) {
        unframedTargets.set(id, pos)
      } else {
        framedTargets.set(id, pos)
      }
    }

    const pushedUnframed = pushOutOfFrames(
      unframedTargets,
      new Map(nodes.map(n => [n.id, { width: n.width, height: n.height }]))
    )

    return new Map([...pushedUnframed, ...framedTargets])
  }
}
