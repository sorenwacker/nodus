/**
 * Core auto-layout implementation
 * Handles grid, horizontal, vertical, force, and hierarchical layouts
 */
import { NODE_DEFAULTS } from '../../constants'
import { applyForceLayout, applyHierarchicalLayout } from '../../layout'
import { fastGridLayout, batchUpdatePositions } from '../../layout/fastGrid'
import { tetrisGridLayout } from './useTetrisLayout'

/** The fields a layout reads; callers pass store nodes or overlay subsets */
export interface Node {
  id: string
  canvas_x: number
  canvas_y: number
  width?: number
  height?: number
}

export interface Edge {
  id: string
  source_node_id: string
  target_node_id: string
}

export type LayoutType = 'grid' | 'horizontal' | 'vertical' | 'force' | 'hierarchical' | 'radial'

export interface AutoLayoutStore {
  getNodes: () => Node[]
  getFilteredNodes: () => Node[]
  getFilteredEdges: () => Edge[]
  getSelectedNodeIds: () => string[]
  updateNodePosition: (id: string, x: number, y: number) => void
}

export interface AutoLayoutOptions {
  store: AutoLayoutStore
  animateToPositions: (targets: Map<string, { x: number; y: number }>, duration?: number) => void
}

/**
 * Execute auto-layout algorithm
 * Returns true if layout was applied, false if skipped (e.g., radial needs separate handling)
 */
