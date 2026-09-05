/**
 * The axis-aligned span of a set of nodes, in canvas px.
 *
 * One definition, used by fit-to-content and by the dynamic zoom-out floor -
 * both must agree on what "the whole graph" means, or a fit could land below
 * the deepest zoom the user is allowed to reach.
 */
import { NODE_DEFAULTS } from '../constants'

export interface ContentSpan {
  minX: number
  minY: number
  width: number
  height: number
}

export function contentSpan(
  nodes: Array<{ canvas_x: number; canvas_y: number; width?: number | null; height?: number | null }>
): ContentSpan | null {
  if (nodes.length === 0) return null
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const node of nodes) {
    minX = Math.min(minX, node.canvas_x)
    minY = Math.min(minY, node.canvas_y)
    maxX = Math.max(maxX, node.canvas_x + (node.width || NODE_DEFAULTS.WIDTH))
    maxY = Math.max(maxY, node.canvas_y + (node.height || NODE_DEFAULTS.HEIGHT))
  }
  return { minX, minY, width: maxX - minX, height: maxY - minY }
}
