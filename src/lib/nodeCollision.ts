/**
 * Node collision detection and resolution utilities
 * Handles pushing overlapping nodes apart
 */

interface CollisionNode {
  id: string
  canvas_x: number
  canvas_y: number
  width: number
  height: number
  workspace_id?: string | null
}

interface CollisionContext {
  nodes: CollisionNode[]
  updatePosition: (id: string, x: number, y: number) => void
}

const DEFAULT_PADDING = 15
const MAX_ITERATIONS = 50

/**
 * Push nodes that overlap with the given node away (ripples through graph)
 */
export function pushOverlappingNodes(
  sourceNode: CollisionNode,
  context: CollisionContext,
  processed = new Set<string>()
): void {
  if (processed.size > MAX_ITERATIONS) return
  processed.add(sourceNode.id)

  const sw = sourceNode.width
  const sh = sourceNode.height
  const sx = sourceNode.canvas_x
  const sy = sourceNode.canvas_y
  const scx = sx + sw / 2
  const scy = sy + sh / 2

  const pushedNodes: CollisionNode[] = []

  for (const node of context.nodes) {
    if (node.id === sourceNode.id) continue
    if (node.workspace_id !== sourceNode.workspace_id) continue
    if (processed.has(node.id)) continue

    const nw = node.width
    const nh = node.height
    const nx = node.canvas_x
    const ny = node.canvas_y

    // Check for overlap (with padding)
    const overlapX = sx < nx + nw + DEFAULT_PADDING && sx + sw + DEFAULT_PADDING > nx
    const overlapY = sy < ny + nh + DEFAULT_PADDING && sy + sh + DEFAULT_PADDING > ny

    if (overlapX && overlapY) {
      // Calculate push direction (away from source node center)
      const ncx = nx + nw / 2
      const ncy = ny + nh / 2
      const dx = ncx - scx
      const dy = ncy - scy

      // Calculate how much to push
      let pushX = 0
      let pushY = 0
      if (Math.abs(dx) > Math.abs(dy)) {
        // Push horizontally
        if (dx > 0) {
          pushX = (sx + sw + DEFAULT_PADDING) - nx
        } else {
          pushX = (sx - DEFAULT_PADDING) - (nx + nw)
        }
      } else {
        // Push vertically
        if (dy > 0) {
          pushY = (sy + sh + DEFAULT_PADDING) - ny
        } else {
          pushY = (sy - DEFAULT_PADDING) - (ny + nh)
        }
      }

      // Apply push
      node.canvas_x += pushX
      node.canvas_y += pushY

      // Persist position
      context.updatePosition(node.id, node.canvas_x, node.canvas_y)

      pushedNodes.push(node)
    }
  }

  // Recursively push nodes that the pushed nodes now overlap with
  for (const pushedNode of pushedNodes) {
    pushOverlappingNodes(pushedNode, context, processed)
  }
}