export async function executeAutoLayout(
  layout: LayoutType,
  options: AutoLayoutOptions
): Promise<boolean> {
  const { store, animateToPositions } = options

  // Radial layout is handled separately (requires exactly one selected node)
  if (layout === 'radial') {
    return false
  }

  const selectedIds = store.getSelectedNodeIds()
  const allNodes = store.getFilteredNodes()
  const nodes = selectedIds.length > 0
    ? allNodes.filter(n => selectedIds.includes(n.id))
    : allNodes

  if (nodes.length === 0) return true

  // Thresholds for layout performance
  const FAST_GRID_THRESHOLD = 500  // Use fast grid algorithm above this
  const HUGE_THRESHOLD = 5000      // Warn but still try for huge graphs

  // Fast path for grid layout with large node sets
  if (layout === 'grid' && nodes.length > FAST_GRID_THRESHOLD) {
    let sumX = 0, sumY = 0
    for (const node of nodes) {
      sumX += node.canvas_x
      sumY += node.canvas_y
    }
    const centerX = sumX / nodes.length
    const centerY = sumY / nodes.length

    // Use optimized fast grid with typed arrays
    const fastNodes = nodes.map(n => ({
      id: n.id,
      width: n.width || NODE_DEFAULTS.WIDTH,
      height: n.height || NODE_DEFAULTS.HEIGHT,
    }))

    const positions = fastGridLayout(fastNodes, {
      centerX,
      centerY,
      gap: 360,
    })

    // Batch update positions to avoid blocking UI
    await batchUpdatePositions(positions, store.updateNodePosition, 200)
    return true
  }

  // Warn for huge graphs but still allow force/hierarchical
  if (nodes.length > HUGE_THRESHOLD) {
    console.warn(`Very large graph (${nodes.length} nodes) - ${layout} layout may be slow`)
  }

  // Layout centre: the centre of the nodes being laid out
  let sumX = 0, sumY = 0
  for (const node of nodes) {
    sumX += node.canvas_x + (node.width || NODE_DEFAULTS.WIDTH) / 2
    sumY += node.canvas_y + (node.height || NODE_DEFAULTS.HEIGHT) / 2
  }
  const centerX = sumX / nodes.length
  const centerY = sumY / nodes.length

  // Gap between nodes in grid layout
  const gridGap = 24 // Tight packing gap

  if (layout === 'force' || layout === 'hierarchical') {
    const edges = store.getFilteredEdges()

    const layoutNodes = nodes.map(n => ({
      id: n.id,
      x: n.canvas_x,
      y: n.canvas_y,
      width: n.width || NODE_DEFAULTS.WIDTH,
      height: n.height || NODE_DEFAULTS.HEIGHT,
    }))
    const ids = new Set(layoutNodes.map(n => n.id))
    const layoutEdges = edges
      .filter(e => ids.has(e.source_node_id) && ids.has(e.target_node_id) && e.source_node_id !== e.target_node_id)
      .map(e => ({ source: e.source_node_id, target: e.target_node_id }))

    // Execute the specific layout algorithm
    let positions: Map<string, { x: number; y: number }>

    if (layout === 'force') {
      // Scale iterations based on node count
      const n = layoutNodes.length
      const iterations = n > 2000 ? 30 : n > 1000 ? 50 : n > 500 ? 80 : n > 200 ? 100 : n > 100 ? 200 : 400
      positions = await applyForceLayout(layoutNodes, layoutEdges, {
        centerX,
        centerY,
        iterations,
      })
    } else {
      // For very large graphs, use simpler ranker
      const ranker = layoutNodes.length > 2000 ? 'longest-path' : 'network-simplex'

      // Use setTimeout to avoid blocking UI
      positions = await new Promise<Map<string, { x: number; y: number }>>((resolve) => {
        setTimeout(() => {
          const result = applyHierarchicalLayout(layoutNodes, layoutEdges, {
            direction: 'TB',
            centerX,
            centerY,
            ranker,
          })
          resolve(result)
        }, 10)
      })
    }

    // Apply positions with animation or batch update
    if (positions.size > 500) {
      await batchUpdatePositions(positions, store.updateNodePosition, 200)
    } else {
      animateToPositions(positions, layout === 'force' ? 800 : 600)
    }
    return true
  }

  const targets = new Map<string, { x: number; y: number }>()

  if (layout === 'grid') {
    const edges = store.getFilteredEdges()
    const trialTargets = tetrisGridLayout(nodes, edges, 0, 0, gridGap)

    if (trialTargets.size === 0) {
      console.warn('Grid layout: no positions generated')
      return true
    }

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const node of nodes) {
      const pos = trialTargets.get(node.id)
      if (!pos) continue
      const w = node.width || NODE_DEFAULTS.WIDTH
      const h = node.height || NODE_DEFAULTS.HEIGHT
      minX = Math.min(minX, pos.x)
      minY = Math.min(minY, pos.y)
      maxX = Math.max(maxX, pos.x + w)
      maxY = Math.max(maxY, pos.y + h)
    }

    const layoutCenterX = (minX + maxX) / 2
    const layoutCenterY = (minY + maxY) / 2
    const offsetX = centerX - layoutCenterX
    const offsetY = centerY - layoutCenterY

    for (const [id, pos] of trialTargets) {
      targets.set(id, { x: pos.x + offsetX, y: pos.y + offsetY })
    }
  } else if (layout === 'horizontal') {
    const sorted = [...nodes].sort((a, b) => (b.height || NODE_DEFAULTS.HEIGHT) - (a.height || NODE_DEFAULTS.HEIGHT))
    const totalWidth = sorted.reduce((sum, n) => sum + (n.width || NODE_DEFAULTS.WIDTH) + gridGap, -gridGap)
    let x = centerX - totalWidth / 2
    const maxHeight = Math.max(...sorted.map(n => n.height || NODE_DEFAULTS.HEIGHT))

    for (const node of sorted) {
      const h = node.height || NODE_DEFAULTS.HEIGHT
      targets.set(node.id, { x, y: centerY - maxHeight / 2 + (maxHeight - h) / 2 })
      x += (node.width || NODE_DEFAULTS.WIDTH) + gridGap
    }
  } else if (layout === 'vertical') {
    const sorted = [...nodes].sort((a, b) => (b.width || NODE_DEFAULTS.WIDTH) - (a.width || NODE_DEFAULTS.WIDTH))
    const totalHeight = sorted.reduce((sum, n) => sum + (n.height || NODE_DEFAULTS.HEIGHT) + gridGap, -gridGap)
    let y = centerY - totalHeight / 2
    const maxWidth = Math.max(...sorted.map(n => n.width || NODE_DEFAULTS.WIDTH))

    for (const node of sorted) {
      const w = node.width || NODE_DEFAULTS.WIDTH
      targets.set(node.id, { x: centerX - maxWidth / 2 + (maxWidth - w) / 2, y })
      y += (node.height || NODE_DEFAULTS.HEIGHT) + gridGap
    }
  }

  animateToPositions(targets, 500)
  return true
}
