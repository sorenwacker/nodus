/**
 * Minimap composable
 * Handles minimap calculations and navigation
 */
import { computed, type Ref, type ComputedRef } from 'vue'

export interface MinimapNode {
  id: string
  canvas_x: number
  canvas_y: number
  width: number
  height: number
  color_theme: string | null
}

export interface MinimapOptions {
  nodes: ComputedRef<MinimapNode[]>
  selectedNodeIds: ComputedRef<string[]>
  scale: Ref<number>
  offsetX: Ref<number>
  offsetY: Ref<number>
  getViewportSize: () => { width: number; height: number } | null
}

const MINIMAP_SIZE = 150
const MINIMAP_PADDING = 10

export function useMinimap(options: MinimapOptions) {
  const { nodes, selectedNodeIds, scale, offsetX, offsetY, getViewportSize } = options

  const bounds = computed(() => {
    const nodeList = nodes.value
    if (nodeList.length === 0) {
      return { minX: 0, minY: 0, maxX: 1000, maxY: 800, width: 1000, height: 800 }
    }

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const node of nodeList) {
      // Guard against NaN/undefined values
      const x = node.canvas_x || 0
      const y = node.canvas_y || 0
      const w = node.width || 200
      const h = node.height || 120
      if (isNaN(x) || isNaN(y)) continue

      minX = Math.min(minX, x)
      minY = Math.min(minY, y)
      maxX = Math.max(maxX, x + w)
      maxY = Math.max(maxY, y + h)
    }

    // If all nodes had invalid coords, use defaults
    if (!isFinite(minX)) {
      return { minX: 0, minY: 0, maxX: 1000, maxY: 800, width: 1000, height: 800 }
    }

    const pad = 100
    minX -= pad
    minY -= pad
    maxX += pad
    maxY += pad

    return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY }
  })

  const minimapScale = computed(() => {
    const b = bounds.value
    const scaleX = (MINIMAP_SIZE - MINIMAP_PADDING * 2) / b.width
    const scaleY = (MINIMAP_SIZE - MINIMAP_PADDING * 2) / b.height
    return Math.min(scaleX, scaleY)
  })

  const viewport = computed(() => {
    const viewportSize = getViewportSize()
    if (!viewportSize) return { x: 0, y: 0, width: 50, height: 40 }

    const b = bounds.value
    const mScale = minimapScale.value

    // Guard against division by zero or NaN
    if (!scale.value || isNaN(mScale)) {
      return { x: 0, y: 0, width: 50, height: 40 }
    }

    const viewLeft = -offsetX.value / scale.value
    const viewTop = -offsetY.value / scale.value
    const viewWidth = viewportSize.width / scale.value
    const viewHeight = viewportSize.height / scale.value

    const x = (viewLeft - b.minX) * mScale + MINIMAP_PADDING
    const y = (viewTop - b.minY) * mScale + MINIMAP_PADDING
    const width = viewWidth * mScale
    const height = viewHeight * mScale

    return {
      x: isNaN(x) ? 0 : x,
      y: isNaN(y) ? 0 : y,
      width: isNaN(width) ? 50 : width,
      height: isNaN(height) ? 40 : height,
    }
  })

  /**
   * Get node position in minimap coordinates
   */
  function getNodePosition(node: MinimapNode) {
    const b = bounds.value
    const mScale = minimapScale.value

    // Guard against NaN values
    const x = (node.canvas_x - b.minX) * mScale + MINIMAP_PADDING
    const y = (node.canvas_y - b.minY) * mScale + MINIMAP_PADDING
    const width = Math.max((node.width || 200) * mScale, 3)
    const height = Math.max((node.height || 120) * mScale, 2)

    return {
      x: isNaN(x) ? 0 : x,
      y: isNaN(y) ? 0 : y,
      width: isNaN(width) ? 3 : width,
      height: isNaN(height) ? 2 : height,
    }
  }

  /**
   * Handle click on minimap - returns new offset values
   */
  function handleClick(clickX: number, clickY: number): { offsetX: number; offsetY: number } | null {
    const viewportSize = getViewportSize()
    if (!viewportSize) return null

    const b = bounds.value
    const mScale = minimapScale.value

    // Convert minimap click to canvas coordinates
    const canvasX = (clickX - MINIMAP_PADDING) / mScale + b.minX
    const canvasY = (clickY - MINIMAP_PADDING) / mScale + b.minY

    // Center viewport on that point
    return {
      offsetX: viewportSize.width / 2 - canvasX * scale.value,
      offsetY: viewportSize.height / 2 - canvasY * scale.value,
    }
  }

  function isSelected(nodeId: string): boolean {
    return selectedNodeIds.value.includes(nodeId)
  }

  return {
    MINIMAP_SIZE,
    MINIMAP_PADDING,
    bounds,
    minimapScale,
    viewport,
    getNodePosition,
    handleClick,
    isSelected,
  }
}
