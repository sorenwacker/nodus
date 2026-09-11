/**
 * Geometry utilities
 * Shared functions for coordinate and size validation/clamping
 */

// Canvas bounds - large enough for hierarchical layouts with many levels
// (e.g., 1000 levels * 360px spacing = 360,000px)
const MAX_CANVAS_COORD = 1_000_000
const MIN_NODE_SIZE = 50
const MAX_NODE_SIZE = 5_000
const MIN_FRAME_SIZE = 50

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
 * Check if a coordinate is valid (finite number within reasonable bounds)
 */
export function isValidCoordinate(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && Math.abs(value) < 1_000_000
}

/**
 * Clamp a value between min and max
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

/** A rectangle in canvas coordinates */
export interface CanvasRect {
  canvas_x: number
  canvas_y: number
  width: number
  height: number
}

/**
 * The size a frame needs to contain the given rectangles, never smaller than it is.
 *
 * Measured from the frame's own origin to the furthest rectangle edge, plus
 * padding, because that is where the frame starts: the rectangles' own extent
 * is smaller whenever they sit to the right of or below the frame's corner
 * (PRODUCT_DESIGN.md > Fitting a frame to its contents). The frame never moves
 * and never shrinks. Returns null when there is nothing to contain.
 */
export function frameSizeToContain(
  frame: CanvasRect,
  rects: CanvasRect[],
  padding: number,
  titleHeight = 0
): { width: number; height: number } | null {
  if (rects.length === 0) return null
  let maxX = -Infinity
  let maxY = -Infinity
  for (const rect of rects) {
    maxX = Math.max(maxX, rect.canvas_x + rect.width)
    maxY = Math.max(maxY, rect.canvas_y + rect.height)
  }
  return {
    width: Math.max(frame.width, maxX + padding - frame.canvas_x),
    height: Math.max(frame.height, maxY + padding - frame.canvas_y + titleHeight),
  }
}
