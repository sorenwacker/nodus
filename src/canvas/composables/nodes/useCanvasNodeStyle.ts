/**
 * Node styling composable
 *
 * Handles node style computation including position transforms,
 * dimensions, color themes, and z-ordering.
 */
import type { Ref, ComputedRef } from 'vue'
import { NODE_DEFAULTS } from '../../constants'
import { getNodeBackground as getNodeBackgroundUtil } from '../../utils/nodeColors'
import { nodeDisplayTitle } from '../../utils/nodeDisplayTitle'

/**
 * Node shape for style computation
 */
export interface NodeForStyle {
  id: string
  canvas_x: number
  canvas_y: number
  width?: number
  height?: number
  color_theme?: string | null
  node_type?: string
  /** The collapsed type size is chosen to fit the title actually drawn. */
  title?: string | null
  markdown_content?: string | null
}

/**
 * Resize preview state
 */
export interface ResizePreview {
  x: number
  y: number
  width: number
  height: number
}

/**
 * Context required for node styling
 */
export interface UseCanvasNodeStyleContext {
  /**
   * The user's font scale. The collapsed title renders at the base size times
   * this, so the line budget must use it or it overestimates
   * (PRODUCT_DESIGN.md > Collapsed node titles).
   */
  fontScale?: Ref<number>
  /** Currently resizing node ID (or null) */
  resizingNode: Ref<string | null>
  /** Preview state during resize */
  resizePreview: Ref<ResizePreview>
  /** Z-order map for radial layout */
  nodeZOrder: Ref<Map<string, number>>
  /** Node border width (scaled) */
  nodeBorderWidth: ComputedRef<number>
  /** Whether semantic zoom is collapsed */
  isSemanticZoomCollapsed: ComputedRef<boolean>
  /** Selected node IDs */
  selectedNodeIds: ComputedRef<string[]>
  /**
   * Neighbours of the selection or the hovered node. They are exempt from the
   * collapsed dimming below: that dimming writes an inline border colour, which
   * outranks the stylesheet and would erase the highlight
   * (docs/content/features.md > Neighbor Highlighting).
   */
  highlightedNodeIds: ComputedRef<Set<string>>
  /** Current theme name */
  currentTheme: Ref<string>
}

/**
 * Return type for useCanvasNodeStyle
 */
export interface UseCanvasNodeStyleReturn {
  /**
   * Get background CSS for a color theme
   */
  getNodeBackground: (colorTheme: string | null) => string | undefined
  /**
   * Get computed style object for a node card
   */
  getNodeStyle: (node: NodeForStyle) => Record<string, string>
}

/**
 * Composable for node styling
 *
 * Provides functions to compute node background colors and complete
 * style objects for node cards, handling resize preview, zoom scaling,
 * color themes, and z-ordering.
 */
