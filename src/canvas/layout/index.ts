/**
 * Layout utilities
 */

// Strategy types and registry
export type {
  LayoutStrategy,
  LayoutNode as StrategyLayoutNode,
  LayoutEdge as StrategyLayoutEdge,
  LayoutOptions,
  LayoutResult,
  LayoutAnimationOptions,
} from './types'

export { layoutRegistry, LayoutRegistry } from './registry'

// Strategy implementations
export {
  ForceLayoutStrategy,
  HierarchicalLayoutStrategy,
  GridLayoutStrategy,
} from './strategies'

// Legacy exports for backwards compatibility
export {
  applyForceLayout,
  layoutNodesWithForce,
  type LayoutNode,
  type LayoutEdge,
  type ForceLayoutOptions,
} from './forceLayout'

export {
  applyHierarchicalLayout,
  type HierarchicalLayoutOptions,
} from './hierarchicalLayout'

export {
  fastGridLayout,
  batchUpdatePositions,
  type FastGridNode,
  type FastGridOptions,
} from './fastGrid'

// Register default strategies
import { layoutRegistry } from './registry'
import { ForceLayoutStrategy, HierarchicalLayoutStrategy, GridLayoutStrategy } from './strategies'

layoutRegistry.register(ForceLayoutStrategy)
layoutRegistry.register(HierarchicalLayoutStrategy)
layoutRegistry.register(GridLayoutStrategy)
