/**
 * Canvas constants
 * Centralized configuration values for canvas rendering
 */

/** Default node dimensions */
export const NODE_DEFAULTS = {
  WIDTH: 200,
  HEIGHT: 120,
  MIN_HEIGHT: 60,
  MAX_HEIGHT: 800,
} as const

/** Layout spacing for neighborhood view and auto-layout */
export const LAYOUT_GAPS = {
  /** Vertical distance between rows (parents/focus/children) */
  VERTICAL: 300,
  /** Horizontal gap between nodes in same row */
  HORIZONTAL: 150,
  /** Gap between focus node and siblings */
  SIBLING_GAP: 150,
  /** Vertical spacing between stacked siblings */
  SIBLING_VERTICAL: 80,
} as const

/** Edge routing constants */
export const EDGE_ROUTING = {
  /** Standoff distance from node edge */
  STANDOFF: 120,
  /** Perpendicular offset for angled entry */
  ANGLE_OFFSET: 12,
  /** Port spacing for parallel edges */
  PORT_SPACING: 20,
} as const

/**
 * Get node dimensions with defaults
 */
export function getNodeDimensions(node: { width?: number; height?: number }): { width: number; height: number } {
  return {
    width: node.width || NODE_DEFAULTS.WIDTH,
    height: node.height || NODE_DEFAULTS.HEIGHT,
  }
}