export function useCanvasNodeStyle(ctx: UseCanvasNodeStyleContext): UseCanvasNodeStyleReturn {
  const {
    fontScale,
    resizingNode,
    resizePreview,
    nodeZOrder,
    nodeBorderWidth,
    isSemanticZoomCollapsed,
    selectedNodeIds,
    highlightedNodeIds,
    currentTheme,
  } = ctx

  /**
   * Get node background - wrapper for utility function with current theme
   */
  function getNodeBackground(colorTheme: string | null): string | undefined {
    return getNodeBackgroundUtil(colorTheme, currentTheme.value)
  }

  /**
   * Get computed style for a node card
   *
   * Handles:
   * - Resize preview state
   * - Canvas position transform (the container applies pan and zoom)
   * - Tag node sizing (fit-content)
   * - Border width scaling
   * - Z-order from radial layout
   * - Color theme backgrounds
   * - Collapsed semantic zoom styling
   */
  function getNodeStyle(node: NodeForStyle): Record<string, string> {
    const isResizing = resizingNode.value === node.id
    const isTagNode = node.node_type === 'tag'
    const x = isResizing ? resizePreview.value.x : node.canvas_x
    const y = isResizing ? resizePreview.value.y : node.canvas_y
    const width = isResizing ? resizePreview.value.width : node.width || NODE_DEFAULTS.WIDTH
    const height = isResizing ? resizePreview.value.height : node.height || NODE_DEFAULTS.HEIGHT

    // Canvas coordinates only: the node layer's container carries the single
    // pan-and-zoom transform, so this style never depends on scale or offset
    // and a pan frame patches one container instead of every visible card
    // (PRODUCT_DESIGN.md > Canvas rendering). The container scale rasterizes
    // text exactly as the per-card scale() it replaces did.
    // --zoom-scale is pinned to 1 so calc(... * var(--zoom-scale)) rules
    // resolve to their base sizes; the container transform applies the zoom.
    const logicalWidth = isTagNode ? 'fit-content' : width + 'px'
    const logicalHeight = isTagNode ? 'fit-content' : height + 'px'

    // How many lines of the collapsed title the card can hold. A fixed count
    // cuts a long title mid-line on a tall card and wastes space on a short
    // one (PRODUCT_DESIGN.md > Collapsed node titles). Mirrors the collapsed
    // header's own type size, line height and padding.
    const COLLAPSED_FONT = 28
    const COLLAPSED_LINE_HEIGHT = 1.2
    const COLLAPSED_PADDING = 14
    const COLLAPSED_SIDE_PADDING = 10
    /** Smallest type the collapsed title may shrink to before it is truncated. */
    const MIN_COLLAPSED_FONT = 11
    /** Mean advance of a bold sans glyph, as a fraction of the type size. */
    const AVG_CHAR_EM = 0.52
    const textScale = fontScale?.value ?? 1
    // The border the card actually draws, not the 2px the stylesheet declares:
    // it is written inline from the zoom, so at every scale where cards are
    // collapsed it is wider than the declared value, and assuming the declared
    // one overestimated the height available
    // (PRODUCT_DESIGN.md > Collapsed node titles)
    const border = nodeBorderWidth.value
    const availableHeight = height - COLLAPSED_PADDING * 2 - border * 2
    const availableWidth = width - COLLAPSED_SIDE_PADDING * 2 - border * 2
    // Size and line count are chosen together: a smaller size yields both more
    // lines and more characters a line, so neither can be settled alone. The
    // largest size at which the whole title fits wins, and only a title too
    // long for the smallest readable size is truncated.
    const renderedTitle = nodeDisplayTitle(node)
    let titleSize = COLLAPSED_FONT
    let titleLines = 1
    for (let size = COLLAPSED_FONT; size >= MIN_COLLAPSED_FONT; size--) {
      const lineBox = size * textScale * COLLAPSED_LINE_HEIGHT
      const lines = Math.max(1, Math.floor(availableHeight / lineBox))
      const perLine = Math.max(1, Math.floor(availableWidth / (size * textScale * AVG_CHAR_EM)))
      titleSize = size
      titleLines = lines
      if (Math.ceil(renderedTitle.length / perLine) <= lines) break
    }

    const style: Record<string, string> = {
      '--zoom-scale': '1',
      '--title-lines': String(titleLines),
      '--title-size': titleSize + 'px',
      transform: `translate(${x}px, ${y}px)`,
      transformOrigin: '0 0',
      width: logicalWidth,
      height: logicalHeight,
      borderWidth: nodeBorderWidth.value + 'px',
    }

    // Apply z-index from radial layout angle order (if set)
    const zIndex = nodeZOrder.value.get(node.id)
    if (zIndex !== undefined) {
      style.zIndex = String(zIndex)
    }

    // Apply color theme background if set
    if (node.color_theme) {
      const bg = getNodeBackground(node.color_theme)
      if (bg) {
        style.background = bg
        // Tag nodes use background color for border too
        if (isTagNode) {
          style.borderColor = bg
        }
      }
    } else if (!isTagNode && isSemanticZoomCollapsed.value && !selectedNodeIds.value.includes(node.id)) {
      // Collapsed non-selected nodes get canvas background
      style.background = 'var(--bg-canvas)'
      // A highlighted neighbour keeps the stylesheet's border. Writing one here
      // would win on inline weight alone and blank the highlight out.
      if (!highlightedNodeIds.value.has(node.id)) {
        style.borderColor = 'var(--text-muted)'
      }
    }

    return style
  }

  return {
    getNodeBackground,
    getNodeStyle,
  }
}
