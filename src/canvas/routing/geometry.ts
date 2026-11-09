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
 * Get point on node edge with port offset.
 *
 * With `lanePitch` the point is moved along the side onto the nearest lane
 * centre of the routing grid (lanes sit at odd multiples of half the pitch
 * in canvas coordinates), staying clear of the corners. The maze router
 * leaves a card along a lane, so a port on a lane centre gives a straight
 * exit; everything that derives geometry from the port (hit areas, labels)
 * must pass the same pitch so it lands on the same point
 * (PRODUCT_DESIGN.md > Edge Routing (PCB-Style)).
 */
export function getPortPoint(node: NodeRect, side: Side, offset: number, lanePitch?: number): Point {
  const w = node.width || 200
  const h = node.height || 120
  const cx = node.canvas_x + w / 2
  const cy = node.canvas_y + h / 2

  const maxOffsetY = (h / 2) - CORNER_MARGIN
  const maxOffsetX = (w / 2) - CORNER_MARGIN

  // Clamp offset to available space
  const clampedY = Math.max(-maxOffsetY, Math.min(maxOffsetY, offset))
  const clampedX = Math.max(-maxOffsetX, Math.min(maxOffsetX, offset))

  const snap = (v: number, lo: number, hi: number): number => {
    if (!lanePitch) return v
    const lane = Math.round(v / lanePitch - 0.5)
    const minLane = Math.ceil(lo / lanePitch - 0.5)
    const maxLane = Math.floor(hi / lanePitch - 0.5)
    if (minLane > maxLane) return v // side too narrow for a lane: keep the raw point
    return (Math.min(maxLane, Math.max(minLane, lane)) + 0.5) * lanePitch
  }

  switch (side) {
    case 'right':
      return { x: node.canvas_x + w, y: snap(cy + clampedY, cy - maxOffsetY, cy + maxOffsetY) }
    case 'left':
      return { x: node.canvas_x, y: snap(cy + clampedY, cy - maxOffsetY, cy + maxOffsetY) }
    case 'bottom':
      return { x: snap(cx + clampedX, cx - maxOffsetX, cx + maxOffsetX), y: node.canvas_y + h }
    case 'top':
      return { x: snap(cx + clampedX, cx - maxOffsetX, cx + maxOffsetX), y: node.canvas_y }
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
  _port: Point,
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
