/**
 * Edge visibility composable
 *
 * Filters edges for viewport visibility and pre-computes rendering properties
 */

import { computed, ref, type Ref, type ComputedRef } from 'vue'
import { storeToRefs } from 'pinia'
import type { EdgeLine } from './useEdgeRouting'
import { useDisplayStore } from '../../../stores/display'

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
  totalEdgeCount: ComputedRef<number> // Total edges in store (before any filtering)
  visibleNodeIds: ComputedRef<Set<string>>
  hoveredNodeId: Ref<string | null>
  selectedNodeIds: Ref<string[]> | ComputedRef<string[]>
  selectedEdge: Ref<string | null>
  highlightedEdgeIds: ComputedRef<Set<string>>
  highlightAllEdges?: Ref<boolean>
  edgeHideThreshold?: Ref<number> // User setting: hide all edges when total count > this (0 = disabled)
  hideWikilinkEdges?: Ref<boolean> // User setting: hide edges auto-generated from [[links]]
  hideStorylineEdges?: Ref<boolean> // User setting: hide edges that connect storyline nodes
  edgeStrokeWidth: ComputedRef<number>
  highlightColor: ComputedRef<string>
  selectedColor: ComputedRef<string>
  getEdgeColor: (edge: { link_type: string; color?: string | null }) => string
  getEdgeHighlightColor: (colorTheme: string | null) => string
  getNode: (id: string) => { color_theme?: string | null } | undefined
}

/** Edge geometry with its colour resolved, and nothing about what is hovered. */
export interface CanvasEdge {
  id: string
  x1: number
  y1: number
  x2: number
  y2: number
  color: string
}

export interface UseEdgeVisibilityReturn {
  visibleEdgeLines: ComputedRef<VisibleEdgeLine[]>
  canvasEdges: ComputedRef<CanvasEdge[]>
}

// Threshold for filtering edges by viewport visibility
const EDGE_VIEWPORT_FILTER_THRESHOLD = 500

/**
 * A marker id for a colour, safe to use in an `id` and in `url(#...)`.
 *
 * Stripping only `#` assumed hex. An rgba colour produced ids such as
 * `arrow-rgba(239, 68, 68, 0.28)`, whose spaces, commas and parentheses make
 * both the id and the fragment reference invalid, so arrowheads vanished while
 * hovering a colour-tinted node.
 */
export function arrowMarkerIdFor(color: string): string {
  return `arrow-${color.replace(/[^a-zA-Z0-9]/g, '')}`
}

