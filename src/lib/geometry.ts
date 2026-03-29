/**
 * Geometry utilities
 * Shared functions for coordinate and size validation/clamping
 */

// Canvas bounds
export const MAX_CANVAS_COORD = 100_000
export const MIN_NODE_SIZE = 50
export const MAX_NODE_SIZE = 5_000
export const MIN_FRAME_SIZE = 50

/**
 * Validate and clamp a coordinate value to canvas bounds
 */
export function clampCoord(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(-MAX_CANVAS_COORD, Math.min(MAX_CANVAS_COORD, value))
}

/**
 * Validate and clamp a node size value
 */
export function clampNodeSize(value: number): number {
  if (!Number.isFinite(value)) return 200 // Default node width
  return Math.max(MIN_NODE_SIZE, Math.min(MAX_NODE_SIZE, value))
}

/**
 * Validate and clamp a frame size value (no max limit)
 */
export function clampFrameSize(value: number, min = MIN_FRAME_SIZE): number {
  if (!Number.isFinite(value)) return min
  return Math.max(min, value)
}

/**
 * Check if a coordinate is valid (finite number)
 */
export function isValidCoordinate(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

/**
 * Clamp a value between min and max
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}
