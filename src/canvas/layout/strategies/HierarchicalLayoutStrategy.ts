/**
 * Hierarchical layout strategy
 * Wraps the dagre-based hierarchical layout algorithm
 */
import type { LayoutStrategy, LayoutNode, LayoutEdge, LayoutOptions } from '../types'
import { applyHierarchicalLayout } from '../hierarchicalLayout'

export interface HierarchicalLayoutStrategyOptions extends LayoutOptions {
  /** Direction of the hierarchy: TB (top-bottom), BT, LR, RL */
  direction?: 'TB' | 'BT' | 'LR' | 'RL'
  /** Horizontal spacing between nodes */
  nodeSpacingX?: number
  /** Vertical spacing between layers */
  nodeSpacingY?: number
  /** Alignment within ranks: UL, UR, DL, DR */
  align?: 'UL' | 'UR' | 'DL' | 'DR'
  /** Algorithm for ranking: network-simplex, tight-tree, longest-path */
  ranker?: 'network-simplex' | 'tight-tree' | 'longest-path'
}

export const HierarchicalLayoutStrategy: LayoutStrategy = {
  name: 'hierarchical',
  displayName: 'Hierarchical',
  description: 'Tree-like layout for DAGs and ontologies',
  icon: 'tree',
  supportsEdges: true,
  recommendedFor: 'DAG',
  maxRecommendedNodes: 1000,

  async calculate(
    nodes: LayoutNode[],
    edges: LayoutEdge[],
    options: HierarchicalLayoutStrategyOptions
  ): Promise<Map<string, { x: number; y: number }>> {
    if (nodes.length === 0) {
      return new Map()
    }

    const positions = applyHierarchicalLayout(nodes, edges, {
      direction: options.direction ?? 'TB',
      nodeSpacingX: options.nodeSpacingX ?? 50,
      nodeSpacingY: options.nodeSpacingY ?? 120,
      centerX: options.centerX,
      centerY: options.centerY,
      align: options.align,
      ranker: options.ranker ?? 'network-simplex',
    })

    return positions
  },
}
