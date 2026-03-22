import { NODE_DEFAULTS } from '../../constants'

export interface NodeCollisionDeps {
  getNode: (id: string) => { canvas_x: number; canvas_y: number; width: number; height: number } | undefined
  getFilteredNodes: () => Array<{ id: string; canvas_x: number; canvas_y: number; width: number; height: number }>
  updateNodePosition: (id: string, x: number, y: number) => void
}

/**
 * Composable for handling node collision/overlap
 * Pushes overlapping nodes away from a source node
 */
export function useNodeCollision(deps: NodeCollisionDeps) {
  /**
   * Push nodes that overlap with the given node away (ripples through graph)
   */
  function pushOverlappingNodesAway(sourceId: string) {
    const PADDING = 50  // Space between nodes for edges

    const sourceNode = deps.getNode(sourceId)
    if (!sourceNode) return

    const sw = sourceNode.width || NODE_DEFAULTS.WIDTH
    const sh = sourceNode.height || NODE_DEFAULTS.HEIGHT
    const sx = sourceNode.canvas_x
    const sy = sourceNode.canvas_y
    const scx = sx + sw / 2
    const scy = sy + sh / 2

    for (const node of deps.getFilteredNodes()) {
      if (node.id === sourceId) continue

      const nw = node.width || NODE_DEFAULTS.WIDTH
      const nh = node.height || NODE_DEFAULTS.HEIGHT
      const nx = node.canvas_x
      const ny = node.canvas_y

      // Check if nodes overlap (with padding)
      const overlapX = sx < nx + nw + PADDING && sx + sw + PADDING > nx
      const overlapY = sy < ny + nh + PADDING && sy + sh + PADDING > ny

      if (overlapX && overlapY) {
        const ncx = nx + nw / 2
        const ncy = ny + nh / 2

        // Direction from source to this node
        const dx = ncx - scx
        const dy = ncy - scy

        let newX = nx
        let newY = ny

        // Push in the dominant direction
        if (Math.abs(dx) >= Math.abs(dy)) {
          // Push horizontally
          if (dx >= 0) {
            newX = sx + sw + PADDING  // Push right
          } else {
            newX = sx - nw - PADDING  // Push left
          }
        } else {
          // Push vertically
          if (dy >= 0) {
            newY = sy + sh + PADDING  // Push down
          } else {
            newY = sy - nh - PADDING  // Push up
          }
        }

        deps.updateNodePosition(node.id, newX, newY)
      }
    }
  }

  return {
    pushOverlappingNodesAway,
  }
}
