/**
 * Viewport culling composable
 *
 * Handles viewport-based node visibility filtering for performance optimization
 * Uses spatial grid indexing for O(k) queries instead of O(n) linear scan
 */

import { ref, computed, watch, onMounted, onUnmounted, type Ref, type ComputedRef } from 'vue'
import { NODE_DEFAULTS } from '../../constants'
import { SpatialGrid } from '../../utils/SpatialGrid'
import type { Node } from '../../../types'

// Threshold for using spatial index (below this, linear scan is faster)
const SPATIAL_INDEX_THRESHOLD = 200

// Viewport margin for smooth scrolling (includes nodes slightly off-screen)
const BASE_VIEWPORT_MARGIN = 500
const MAX_VIEWPORT_MARGIN = 1000 // Cap margin to prevent including all nodes when zoomed out

// Grid cell size for spatial indexing
const SPATIAL_GRID_CELL_SIZE = 500

export interface UseViewportCullingContext {
  scale: Ref<number>
  offsetX: Ref<number>
  offsetY: Ref<number>
  displayNodes: ComputedRef<Node[]>
  selectedNodeIds: Ref<string[]> | ComputedRef<string[]>
  /** Increments when node positions change (e.g., after layout) */
  nodeLayoutVersion?: Ref<number> | ComputedRef<number>
}

export interface UseViewportCullingReturn {
  viewportWidth: Ref<number>
  viewportHeight: Ref<number>
  visibleNodes: ComputedRef<Node[]>
  visibleNodeIds: ComputedRef<Set<string>>
}

export function useViewportCulling(ctx: UseViewportCullingContext): UseViewportCullingReturn {
  const { scale, offsetX, offsetY, displayNodes, selectedNodeIds, nodeLayoutVersion } = ctx

  // Viewport size for culling (updated on resize)
  const viewportWidth = ref(window.innerWidth)
  const viewportHeight = ref(window.innerHeight)

  // Zoom deferral caching was removed here on the grounds that a GPU renderer
  // made it unnecessary. No such renderer exists: nodes are DOM, edges SVG
  // (PRODUCT_DESIGN.md > Canvas rendering). Whether deferral is worth
  // restoring is a question for the render benchmark, not for assumption.

  // Spatial index for large graphs
  const spatialGrid = new SpatialGrid({ cellSize: SPATIAL_GRID_CELL_SIZE })
  const spatialIndexVersion = ref(0)

  // Rebuild spatial index when nodes change or positions update (after layout)
  watch(
    [() => displayNodes.value, () => nodeLayoutVersion?.value],
    ([nodes]) => {
      if (nodes.length >= SPATIAL_INDEX_THRESHOLD) {
        spatialGrid.build(nodes)
        spatialIndexVersion.value++
      }
    },
    { immediate: true }
  )

  // Node id -> node lookup, memoized so it is not rebuilt on every pan/zoom
  // frame. Depends only on the node set and layout version, not the viewport.
  const nodeMap = computed(() => {
    void nodeLayoutVersion?.value
    return new Map(displayNodes.value.map(n => [n.id, n]))
  })

  // Handle window resize
  function onResize() {
    viewportWidth.value = window.innerWidth
    viewportHeight.value = window.innerHeight
  }

  onMounted(() => {
    window.addEventListener('resize', onResize)
  })

  onUnmounted(() => {
    window.removeEventListener('resize', onResize)
  })

  // Previous result, returned unchanged while the same nodes are on screen.
  // Panning changes the viewport every frame; without this, edge styling and
  // the node list recompute on each one even though nothing entered or left.
  let lastSource: Node[] | null = null
  let lastVisible: Node[] = []
  let lastVisibleIds = new Set<string>()

  function stabilise(next: Node[], source: Node[]): Node[] {
    // A replaced node set means new objects: never reuse the old ones
    if (source === lastSource && next.length === lastVisibleIds.size) {
      let same = true
      for (const node of next) {
        if (!lastVisibleIds.has(node.id)) {
          same = false
          break
        }
      }
      if (same) return lastVisible
    }
    lastSource = source
    lastVisible = next
    lastVisibleIds = new Set(next.map(n => n.id))
    return next
  }

  // Only render nodes visible in viewport (with margin for smooth scrolling)
  // Always include selected nodes so they can be measured/fitted even if off-screen
  const visibleNodes = computed(() => {
    const nodes = displayNodes.value
    const s = scale.value
    const ox = offsetX.value
    const oy = offsetY.value
    // Scale margin inversely with zoom, but cap it to avoid rendering everything when zoomed out
    // At zoom 1.0: 500px margin. At zoom 0.2: 1000px margin (capped)
    const margin = Math.min(BASE_VIEWPORT_MARGIN / Math.max(s, 0.1), MAX_VIEWPORT_MARGIN)

    // Viewport bounds in canvas coordinates
    const viewLeft = -ox / s - margin
    const viewTop = -oy / s - margin
    const viewRight = (viewportWidth.value - ox) / s + margin
    const viewBottom = (viewportHeight.value - oy) / s + margin

    // Selected nodes should always be rendered (for fitting, etc.)
    const selectedSet = new Set(selectedNodeIds.value)

    // For small graphs, use simple linear filter (faster than grid overhead)
    if (nodes.length < SPATIAL_INDEX_THRESHOLD) {
      const result = nodes.filter(node => {
        if (selectedSet.has(node.id)) return true
        const nodeRight = node.canvas_x + (node.width || NODE_DEFAULTS.WIDTH)
        const nodeBottom = node.canvas_y + (node.height || NODE_DEFAULTS.HEIGHT)
        return (
          nodeRight >= viewLeft &&
          node.canvas_x <= viewRight &&
          nodeBottom >= viewTop &&
          node.canvas_y <= viewBottom
        )
      })
      return stabilise(result, nodes)
    }

    // For large graphs, use spatial index for O(k) query
    // Track version to ensure reactivity
    void spatialIndexVersion.value

    // Get candidate nodes from spatial grid
    const candidateIds = spatialGrid.queryViewport(viewLeft, viewTop, viewRight, viewBottom)

    // Add selected nodes (always visible)
    for (const id of selectedSet) {
      candidateIds.add(id)
    }

    // Memoized node lookup (rebuilt only when the node set changes)
    const lookup = nodeMap.value

    // Filter candidates with precise AABB check (grid may have false positives at cell boundaries)
    const result: Node[] = []
    for (const id of candidateIds) {
      const node = lookup.get(id)
      if (!node) continue

      // Selected nodes always included
      if (selectedSet.has(id)) {
        result.push(node)
        continue
      }

      // Precise AABB check
      const nodeRight = node.canvas_x + (node.width || NODE_DEFAULTS.WIDTH)
      const nodeBottom = node.canvas_y + (node.height || NODE_DEFAULTS.HEIGHT)
      if (
        nodeRight >= viewLeft &&
        node.canvas_x <= viewRight &&
        nodeBottom >= viewTop &&
        node.canvas_y <= viewBottom
      ) {
        result.push(node)
      }
    }

    return stabilise(result, nodes)
  })

  // Set of visible node IDs for quick lookup
  const visibleNodeIds = computed(() => new Set(visibleNodes.value.map(n => n.id)))

  return {
    viewportWidth,
    viewportHeight,
    visibleNodes,
    visibleNodeIds,
  }
}
