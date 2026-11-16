/**
 * Edge visibility composable
 *
 * Filters edges for viewport visibility and pre-computes rendering properties
 */

import { computed, ref, type Ref, type ComputedRef, watch } from 'vue'
import { storeToRefs } from 'pinia'
import type { EdgeLine } from './useEdgeRouting'
import { useDisplayStore } from '../../../stores/display'
import { HIGHLIGHT_WIDTH_FACTOR, lineUnderArrowHead } from '../../routing/arrowHead'

/**
 * The path to stroke for an edge: the routed path, ending under the arrowhead
 * where the edge carries one (PRODUCT_DESIGN.md > The line under an arrowhead).
 * An undirected, bidirectional or short edge has no head and keeps its full path.
 */
export function strokedPath(edge: Pick<EdgeLine, 'path' | 'isBidirectional' | 'isShortEdge'>, strokeWidth: number): string {
  return edge.isBidirectional || edge.isShortEdge ? edge.path : lineUnderArrowHead(edge.path, strokeWidth)
}

export interface VisibleEdgeLine extends EdgeLine {
  /** The path to stroke: `path`, ending under the arrowhead where the edge carries one */
  linePath: string
  isHighlighted: boolean
  isSelected: boolean
  isNeighborEdge: boolean
  /**
   * Lit by the hover or the selection, so drawn again in the focus layer on
   * top of its plain self (PRODUCT_DESIGN.md > Hovering a card)
   */
  inFocus: boolean
  /** The opacity the edge is drawn with: 1 while lit */
  opacity: number
  /** The opacity of the plain edge in the base layer, which no hover changes */
  baseOpacity: number
  edgeHighlightColor: string
  renderStrokeWidth: number
  glowStrokeWidth: number
  arrowMarkerId: string
}

export interface UseEdgeVisibilityContext {
  edgeLines: ComputedRef<EdgeLine[]>
  totalEdgeCount: ComputedRef<number> // Total edges in store (before any filtering)
  visibleNodeIds: ComputedRef<Set<string>>
  /** True while a viewport gesture is live: the culled edge set is held for its duration */
  gestureActive?: Ref<boolean>
  hoveredNodeId: Ref<string | null>
  selectedNodeIds: Ref<string[]> | ComputedRef<string[]>
  selectedEdge: Ref<string | null>
  highlightedEdgeIds: ComputedRef<Set<string>>
  highlightAllEdges?: Ref<boolean>
  /** Colour each edge without a colour of its own by the card it leaves */
  colorEdgesBySource?: Ref<boolean>
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
  source: string
  target: string
  x1: number
  y1: number
  x2: number
  y2: number
  color: string
}

/** Edges a threshold keeps off the canvas, so the canvas can say so */
export interface HiddenEdges {
  count: number
  threshold: number
  /** 'hover': shown only around a hovered or selected note; 'limit': hidden above a total */
  reason: 'hover' | 'limit'
}

export interface UseEdgeVisibilityReturn {
  visibleEdgeLines: ComputedRef<VisibleEdgeLine[]>
  /** Set while a threshold hides every edge (PRODUCT_DESIGN.md > Showing edges only around the focus) */
  hiddenEdges: ComputedRef<HiddenEdges | null>
  canvasEdges: ComputedRef<CanvasEdge[]>
}

// Threshold for filtering edges by viewport visibility
const EDGE_VIEWPORT_FILTER_THRESHOLD = 500

/**
 * Colours for edges coloured by their source card (PRODUCT_DESIGN.md >
 * Colouring edges by source card): twelve hues apart enough to tell two
 * bundles apart, dark enough to read on a light canvas and light enough on
 * a dark one.
 */
export const SOURCE_EDGE_PALETTE = [
  '#2563eb', '#dc2626', '#16a34a', '#d97706', '#7c3aed', '#0891b2',
  '#db2777', '#65a30d', '#ea580c', '#0d9488', '#4f46e5', '#b45309',
]