export function useEdgeVisibility(ctx: UseEdgeVisibilityContext): UseEdgeVisibilityReturn {
  const {
    edgeLines,
    totalEdgeCount,
    visibleNodeIds,
    hoveredNodeId,
    selectedNodeIds,
    selectedEdge,
    highlightedEdgeIds,
    highlightAllEdges = ref(false), // Default to false if not provided
    edgeHideThreshold = ref(0), // User setting: 0 = disabled (show all)
    hideWikilinkEdges = ref(false), // User setting: hide [[wikilink]] edges
    hideStorylineEdges = ref(false), // User setting: hide storyline edges
    edgeStrokeWidth,
    highlightColor,
    selectedColor,
    getEdgeColor,
    getEdgeHighlightColor,
    getNode,
  } = ctx

  // Get reactive refs from display store
  const displayStore = useDisplayStore()
  const { edgeHoverThreshold: displayEdgeThreshold } = storeToRefs(displayStore)

  const visibleEdgeLines = computed((): VisibleEdgeLine[] => {
    // Check user's edge hide threshold (from canvas settings)
    // 0 = disabled (show all edges), any other value = hide when count exceeds it
    const hideThreshold = edgeHideThreshold?.value ?? 0
    const totalEdges = totalEdgeCount.value

    // If user set a hide threshold > 0 and edge count exceeds it, hide all
    if (hideThreshold > 0 && totalEdges > hideThreshold) {
      return []
    }

    let edges = edgeLines.value
    const visIds = visibleNodeIds.value
    const hovered = hoveredNodeId.value
    const selectedNodes = Array.isArray(selectedNodeIds.value) ? selectedNodeIds.value : selectedNodeIds.value
    // O(1) membership for the per-edge loops below (this computed is hover-hot,
    // so an Array.includes scan per edge is O(edges x selected))
    const selectedSet = new Set(selectedNodes)

    // Filter out wikilink edges if user setting is enabled
    if (hideWikilinkEdges.value) {
      edges = edges.filter(e => e.link_type !== 'wikilink')
    }

    // Filter out storyline edges if user setting is enabled
    if (hideStorylineEdges.value) {
      edges = edges.filter(e => !e.storyline_id)
    }

    // For small graphs, show all edges regardless of viewport visibility
    // Only filter by viewport for larger graphs to improve performance
    // Also skip filtering if visibleNodeIds is empty (viewport not ready yet)
    if (edges.length > EDGE_VIEWPORT_FILTER_THRESHOLD && visIds.size > 0) {
      // Filter to edges that should be rendered:
      // Show edge if AT LEAST ONE endpoint is visible (so you can see connections going off-screen)
      // Hide edge only if BOTH endpoints are off-screen
      edges = edges.filter(e => {
        return visIds.has(e.source_node_id) || visIds.has(e.target_node_id)
      })
    }

    // Build neighbor set for 2-hop edge display
    // Neighbors are nodes directly connected to hovered/selected nodes
    const neighborIds = new Set<string>()
    if (hovered || selectedNodes.length > 0) {
      for (const e of edges) {
        if (e.source_node_id === hovered || selectedSet.has(e.source_node_id)) {
          neighborIds.add(e.target_node_id)
        }
        if (e.target_node_id === hovered || selectedSet.has(e.target_node_id)) {
          neighborIds.add(e.source_node_id)
        }
      }
    }

    // Above its own threshold, show only the edges around what is hovered or
    // selected, plus one hop for context.
    //
    // This was gated on `hideThreshold === 0`, an unrelated setting that
    // defaults to 0 - so the whole path could never run in a default install,
    // and a user who set "hide edges above 5000" silently also turned on
    // hover-only rendering above 1500, which that setting does not describe
    // (PRODUCT_DESIGN.md > Showing edges only around the focus)
    if (edges.length > displayEdgeThreshold.value) {
      if (hovered || selectedNodes.length > 0) {
        edges = edges.filter(e => {
          // Direct edges to hovered/selected nodes
          const isDirect = e.source_node_id === hovered || e.target_node_id === hovered ||
            selectedSet.has(e.source_node_id) || selectedSet.has(e.target_node_id)
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
    const allHighlighted = highlightAllEdges?.value ?? false

    return edges.map(e => {
      const isHighlighted = allHighlighted || highlighted.has(e.id)
      const isSelected = selected === e.id

      // Determine if this is a direct edge or a 2nd-hop neighbor edge
      const isDirect = e.source_node_id === hovered || e.target_node_id === hovered ||
        selectedSet.has(e.source_node_id) || selectedSet.has(e.target_node_id)
      const isNeighborEdge = !isDirect && (neighborIds.has(e.source_node_id) || neighborIds.has(e.target_node_id))

      // Opacity: highlighted edges are full, others are dimmed by default
      // Neighbor edges (2nd hop) are even more transparent
      // When all edges are highlighted, show full opacity
      const opacity = isHighlighted ? 1.0 : (isNeighborEdge ? 0.2 : 0.3)

      // Use getEdgeColor for theme-aware color remapping
      const color = getEdgeColor({ link_type: e.link_type || '', color: e.color })
      // Simple stroke width: base for normal, slightly thicker for selected/highlighted
      const renderStrokeWidth = isSelected || isHighlighted ? baseStrokeWidth * 1.3 : baseStrokeWidth

      // Get highlight color based on whether connected node is selected or just hovered
      // When "highlight all edges" is on, keep original color - don't change to highlight color
      let edgeHighlightColor = color // Default to edge's own color
      if (isHighlighted && !allHighlighted) {
        // Only change color when highlighting due to hover/selection, not "highlight all"
        const isConnectedToSelected =
          selectedSet.has(e.source_node_id) ||
          selectedSet.has(e.target_node_id)

        if (isConnectedToSelected) {
          // Use selected color (matches selected node border)
          edgeHighlightColor = selectedColor.value
        } else {
          // Just hovered - use node's color or default highlight
          const hoveredNode = hoveredNodeId.value
          if (hoveredNode) {
            const node = getNode(hoveredNode)
            edgeHighlightColor = getEdgeHighlightColor(node?.color_theme || null)
          } else {
            edgeHighlightColor = highlightColor.value
          }
        }
      } else if (isHighlighted && allHighlighted) {
        // "Highlight all edges" mode - keep original color
        edgeHighlightColor = color
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
        arrowMarkerId: arrowMarkerIdFor(isHighlighted ? edgeHighlightColor : color),
      }
    })
    // Deliberately unsorted. This used to end with
    //   .sort((a, b) => (a.isHighlighted ? 1 : 0) - (b.isHighlighted ? 1 : 0))
    // to paint highlighted edges last. The array feeds a keyed v-for over every
    // edge, so re-sorting on each hover made Vue reorder hundreds of SVG
    // elements - an insertBefore per move, each invalidating layout - and
    // panning re-triggers it every frame as nodes pass under the pointer.
    // CanvasEdgesSVG now draws the highlighted ones in a second group instead:
    // SVG paints in document order, so the z-order is identical and no element
    // ever moves (PRODUCT_DESIGN.md > Showing edges only around the focus).
  })

  /**
   * The same edges for the canvas renderer, carrying geometry and colour only.
   *
   * visibleEdgeLines bakes hover and selection into every edge, so pointing at
   * one node rebuilt all ~1,200 objects and invalidated the whole render even
   * though not a single edge had moved. Highlighting is a painting question,
   * not a data one: this list changes only when the edges or the node layout
   * do, and the renderer reads the highlighted set at draw time. A hover then
   * costs one repaint and no allocation
   * (PRODUCT_DESIGN.md > Showing edges only around the focus).
   */
  const canvasEdges = computed((): CanvasEdge[] =>
    edgeLines.value.map(e => ({
      id: e.id,
      x1: e.x1,
      y1: e.y1,
      x2: e.x2,
      y2: e.y2,
      color: getEdgeColor({ link_type: e.link_type || '', color: e.color }),
    }))
  )

  return {
    visibleEdgeLines,
    canvasEdges,
  }
}
