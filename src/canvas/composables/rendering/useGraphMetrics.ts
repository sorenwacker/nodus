/**
 * Graph metrics composable
 *
 * Computes graph size thresholds, LOD mode, and node degree for visualization optimization
 */

import { computed, ref, watch, type Ref, type ComputedRef } from 'vue'
import { storeToRefs } from 'pinia'
import type { Node, Edge } from '../../../types'
import { useDisplayStore } from '../../../stores/display'
import { canvasStorage } from '../../../lib/storage'

export interface UseGraphMetricsContext {
  displayNodes: ComputedRef<Node[]>
  visibleNodes: ComputedRef<Node[]>
  filteredNodes: ComputedRef<Node[]> | Ref<Node[]>
  filteredEdges: ComputedRef<Edge[]> | Ref<Edge[]>
  neighborhoodMode: Ref<boolean>
  scale: Ref<number>
  workspaceId: ComputedRef<string | null>
}

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

export function useGraphMetrics(ctx: UseGraphMetricsContext): UseGraphMetricsReturn {
  const {
    displayNodes,
    visibleNodes,
    filteredNodes,
    filteredEdges,
    neighborhoodMode,
    scale,
    workspaceId,
  } = ctx

  // Get reactive refs from display store
  const displayStore = useDisplayStore()
  const { lodThreshold, semanticZoomThreshold } = storeToRefs(displayStore)

  // Persistent LOD mode override (user can manually toggle bubble mode) - per workspace
  const forceLODMode = ref(canvasStorage.getBubbleMode(workspaceId.value || undefined))

  // Update bubble mode when workspace changes
  watch(workspaceId, (newId) => {
    forceLODMode.value = canvasStorage.getBubbleMode(newId || undefined)
  })

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
  // Triggers at configured threshold for any graph, or +20% for massive graphs
  const isSemanticZoomCollapsed = computed(() => {
    const s = scale.value
    const threshold = semanticZoomThreshold.value
    // Always collapse below threshold
    if (s < threshold) return true
    // Collapse massive graphs below threshold + 20%
    if (isMassiveGraph.value && s < threshold + 0.2) return true
    return false
  })

  // Hide text completely when zoomed out below 15% - text is unreadable at this scale
  const isTextHidden = computed(() => scale.value < 0.15)

  // LOD (Level of Detail) mode - render nodes as circles when many visible in viewport
  // Also activates when user manually toggles bubble mode
  const isLODMode = computed(() => forceLODMode.value || visibleNodes.value.length > lodThreshold.value)

  // Toggle bubble mode manually
  function toggleBubbleMode() {
    forceLODMode.value = !forceLODMode.value
    canvasStorage.setBubbleMode(forceLODMode.value, workspaceId.value || undefined)
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
    isTextHidden,
    isLODMode,
    isBubbleModeForced: computed(() => forceLODMode.value),
    nodeDegree,
    getLODRadius,
    toggleBubbleMode,
  }
}
