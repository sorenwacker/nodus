/**
 * Layout strategy types
 * Defines interfaces for pluggable layout algorithms
 */

export interface LayoutNode {
  id: string
  x: number
  y: number
  width: number
  height: number
}

export interface LayoutEdge {
  source: string
  target: string
}

export interface LayoutOptions {
  /** Center X coordinate for the layout */
  centerX: number
  /** Center Y coordinate for the layout */
  centerY: number
  /** Strategy-specific options passed through */
  [key: string]: unknown
}

export interface LayoutResult {
  /** Map of node ID to new position */
  positions: Map<string, { x: number; y: number }>
  /** Optional: suggested animation duration in ms */
  animationDuration?: number
}

/**
 * Layout strategy interface
 * All layout algorithms implement this interface
 */
export interface LayoutStrategy {
  /** Unique name identifier */
  name: string
  /** Display name for UI */
  displayName: string
  /** Optional icon identifier */
  icon?: string
  /** Description for tooltips */
  description?: string

  /**
   * Calculate new positions for nodes
   * @param nodes - Array of nodes with current positions and dimensions
   * @param edges - Array of edges connecting nodes
   * @param options - Layout options including center coordinates
   * @returns Promise resolving to map of node ID -> new position
   */
  calculate(
    nodes: LayoutNode[],
    edges: LayoutEdge[],
    options: LayoutOptions
  ): Promise<Map<string, { x: number; y: number }>>

  /** Whether this strategy uses edge information */
  supportsEdges: boolean

  /** Recommended graph type (for auto-selection) */
  recommendedFor?: 'DAG' | 'tree' | 'disconnected' | 'dense' | 'any'

  /** Maximum recommended node count for this strategy (performance hint) */
  maxRecommendedNodes?: number
}

/**
 * Options for layout animation
 */
export interface LayoutAnimationOptions {
  /** Animation duration in ms */
  duration?: number
  /** Easing function */
  easing?: 'linear' | 'easeOut' | 'easeInOut'
  /** Callback for each frame */
  onFrame?: (positions: Map<string, { x: number; y: number }>) => void
  /** Callback on completion */
  onComplete?: () => void
}
