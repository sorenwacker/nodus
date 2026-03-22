/**
 * Graph metrics composable
 *
 * Computes graph size thresholds, LOD mode, and node degree for visualization optimization
 */

import { computed, type Ref, type ComputedRef } from 'vue'
import type { Node, Edge } from '../../types'

export interface UseGraphMetricsContext {
  displayNodes: ComputedRef<Node[]>
  visibleNodes: ComputedRef<Node[]>
  filteredNodes: ComputedRef<Node[]> | Ref<Node[]>
  filteredEdges: ComputedRef<Edge[]> | Ref<Edge[]>
  neighborhoodMode: Ref<boolean>
  scale: Ref<number>
}

export interface UseGraphMetricsReturn {
  isLargeGraph: ComputedRef<boolean>
  isHugeGraph: ComputedRef<boolean>
  isMassiveGraph: ComputedRef<boolean>
  isSemanticZoomCollapsed: ComputedRef<boolean>
  isLODMode: ComputedRef<boolean>
  nodeDegree: ComputedRef<Record<string, number>>
  getLODRadius: (nodeId: string) => number
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
  const isLargeGraph = computed(() =>
    !neighborhoodMode.value && (displayNodes.value.length > 200 || filteredEdges.value.length > 500)
  )

  const isHugeGraph = computed(() =>
    !neighborhoodMode.value && displayNodes.value.length > 350
  )

  const isMassiveGraph = computed(() =>
    !neighborhoodMode.value && (displayNodes.value.length > 300 || filteredEdges.value.length > 800)
  )

  // Semantic zoom collapse - hide content for massive graphs when zoomed out
  const isSemanticZoomCollapsed = computed(() =>
    isMassiveGraph.value && scale.value < 0.6
  )

  // LOD (Level of Detail) mode - render nodes as circles when many visible in viewport
  const isLODMode = computed(() => visibleNodes.value.length > LOD_THRESHOLD)

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
    nodeDegree,
    getLODRadius,
  }
}
