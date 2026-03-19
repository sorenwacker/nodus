/**
 * Force layout strategy
 * Wraps the d3-force based layout algorithm
 */
import type { LayoutStrategy, LayoutNode, LayoutEdge, LayoutOptions } from '../types'
import { applyForceLayout } from '../forceLayout'

export interface ForceLayoutStrategyOptions extends LayoutOptions {
  /** Repulsion strength between nodes (negative = repel) */
  chargeStrength?: number
  /** Distance for links */
  linkDistance?: number
  /** Number of simulation iterations */
  iterations?: number
  /** Gravity strength (0-1) */
  gravityStrength?: number
}

export const ForceLayoutStrategy: LayoutStrategy = {
  name: 'force',
  displayName: 'Force',
  description: 'Force-directed layout that arranges nodes based on their connections',
  icon: 'network',
  supportsEdges: true,
  recommendedFor: 'dense',
  maxRecommendedNodes: 2000,

  async calculate(
    nodes: LayoutNode[],
    edges: LayoutEdge[],
    options: ForceLayoutStrategyOptions
  ): Promise<Map<string, { x: number; y: number }>> {
    if (nodes.length === 0) {
      return new Map()
    }

    // Adaptive iterations based on node count
    const n = nodes.length
    const defaultIterations =
      n > 2000 ? 30 : n > 1000 ? 50 : n > 500 ? 80 : n > 200 ? 100 : n > 100 ? 200 : 400

    const positions = await applyForceLayout(nodes, edges, {
      centerX: options.centerX,
      centerY: options.centerY,
      chargeStrength: options.chargeStrength ?? -100,
      linkDistance: options.linkDistance ?? 150,
      iterations: options.iterations ?? defaultIterations,
      gravityStrength: options.gravityStrength ?? 0.6,
    })

    return positions
  },
}
