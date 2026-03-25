/**
 * Viewport culling composable
 *
 * Handles viewport-based node visibility filtering for performance optimization
 */

import { ref, computed, onMounted, onUnmounted, type Ref, type ComputedRef } from 'vue'
import { NODE_DEFAULTS } from '../../constants'
import type { Node } from '../../../types'

export interface UseViewportCullingContext {
  scale: Ref<number>
  offsetX: Ref<number>
  offsetY: Ref<number>
  displayNodes: ComputedRef<Node[]>
  selectedNodeIds: Ref<string[]> | ComputedRef<string[]>
}

export interface UseViewportCullingReturn {
  viewportWidth: Ref<number>
  viewportHeight: Ref<number>
  visibleNodes: ComputedRef<Node[]>
  visibleNodeIds: ComputedRef<Set<string>>
}

export function useViewportCulling(ctx: UseViewportCullingContext): UseViewportCullingReturn {
  const { scale, offsetX, offsetY, displayNodes, selectedNodeIds } = ctx

  // Viewport size for culling (updated on resize)
  const viewportWidth = ref(window.innerWidth)
  const viewportHeight = ref(window.innerHeight)

  // Handle window resize
  function onResize() {
    viewportWidth.value = window.innerWidth
    viewportHeight.value = window.innerHeight
  }

  onMounted(() => {
    window.addEventListener('resize', onResize)
  })

  onUnmounted(() => {
    window.removeEventListener('resize', onResize)
  })

  // Only render nodes visible in viewport (with margin for smooth scrolling)
  // Always include selected nodes so they can be measured/fitted even if off-screen
  const visibleNodes = computed(() => {
    const s = scale.value
    const ox = offsetX.value
    const oy = offsetY.value
    // Scale margin inversely with zoom to maintain consistent screen-space buffer
    // At zoom 1.0: 500px margin. At zoom 0.2: 2500px margin in canvas coords
    const baseMargin = 500
    const margin = baseMargin / Math.max(s, 0.1)

    // Viewport bounds in canvas coordinates
    const viewLeft = -ox / s - margin
    const viewTop = -oy / s - margin
    const viewRight = (viewportWidth.value - ox) / s + margin
    const viewBottom = (viewportHeight.value - oy) / s + margin

    // Selected nodes should always be rendered (for fitting, etc.)
    const selectedSet = new Set(selectedNodeIds.value)

    // Use displayNodes which respects neighborhood mode
    return displayNodes.value.filter(node => {
      // Always include selected nodes
      if (selectedSet.has(node.id)) return true

      const nodeRight = node.canvas_x + (node.width || NODE_DEFAULTS.WIDTH)
      const nodeBottom = node.canvas_y + (node.height || NODE_DEFAULTS.HEIGHT)
      // Check if node intersects viewport
      return nodeRight >= viewLeft &&
             node.canvas_x <= viewRight &&
             nodeBottom >= viewTop &&
             node.canvas_y <= viewBottom
    })
  })

  // Set of visible node IDs for quick lookup
  const visibleNodeIds = computed(() => new Set(visibleNodes.value.map(n => n.id)))

  return {
    viewportWidth,
    viewportHeight,
    visibleNodes,
    visibleNodeIds,
  }
}
