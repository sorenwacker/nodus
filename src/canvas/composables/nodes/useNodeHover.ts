/**
 * Node hover composable
 *
 * Handles hover state, tooltips, and active/highlighted node tracking
 */

import { ref, computed, type Ref, type ComputedRef } from 'vue'
import type { Node, Edge } from '../../../types'

export interface UseNodeHoverContext {
  scale: Ref<number>
  isLODMode: ComputedRef<boolean>
  selectedNodeIds: Ref<string[]> | ComputedRef<string[]>
  filteredEdges: Ref<Edge[]> | ComputedRef<Edge[]>
  getNode: (id: string) => Node | undefined
  hoverTooltipEnabled?: Ref<boolean>
}

export interface EdgeStats {
  incoming: number
  outgoing: number
  bidirectional: number
  total: number
}

export interface UseNodeHoverReturn {
  hoveredNodeId: Ref<string | null>
  hoverMousePos: Ref<{ x: number; y: number }>
  showHoverTooltip: ComputedRef<boolean>
  hoveredNode: ComputedRef<Node | null>
  tooltipContent: ComputedRef<string>
  hoveredNodeEdgeStats: ComputedRef<EdgeStats | null>
  activeNodeIds: ComputedRef<Set<string>>
  highlightedEdgeIds: ComputedRef<Set<string>>
  highlightedNodeIds: ComputedRef<Set<string>>
  onNodePointerEnter: (e: PointerEvent, nodeId: string) => void
  onNodePointerMove: (e: PointerEvent) => void
  onNodePointerLeave: () => void
}

export function useNodeHover(ctx: UseNodeHoverContext): UseNodeHoverReturn {
  const { scale, isLODMode, selectedNodeIds, filteredEdges, getNode, hoverTooltipEnabled } = ctx

  const hoveredNodeId = ref<string | null>(null)
  const hoverMousePos = ref({ x: 0, y: 0 })

  // Tooltip for zoomed-out hover - shows node info when scale is low or in LOD mode
  // Can be disabled via settings
  const showHoverTooltip = computed(() => {
    if (hoverTooltipEnabled && !hoverTooltipEnabled.value) return false
    return !!hoveredNodeId.value && (scale.value < 0.5 || isLODMode.value)
  })

  const hoveredNode = computed(() => {
    if (!hoveredNodeId.value) return null
    return getNode(hoveredNodeId.value) || null
  })

  // Strip markdown for tooltip preview
  const tooltipContent = computed(() => {
    const content = hoveredNode.value?.markdown_content
    if (!content) return ''
    return content
      .replace(/!\[.*?\]\(.*?\)/g, '[image]')  // Replace images with [image]
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // Links -> just text
      .replace(/#{1,6}\s*/g, '')               // Remove headings
      .replace(/[*_]{1,2}([^*_]+)[*_]{1,2}/g, '$1') // Bold/italic -> plain
      .replace(/`{1,3}[^`]*`{1,3}/g, '')       // Remove code blocks
      .replace(/^\s*[-*+]\s+/gm, '- ')         // Normalize lists
      .replace(/\n{2,}/g, '\n')                // Collapse multiple newlines
      .trim()
      .slice(0, 200)
  })

  // Edge statistics for hovered node
  const hoveredNodeEdgeStats = computed((): EdgeStats | null => {
    const nodeId = hoveredNodeId.value
    if (!nodeId) return null

    const edges = filteredEdges.value
    let incoming = 0
    let outgoing = 0
    const connectedNodes = new Map<string, 'in' | 'out' | 'both'>()

    for (const edge of edges) {
      if (edge.target_node_id === nodeId) {
        // Incoming edge
        incoming++
        const existing = connectedNodes.get(edge.source_node_id)
        connectedNodes.set(edge.source_node_id, existing === 'out' ? 'both' : 'in')
      }
      if (edge.source_node_id === nodeId) {
        // Outgoing edge
        outgoing++
        const existing = connectedNodes.get(edge.target_node_id)
        connectedNodes.set(edge.target_node_id, existing === 'in' ? 'both' : 'out')
      }
    }

    // Count bidirectional connections
    let bidirectional = 0
    for (const dir of connectedNodes.values()) {
      if (dir === 'both') bidirectional++
    }

    return {
      incoming,
      outgoing,
      bidirectional,
      total: incoming + outgoing,
    }
  })

  // Cached active node IDs for highlight detection (avoids recreating Set on every edge)
  const activeNodeIds = computed(() => {
    const ids = new Set<string>()
    if (hoveredNodeId.value) ids.add(hoveredNodeId.value)
    for (const id of selectedNodeIds.value) ids.add(id)
    return ids
  })

  // Pre-computed set of highlighted edge IDs for O(1) lookup in template
  const highlightedEdgeIds = computed(() => {
    const ids = new Set<string>()
    const active = activeNodeIds.value
    if (active.size === 0) return ids
    for (const edge of filteredEdges.value) {
      if (active.has(edge.source_node_id) || active.has(edge.target_node_id)) {
        ids.add(edge.id)
      }
    }
    return ids
  })

  // Pre-computed set of neighbor node IDs (nodes connected to selected/hovered)
  const highlightedNodeIds = computed(() => {
    const ids = new Set<string>()
    const active = activeNodeIds.value
    if (active.size === 0) return ids
    const edges = filteredEdges.value
    for (const edge of edges) {
      if (active.has(edge.source_node_id)) {
        ids.add(edge.target_node_id)
      }
      if (active.has(edge.target_node_id)) {
        ids.add(edge.source_node_id)
      }
    }
    return ids
  })

  // Event handlers
  function onNodePointerEnter(e: PointerEvent, nodeId: string) {
    hoveredNodeId.value = nodeId
    hoverMousePos.value = { x: e.clientX, y: e.clientY }
  }

  function onNodePointerMove(e: PointerEvent) {
    hoverMousePos.value = { x: e.clientX, y: e.clientY }
  }

  function onNodePointerLeave() {
    hoveredNodeId.value = null
  }

  return {
    hoveredNodeId,
    hoverMousePos,
    showHoverTooltip,
    hoveredNode,
    tooltipContent,
    hoveredNodeEdgeStats,
    activeNodeIds,
    highlightedEdgeIds,
    highlightedNodeIds,
    onNodePointerEnter,
    onNodePointerMove,
    onNodePointerLeave,
  }
}
