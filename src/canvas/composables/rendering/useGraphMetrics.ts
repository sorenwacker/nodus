/**
 * Graph metrics composable
 *
 * Computes graph size thresholds, LOD mode, and node degree for visualization optimization
 */

import { computed, ref, type Ref, type ComputedRef } from 'vue'
import type { Node, Edge } from '../../../types'

export interface UseGraphMetricsContext {
  displayNodes: ComputedRef<Node[]>
  visibleNodes: ComputedRef<Node[]>
  filteredNodes: ComputedRef<Node[]> | Ref<Node[]>
  filteredEdges: ComputedRef<Edge[]> | Ref<Edge[]>
  neighborhoodMode: Ref<boolean>
  scale: Ref<number>
}

// Persistent LOD mode override (user can manually toggle bubble mode)
const forceLODMode = ref(false)

export interface UseGraphMetricsReturn {
  isLargeGraph: ComputedRef<boolean>
  isHugeGraph: ComputedRef<boolean>
  isMassiveGraph: ComputedRef<boolean>
  isSemanticZoomCollapsed: ComputedRef<boolean>
  isLODMode: ComputedRef<boolean>
  isBubbleModeForced: ComputedRef<boolean>
  nodeDegree: ComputedRef<Record<string, number>>
  getLODRadius: (nodeId: string) => number
  toggleBubbleMode: () => void
}

// LOD (Level of Detail) mode threshold
const LOD_THRESHOLD = 500

export function useGraphMetrics(ctx: UseGraphMetricsContext): UseGraphMetricsReturn {
  const {
    displayNodes,
    visibleNodes,
    filteredNodes,
    filteredEdges,
    neighborhoodMode,
    scale,
  } = ctx

  // Graph size thresholds - use displayNodes count so neighborhood mode gets proper routing
  // In neighborhood mode, always use full routing since we have few nodes
  // Thresholds increased for modern hardware - most devices handle 500+ nodes fine
  const isLargeGraph = computed(() =>
    !neighborhoodMode.value && (displayNodes.value.length > 500 || filteredEdges.value.length > 1500)
  )

  const isHugeGraph = computed(() =>
    !neighborhoodMode.value && displayNodes.value.length > 1000
  )

  const isMassiveGraph = computed(() =>
    !neighborhoodMode.value && (displayNodes.value.length > 800 || filteredEdges.value.length > 2000)
  )

  // Semantic zoom collapse - show title only when zoomed out
  // Triggers at 30% zoom for any graph, or 50% for massive graphs
  const isSemanticZoomCollapsed = computed(() => {
    const s = scale.value
    // Always collapse below 30% zoom
    if (s < 0.3) return true
    // Collapse massive graphs below 50% zoom
    if (isMassiveGraph.value && s < 0.5) return true
    return false
  })

  // LOD (Level of Detail) mode - render nodes as circles when many visible in viewport
  // Also activates when user manually toggles bubble mode
  const isLODMode = computed(() => forceLODMode.value || visibleNodes.value.length > LOD_THRESHOLD)

  // Toggle bubble mode manually
  function toggleBubbleMode() {
    forceLODMode.value = !forceLODMode.value
  }

  // Node degree (edge count) for LOD circle sizing
  const nodeDegree = computed(() => {
    const degree: Record<string, number> = {}
    for (const node of filteredNodes.value) {
      degree[node.id] = 0
    }
    for (const edge of filteredEdges.value) {
      if (degree[edge.source_node_id] !== undefined) degree[edge.source_node_id]++
      if (degree[edge.target_node_id] !== undefined) degree[edge.target_node_id]++
    }
    return degree
  })

  // Calculate LOD circle radius based on degree (min 8px, max 40px)
  function getLODRadius(nodeId: string): number {
    const deg = nodeDegree.value[nodeId] || 0
    // Log scale for better distribution: radius = 8 + log2(degree + 1) * 6
    return Math.min(40, 8 + Math.log2(deg + 1) * 6)
  }

  return {
    isLargeGraph,
    isHugeGraph,
    isMassiveGraph,
    isSemanticZoomCollapsed,
    isLODMode,
    isBubbleModeForced: computed(() => forceLODMode.value),
    nodeDegree,
    getLODRadius,
    toggleBubbleMode,
  }
}
