/**
 * Geometric utilities for edge routing
 */

import type { Point, NodeRect, Side } from './types'

export const CORNER_MARGIN = 12

/**
 * Determine which side of a node faces another point
 */
export function getSide(node: NodeRect, targetX: number, targetY: number): Side {
  const w = node.width || 200
  const h = node.height || 120
  const cx = node.canvas_x + w / 2
  const cy = node.canvas_y + h / 2
  const dx = targetX - cx
  const dy = targetY - cy

  if (Math.abs(dx) > Math.abs(dy)) {
    return dx > 0 ? 'right' : 'left'
  }
  return dy > 0 ? 'bottom' : 'top'
}

/**
 * Get point on node edge with port offset
 */
export function getPortPoint(node: NodeRect, side: Side, offset: number): Point {
  const w = node.width || 200
  const h = node.height || 120
  const cx = node.canvas_x + w / 2
  const cy = node.canvas_y + h / 2

  const maxOffsetY = (h / 2) - CORNER_MARGIN
  const maxOffsetX = (w / 2) - CORNER_MARGIN

  switch (side) {
    case 'right':
      return { x: node.canvas_x + w, y: cy + Math.max(-maxOffsetY, Math.min(maxOffsetY, offset)) }
    case 'left':
      return { x: node.canvas_x, y: cy + Math.max(-maxOffsetY, Math.min(maxOffsetY, offset)) }
    case 'bottom':
      return { x: cx + Math.max(-maxOffsetX, Math.min(maxOffsetX, offset)), y: node.canvas_y + h }
    case 'top':
      return { x: cx + Math.max(-maxOffsetX, Math.min(maxOffsetX, offset)), y: node.canvas_y }
  }
}

/**
 * Get standoff point (slightly away from node edge)
 */
export function getStandoff(point: Point, side: Side, distance: number): Point {
  switch (side) {
    case 'right': return { x: point.x + distance, y: point.y }
    case 'left': return { x: point.x - distance, y: point.y }
    case 'bottom': return { x: point.x, y: point.y + distance }
    case 'top': return { x: point.x, y: point.y - distance }
  }
}

/**
 * Get center point of a node
 */
export function getNodeCenter(node: NodeRect): Point {
  const w = node.width || 200
  const h = node.height || 120
  return {
    x: node.canvas_x + w / 2,
    y: node.canvas_y + h / 2
  }
}
