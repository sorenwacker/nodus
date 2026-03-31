/**
 * Node visibility composable
 * Handles viewport culling, LOD mode, and graph size analysis
 */
import { ref, computed, type Ref, type ComputedRef } from 'vue'
import { storeToRefs } from 'pinia'
import { NODE_DEFAULTS } from '../../constants'
import { useDisplayStore } from '../../../stores/display'

export interface VisibilityNode {
  id: string
  canvas_x: number
  canvas_y: number
  width?: number
  height?: number
}

export interface UseNodeVisibilityOptions {
  /** Reactive list of nodes to check visibility for */
  nodes: ComputedRef<VisibilityNode[]>
  /** Reactive list of edges */
  edges: ComputedRef<{ source_node_id: string; target_node_id: string }[]>
  /** View state */
  viewState: {
    scale: Ref<number>
    offsetX: Ref<number>
    offsetY: Ref<number>
  }
  /** Get viewport dimensions */
  getViewportSize: () => { width: number; height: number } | null
}

/** Thresholds for graph size classification - increased for modern hardware */
const LARGE_GRAPH_NODES = 500
const LARGE_GRAPH_EDGES = 1500
const HUGE_GRAPH_NODES = 1000
const MASSIVE_GRAPH_NODES = 800
const MASSIVE_GRAPH_EDGES = 2000

export function useNodeVisibility(options: UseNodeVisibilityOptions) {
  const { nodes, edges, viewState, getViewportSize } = options

  // Get reactive refs from display store
  const displayStore = useDisplayStore()
  const { lodThreshold, semanticZoomThreshold } = storeToRefs(displayStore)

  // Track viewport size for culling
  const viewportWidth = ref(window.innerWidth)
  const viewportHeight = ref(window.innerHeight)

  // Update viewport size
  function updateViewportSize() {
    const size = getViewportSize()
    if (size) {
      viewportWidth.value = size.width
      viewportHeight.value = size.height
    }
  }

  // Only render nodes visible in viewport (with margin for smooth scrolling)
  const visibleNodes = computed(() => {
    const s = viewState.scale.value
    const ox = viewState.offsetX.value
    const oy = viewState.offsetY.value

    // Scale margin inversely with zoom to maintain consistent screen-space buffer
    // At zoom 1.0: 500px margin. At zoom 0.2: 2500px margin in canvas coords
    const baseMargin = 500
    const margin = baseMargin / Math.max(s, 0.1)

    // Viewport bounds in canvas coordinates
    const viewLeft = -ox / s - margin
    const viewTop = -oy / s - margin
    const viewRight = (viewportWidth.value - ox) / s + margin
    const viewBottom = (viewportHeight.value - oy) / s + margin

    return nodes.value.filter((node) => {
      const nodeRight = node.canvas_x + (node.width || NODE_DEFAULTS.WIDTH)
      const nodeBottom = node.canvas_y + (node.height || NODE_DEFAULTS.HEIGHT)
      // Check if node intersects viewport
      return (
        nodeRight >= viewLeft &&
        node.canvas_x <= viewRight &&
        nodeBottom >= viewTop &&
        node.canvas_y <= viewBottom
      )
    })
  })

  // Set of visible node IDs for quick lookup
  const visibleNodeIds = computed(() => new Set(visibleNodes.value.map((n) => n.id)))

  // Graph size thresholds
  const isLargeGraph = computed(
    () => nodes.value.length > LARGE_GRAPH_NODES || edges.value.length > LARGE_GRAPH_EDGES
  )

  const isHugeGraph = computed(() => nodes.value.length > HUGE_GRAPH_NODES)

  const isMassiveGraph = computed(
    () => nodes.value.length > MASSIVE_GRAPH_NODES || edges.value.length > MASSIVE_GRAPH_EDGES
  )

  // Semantic zoom collapse - show title only when zoomed out
  // Triggers at configured threshold (default 50%) for any graph, or +10% for massive graphs
  const isSemanticZoomCollapsed = computed(() => {
    const scale = viewState.scale.value
    const threshold = semanticZoomThreshold.value
    // Always collapse below threshold
    if (scale < threshold) return true
    // Collapse massive graphs below threshold + 10%
    if (isMassiveGraph.value && scale < threshold + 0.1) return true
    return false
  })

  // LOD (Level of Detail) mode - render nodes as circles when many visible in viewport
  const isLODMode = computed(() => visibleNodes.value.length > lodThreshold.value)

  // Node degree (edge count) for LOD circle sizing
  const nodeDegree = computed(() => {
    const degree: Record<string, number> = {}
    for (const node of nodes.value) {
      degree[node.id] = 0
    }
    for (const edge of edges.value) {
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

  // Check if a node is visible in the viewport
  function isNodeVisible(nodeId: string): boolean {
    return visibleNodeIds.value.has(nodeId)
  }

  return {
    // State
    viewportWidth,
    viewportHeight,

    // Computed
    visibleNodes,
    visibleNodeIds,
    isLargeGraph,
    isHugeGraph,
    isMassiveGraph,
    isSemanticZoomCollapsed,
    isLODMode,
    nodeDegree,

    // Methods
    updateViewportSize,
    getLODRadius,
    isNodeVisible,
  }
}

export type UseNodeVisibilityReturn = ReturnType<typeof useNodeVisibility>