/** Opacity of a resting edge when edges are coloured by source: hues need more ink than grey to tell apart */
export const SOURCE_COLORED_OPACITY = 0.6

/**
 * A palette colour per source card: the cards with the most outgoing edges
 * take the palette first, so the big bundles never share a colour while
 * there are colours left; ties and the rest go by id, so the assignment is
 * the same for the same graph.
 */
export function sourceEdgeColors(edges: { source_node_id: string }[]): Map<string, string> {
  const count = new Map<string, number>()
  for (const e of edges) count.set(e.source_node_id, (count.get(e.source_node_id) ?? 0) + 1)
  const sources = [...count.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
  return new Map(sources.map(([id], i) => [id, SOURCE_EDGE_PALETTE[i % SOURCE_EDGE_PALETTE.length]]))
}

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
    gestureActive,
    hoveredNodeId,
    selectedNodeIds,
    selectedEdge,
    highlightedEdgeIds,
    highlightAllEdges = ref(false), // Default to false if not provided
    colorEdgesBySource = ref(false),
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

  // The node set edges are culled by. Held while a gesture is live: an edge
  // entering the viewport mid-zoom is a change to the edge layer, and any
  // change to the layer repaints every path in it, so a zoom-out at 30% paid
  // a quarter second a frame for edges alone. The edges around what the zoom
  // uncovered arrive when it ends (PRODUCT_DESIGN.md > Zooming a canvas of cards)
  const cullingIds = ref<Set<string>>(visibleNodeIds.value)
  watch([visibleNodeIds, () => gestureActive?.value ?? false], ([ids, live]) => {
    if (!live) cullingIds.value = ids
  })

  // The edges the settings and the viewport let through, before the focus rule
  const candidateEdges = computed((): EdgeLine[] => {
    let edges = edgeLines.value
    const visIds = cullingIds.value

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

    return edges
  })

  const focusActive = () => {
    const selected = selectedNodeIds.value
    return !!hoveredNodeId.value || (Array.isArray(selected) && selected.length > 0)
  }

  const hiddenEdges = computed((): HiddenEdges | null => {
    const hideThreshold = edgeHideThreshold?.value ?? 0
    if (hideThreshold > 0 && totalEdgeCount.value > hideThreshold) {
      return { count: totalEdgeCount.value, threshold: hideThreshold, reason: 'limit' }
    }
    const count = candidateEdges.value.length
    if (count > displayEdgeThreshold.value && !focusActive()) {
      return { count, threshold: displayEdgeThreshold.value, reason: 'hover' }
    }
    return null
  })

  // The stroked path of every routed edge, keyed by edge. It depends on the
  // routing and the line width only, so a hover, which recomputes
  // visibleEdgeLines for every candidate edge, does not trim a thousand paths
  // again (PRODUCT_DESIGN.md > Hovering a card)
  const strokedPaths = computed((): Map<string, string> => {
    const width = edgeStrokeWidth.value
    const paths = new Map<string, string>()
    for (const e of edgeLines.value) paths.set(e.id, strokedPath(e, width))
    return paths
  })

  // Each source card's colour theme, resolved once per change of the edges or
  // the cards - never inside the per-hover pass below, where a lookup per edge
  // cost edges x cards reactive reads on every hover and zoom frame
  // (PRODUCT_DESIGN.md > Colouring edges by source card)
  const sourceThemes = computed(() => {
    const themes = new Map<string, string | null | undefined>()
    if (!colorEdgesBySource.value) return themes
    for (const e of edgeLines.value) {
      if (!themes.has(e.source_node_id)) themes.set(e.source_node_id, getNode(e.source_node_id)?.color_theme)
    }
    return themes
  })

  const visibleEdgeLines = computed((): VisibleEdgeLine[] => {
    // Check user's edge hide threshold (from canvas settings)
    // 0 = disabled (show all edges), any other value = hide when count exceeds it
    const hideThreshold = edgeHideThreshold?.value ?? 0
    const totalEdges = totalEdgeCount.value

    // If user set a hide threshold > 0 and edge count exceeds it, hide all
    if (hideThreshold > 0 && totalEdges > hideThreshold) {
      return []
    }

    let edges = candidateEdges.value
    const hovered = hoveredNodeId.value
    const selectedNodes = Array.isArray(selectedNodeIds.value) ? selectedNodeIds.value : selectedNodeIds.value
    // O(1) membership for the per-edge loops below (this computed is hover-hot,
    // so an Array.includes scan per edge is O(edges x selected))
    const selectedSet = new Set(selectedNodes)

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
    const bySource = colorEdgesBySource.value
    const sourceColors = bySource ? sourceEdgeColors(edges) : null
    const stroked = strokedPaths.value

    // The base layer's opacity: what every plain edge is drawn with, whatever
    // is hovered. Dimming around a focus is the base layer's own opacity
    // (CanvasEdgesSVG), not a per-edge value, so a hover rewrites no plain edge
    const baseOpacity = allHighlighted ? 1.0 : bySource ? SOURCE_COLORED_OPACITY : 0.3

    // The hovered card is the same for every edge, so it is looked up once per pass
    const hoveredForColor = hoveredNodeId.value
    const hoverHighlightColor = hoveredForColor
      ? getEdgeHighlightColor(getNode(hoveredForColor)?.color_theme || null)
      : highlightColor.value

    return edges.map(e => {
      const inFocus = highlighted.has(e.id) || selected === e.id
      const isHighlighted = allHighlighted || inFocus
      const isSelected = selected === e.id

      // Determine if this is a direct edge or a 2nd-hop neighbor edge
      const isDirect = e.source_node_id === hovered || e.target_node_id === hovered ||
        selectedSet.has(e.source_node_id) || selectedSet.has(e.target_node_id)
      const isNeighborEdge = !isDirect && (neighborIds.has(e.source_node_id) || neighborIds.has(e.target_node_id))

      // Opacity: highlighted edges are full, others are dimmed by default
      // Neighbor edges (2nd hop) are even more transparent
      // When all edges are highlighted, show full opacity
      const opacity = isHighlighted ? 1.0 : (isNeighborEdge ? 0.2 : bySource ? SOURCE_COLORED_OPACITY : 0.3)

      // Use getEdgeColor for theme-aware color remapping; by source, an edge
      // without a colour of its own takes its source card's colour or, for
      // an uncoloured card, the card's palette colour
      let color = getEdgeColor({ link_type: e.link_type || '', color: e.color })
      if (bySource && !e.color) {
        const sourceTheme = sourceThemes.value.get(e.source_node_id)
        color = sourceTheme ? getEdgeHighlightColor(sourceTheme) : sourceColors!.get(e.source_node_id)!
      }
      // Simple stroke width: base for normal, slightly thicker for selected/highlighted
      const renderStrokeWidth = isSelected || isHighlighted ? baseStrokeWidth * HIGHLIGHT_WIDTH_FACTOR : baseStrokeWidth

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
          edgeHighlightColor = hoverHighlightColor
        }
      } else if (isHighlighted && allHighlighted) {
        // "Highlight all edges" mode - keep original color
        edgeHighlightColor = color
      }

      return {
        ...e,
        linePath: stroked.get(e.id) ?? strokedPath(e, baseStrokeWidth),
        isHighlighted,
        isSelected,
        isNeighborEdge,
        inFocus,
        opacity,
        baseOpacity,
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
      source: e.source_node_id,
      target: e.target_node_id,
      x1: e.x1,
      y1: e.y1,
      x2: e.x2,
      y2: e.y2,
      color: getEdgeColor({ link_type: e.link_type || '', color: e.color }),
    }))
  )

  return {
    visibleEdgeLines,
    hiddenEdges,
    canvasEdges,
  }
}
