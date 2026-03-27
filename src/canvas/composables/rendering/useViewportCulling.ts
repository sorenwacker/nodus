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

export interface UseViewportCullingContext {
  scale: Ref<number>
  offsetX: Ref<number>
  offsetY: Ref<number>
  displayNodes: ComputedRef<Node[]>
  selectedNodeIds: Ref<string[]> | ComputedRef<string[]>
  /** When true, defer culling recalculation for smoother zoom */
  isZooming?: Ref<boolean>
}

export interface UseViewportCullingReturn {
  viewportWidth: Ref<number>
  viewportHeight: Ref<number>
  visibleNodes: ComputedRef<Node[]>
  visibleNodeIds: ComputedRef<Set<string>>
}

export function useViewportCulling(ctx: UseViewportCullingContext): UseViewportCullingReturn {
  const { scale, offsetX, offsetY, displayNodes, selectedNodeIds, isZooming } = ctx

  // Viewport size for culling (updated on resize)
  const viewportWidth = ref(window.innerWidth)
  const viewportHeight = ref(window.innerHeight)

  // Cached nodes for zoom deferral - prevents DOM thrashing during zoom
  let cachedVisibleNodes: Node[] = []
  let cacheValidUntilZoomEnds = false

  // Spatial index for large graphs
  const spatialGrid = new SpatialGrid({ cellSize: 500 })
  const spatialIndexVersion = ref(0)

  // Rebuild spatial index when nodes change
  watch(
    () => displayNodes.value,
    nodes => {
      // Invalidate cache when nodes change
      cacheValidUntilZoomEnds = false
      if (nodes.length >= SPATIAL_INDEX_THRESHOLD) {
        spatialGrid.build(nodes)
        spatialIndexVersion.value++
      }
    },
    { immediate: true }
  )

  // Invalidate cache when zoom ends to trigger recalculation
  if (isZooming) {
    watch(isZooming, zooming => {
      if (!zooming) {
        cacheValidUntilZoomEnds = false
      }
    })
  }

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

  // Only render nodes visible in viewport (with margin for smooth scrolling)
  // Always include selected nodes so they can be measured/fitted even if off-screen
  const visibleNodes = computed(() => {
    // Check zoom state FIRST, before reading any other reactive state
    // This minimizes dependency tracking during zoom
    if (isZooming?.value && cacheValidUntilZoomEnds && cachedVisibleNodes.length > 0) {
      return cachedVisibleNodes
    }

    const nodes = displayNodes.value
    const s = scale.value
    const ox = offsetX.value
    const oy = offsetY.value
    // Scale margin inversely with zoom, but cap it to avoid rendering everything when zoomed out
    // At zoom 1.0: 500px margin. At zoom 0.2: 1000px margin (capped)
    const baseMargin = 500
    const maxMargin = 1000 // Cap margin to prevent including all nodes when zoomed out
    const margin = Math.min(baseMargin / Math.max(s, 0.1), maxMargin)

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
      // Cache for small graphs too
      cachedVisibleNodes = result
      cacheValidUntilZoomEnds = true
      return result
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

    // Build node map for efficient lookup
    const nodeMap = new Map(nodes.map(n => [n.id, n]))

    // Filter candidates with precise AABB check (grid may have false positives at cell boundaries)
    const result: Node[] = []
    for (const id of candidateIds) {
      const node = nodeMap.get(id)
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

    // Cache the result for zoom deferral
    cachedVisibleNodes = result
    cacheValidUntilZoomEnds = true

    return result
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
