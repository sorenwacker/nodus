/**
 * Layout strategy registry
 * Central registry for layout algorithms with auto-selection capabilities
 */
import type { LayoutStrategy, LayoutNode, LayoutEdge } from './types'

/**
 * Layout registry - manages available layout strategies
 */
class LayoutRegistry {
  private strategies = new Map<string, LayoutStrategy>()

  /**
   * Register a layout strategy
   */
  register(strategy: LayoutStrategy): void {
    this.strategies.set(strategy.name, strategy)
  }

  /**
   * Unregister a layout strategy
   */
  unregister(name: string): void {
    this.strategies.delete(name)
  }

  /**
   * Get a layout strategy by name
   */
  get(name: string): LayoutStrategy | undefined {
    return this.strategies.get(name)
  }

  /**
   * Check if a strategy is registered
   */
  has(name: string): boolean {
    return this.strategies.has(name)
  }

  /**
   * Get all registered strategies
   */
  list(): LayoutStrategy[] {
    return Array.from(this.strategies.values())
  }

  /**
   * Get strategy names
   */
  names(): string[] {
    return Array.from(this.strategies.keys())
  }

  /**
   * Auto-select best strategy based on graph characteristics
   */
  autoSelect(nodes: LayoutNode[], edges: LayoutEdge[]): LayoutStrategy {
    const nodeCount = nodes.length
    const edgeCount = edges.length

    // Build adjacency info for analysis
    const inDegree = new Map<string, number>()
    const outDegree = new Map<string, number>()
    for (const node of nodes) {
      inDegree.set(node.id, 0)
      outDegree.set(node.id, 0)
    }
    for (const edge of edges) {
      outDegree.set(edge.source, (outDegree.get(edge.source) || 0) + 1)
      inDegree.set(edge.target, (inDegree.get(edge.target) || 0) + 1)
    }

    // Detect graph type
    const rootCount = Array.from(inDegree.values()).filter((d) => d === 0).length
    const isDAG = rootCount > 0 && rootCount < nodeCount / 2
    const connectedRatio = edgeCount > 0 ? nodeCount / edgeCount : 0
    const isDense = connectedRatio < 2
    const isDisconnected = edgeCount === 0 || connectedRatio > 5

    // Select based on characteristics
    if (isDisconnected && this.has('grid')) {
      return this.get('grid')!
    }

    if (isDAG && this.has('hierarchical')) {
      return this.get('hierarchical')!
    }

    if (isDense && this.has('force')) {
      return this.get('force')!
    }

    // Default to force layout for connected graphs, grid for others
    if (edgeCount > 0 && this.has('force')) {
      return this.get('force')!
    }

    // Fallback to grid
    if (this.has('grid')) {
      return this.get('grid')!
    }

    // Last resort: first available strategy
    const first = this.strategies.values().next().value
    if (!first) {
      throw new Error('No layout strategies registered')
    }
    return first
  }

  /**
   * Get strategies suitable for a given node count
   */
  getSuitableStrategies(nodeCount: number): LayoutStrategy[] {
    return this.list().filter(
      (s) => !s.maxRecommendedNodes || s.maxRecommendedNodes >= nodeCount
    )
  }
}

// Singleton instance
export const layoutRegistry = new LayoutRegistry()

export { LayoutRegistry }
