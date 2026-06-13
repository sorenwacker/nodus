/**
 * Node styling composable
 *
 * Handles node style computation including position transforms,
 * dimensions, color themes, and z-ordering.
 */
import type { Ref, ComputedRef } from 'vue'
import { NODE_DEFAULTS } from '../../constants'
import { getNodeBackground as getNodeBackgroundUtil } from '../../utils/nodeColors'

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
  /** Current zoom scale */
  scale: Ref<number>
  /** Current X offset */
  offsetX: Ref<number>
  /** Current Y offset */
  offsetY: Ref<number>
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
    scale,
    offsetX,
    offsetY,
    resizingNode,
    resizePreview,
    nodeZOrder,
    nodeBorderWidth,
    isSemanticZoomCollapsed,
    selectedNodeIds,
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
   * - Screen position transform (scaled + offset)
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

    // Calculate screen position (node layer is outside canvas-content scale transform)
    const screenX = x * scale.value + offsetX.value
    const screenY = y * scale.value + offsetY.value

    // Tag nodes fit content, regular nodes use stored dimensions
    const screenWidth = isTagNode ? 'fit-content' : width * scale.value + 'px'
    const screenHeight = isTagNode ? 'fit-content' : height * scale.value + 'px'

    const style: Record<string, string> = {
      '--zoom-scale': String(scale.value),
      transform: `translate(${screenX}px, ${screenY}px)`,
      width: screenWidth,
      height: screenHeight,
      borderWidth: nodeBorderWidth.value * scale.value + 'px',
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
      style.borderColor = 'var(--text-muted)'
    }

    return style
  }

  return {
    getNodeBackground,
    getNodeStyle,
  }
}
