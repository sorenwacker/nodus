/**
 * Geometric utilities for edge routing
 */

import type { Point, NodeRect, Side } from './types'

export const CORNER_MARGIN = 8

/**
 * Determine which side of a node faces another point
 *
 * Takes node aspect ratio into account - wider nodes prefer left/right,
 * taller nodes prefer top/bottom. This provides more port space and
 * reduces crossings.
 */
export function getSide(node: NodeRect, targetX: number, targetY: number): Side {
  const w = node.width || 200
  const h = node.height || 120
  const cx = node.canvas_x + w / 2
  const cy = node.canvas_y + h / 2
  const dx = targetX - cx
  const dy = targetY - cy

  // Normalize by node dimensions to account for aspect ratio
  // This makes wider nodes prefer left/right, taller nodes prefer top/bottom
  const normalizedDx = Math.abs(dx) / w
  const normalizedDy = Math.abs(dy) / h

  if (normalizedDx > normalizedDy) {
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

  // Clamp offset to available space
  const clampedY = Math.max(-maxOffsetY, Math.min(maxOffsetY, offset))
  const clampedX = Math.max(-maxOffsetX, Math.min(maxOffsetX, offset))

  switch (side) {
    case 'right':
      return { x: node.canvas_x + w, y: cy + clampedY }
    case 'left':
      return { x: node.canvas_x, y: cy + clampedY }
    case 'bottom':
      return { x: cx + clampedX, y: node.canvas_y + h }
    case 'top':
      return { x: cx + clampedX, y: node.canvas_y }
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
 * Get angled standoff point for natural-looking edge entry
 * Adds a perpendicular offset based on edge direction to avoid 0-degree entries
 */
export function getAngledStandoff(
  port: Point,
  standoff: Point,
  side: Side,
  incomingDirection: Point,
  angleOffset: number = 15
): Point {
  // Calculate incoming angle relative to side normal
  const dx = incomingDirection.x - standoff.x
  const dy = incomingDirection.y - standoff.y

  // Offset perpendicular to the side normal based on incoming direction
  if (side === 'left' || side === 'right') {
    // Horizontal sides: offset vertically based on vertical component of incoming direction
    const offsetSign = dy > 0 ? 1 : dy < 0 ? -1 : 0
    return { x: standoff.x, y: standoff.y + offsetSign * angleOffset }
  } else {
    // Vertical sides: offset horizontally based on horizontal component of incoming direction
    const offsetSign = dx > 0 ? 1 : dx < 0 ? -1 : 0
    return { x: standoff.x + offsetSign * angleOffset, y: standoff.y }
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
