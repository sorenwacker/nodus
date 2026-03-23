/**
 * Edge visibility composable
 *
 * Filters edges for viewport visibility and pre-computes rendering properties
 */

import { computed, type Ref, type ComputedRef } from 'vue'
import type { EdgeLine } from './useEdgeRouting'

export interface VisibleEdgeLine extends EdgeLine {
  isHighlighted: boolean
  isSelected: boolean
  isNeighborEdge: boolean
  opacity: number
  edgeHighlightColor: string
  renderStrokeWidth: number
  glowStrokeWidth: number
  arrowMarkerId: string
}

export interface UseEdgeVisibilityContext {
  edgeLines: ComputedRef<EdgeLine[]>
  visibleNodeIds: ComputedRef<Set<string>>
  hoveredNodeId: Ref<string | null>
  selectedNodeIds: Ref<string[]> | ComputedRef<string[]>
  selectedEdge: Ref<string | null>
  highlightedEdgeIds: ComputedRef<Set<string>>
  edgeStrokeWidth: ComputedRef<number>
  highlightColor: ComputedRef<string>
  selectedColor: ComputedRef<string>
  defaultEdgeColor: ComputedRef<string>
  getEdgeHighlightColor: (colorTheme: string | null) => string
  getNode: (id: string) => { color_theme?: string | null } | undefined
}

export interface UseEdgeVisibilityReturn {
  visibleEdgeLines: ComputedRef<VisibleEdgeLine[]>
}

// Threshold for "edges on hover only" mode (based on visible edges, not total)
const EDGE_HOVER_ONLY_THRESHOLD = 500

// Threshold for filtering edges by viewport visibility
const EDGE_VIEWPORT_FILTER_THRESHOLD = 200

export function useEdgeVisibility(ctx: UseEdgeVisibilityContext): UseEdgeVisibilityReturn {
  const {
    edgeLines,
    visibleNodeIds,
    hoveredNodeId,
    selectedNodeIds,
    selectedEdge,
    highlightedEdgeIds,
    edgeStrokeWidth,
    highlightColor,
    selectedColor,
    defaultEdgeColor,
    getEdgeHighlightColor,
    getNode,
  } = ctx

  const visibleEdgeLines = computed((): VisibleEdgeLine[] => {
    let edges = edgeLines.value
    const visIds = visibleNodeIds.value
    const hovered = hoveredNodeId.value
    const selectedNodes = Array.isArray(selectedNodeIds.value) ? selectedNodeIds.value : selectedNodeIds.value

    // For small graphs, show all edges regardless of viewport visibility
    // Only filter by viewport for larger graphs to improve performance
    // Also skip filtering if visibleNodeIds is empty (viewport not ready yet)
    if (edges.length > EDGE_VIEWPORT_FILTER_THRESHOLD && visIds.size > 0) {
      // Filter to edges that should be rendered:
      // 1. Edges connected to hovered/selected nodes (always show, even if other endpoint is off-screen)
      // 2. Edges where BOTH endpoints are visible
      edges = edges.filter(e => {
        const connectedToActive = hovered === e.source_node_id || hovered === e.target_node_id ||
          selectedNodes.includes(e.source_node_id) || selectedNodes.includes(e.target_node_id)
        if (connectedToActive) return true
        return visIds.has(e.source_node_id) && visIds.has(e.target_node_id)
      })
    }

    // Build neighbor set for 2-hop edge display
    // Neighbors are nodes directly connected to hovered/selected nodes
    const neighborIds = new Set<string>()
    if (hovered || selectedNodes.length > 0) {
      for (const e of edges) {
        if (e.source_node_id === hovered || selectedNodes.includes(e.source_node_id)) {
          neighborIds.add(e.target_node_id)
        }
        if (e.target_node_id === hovered || selectedNodes.includes(e.target_node_id)) {
          neighborIds.add(e.source_node_id)
        }
      }
    }

    // For very large visible edge counts (500+), only show edges on hover/select
    // Also include neighbor's edges (2nd hop) for context
    if (edges.length > EDGE_HOVER_ONLY_THRESHOLD) {
      if (hovered || selectedNodes.length > 0) {
        edges = edges.filter(e => {
          // Direct edges to hovered/selected nodes
          const isDirect = e.source_node_id === hovered || e.target_node_id === hovered ||
            selectedNodes.includes(e.source_node_id) || selectedNodes.includes(e.target_node_id)
          if (isDirect) return true
          // 2nd hop: edges where at least one endpoint is a neighbor
          return neighborIds.has(e.source_node_id) || neighborIds.has(e.target_node_id)
        })
      } else {
        edges = []
      }
    }

    // Pre-compute rendering properties to avoid repeated function calls in template
    const highlighted = highlightedEdgeIds.value
    const selected = selectedEdge.value
    const baseStrokeWidth = edgeStrokeWidth.value

    return edges.map(e => {
      const isHighlighted = highlighted.has(e.id)
      const isSelected = selected === e.id

      // Determine if this is a direct edge or a 2nd-hop neighbor edge
      const isDirect = e.source_node_id === hovered || e.target_node_id === hovered ||
        selectedNodes.includes(e.source_node_id) || selectedNodes.includes(e.target_node_id)
      const isNeighborEdge = !isDirect && (neighborIds.has(e.source_node_id) || neighborIds.has(e.target_node_id))

      // Opacity: direct edges are full, neighbor edges are transparent
      const opacity = isNeighborEdge ? 0.25 : 1.0

      // Use explicit color field first, then link_type as fallback, then default
      const color = (e.color && e.color.startsWith('#')) ? e.color
        : (e.link_type?.startsWith('#') ? e.link_type : defaultEdgeColor.value)
      // Simple stroke width: base for normal, slightly thicker for selected/highlighted
      const renderStrokeWidth = isSelected || isHighlighted ? baseStrokeWidth * 1.3 : baseStrokeWidth

      // Get highlight color based on whether connected node is selected or just hovered
      let edgeHighlightColor = highlightColor.value
      if (isHighlighted) {
        // Check if connected to a selected node (not just hovered)
        const isConnectedToSelected =
          selectedNodes.includes(e.source_node_id) ||
          selectedNodes.includes(e.target_node_id)

        if (isConnectedToSelected) {
          // Use selected color (matches selected node border)
          edgeHighlightColor = selectedColor.value
        } else {
          // Just hovered - use node's color or default highlight
          const hoveredNode = hoveredNodeId.value
          if (hoveredNode) {
            const node = getNode(hoveredNode)
            edgeHighlightColor = getEdgeHighlightColor(node?.color_theme || null)
          }
        }
      }

      return {
        ...e,
        isHighlighted,
        isSelected,
        isNeighborEdge,
        opacity,
        color,
        edgeHighlightColor,
        renderStrokeWidth,
        glowStrokeWidth: renderStrokeWidth * 4,
        arrowMarkerId: isHighlighted ? `arrow-${edgeHighlightColor.replace('#', '')}` : `arrow-${color.replace('#', '')}`,
      }
    })
    // Sort so highlighted edges render last (on top in SVG)
    .sort((a, b) => (a.isHighlighted ? 1 : 0) - (b.isHighlighted ? 1 : 0))
  })

  return {
    visibleEdgeLines,
  }
}
