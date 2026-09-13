import { type Ref } from 'vue'
import { NODE_DEFAULTS } from '../../constants'
import { resolveWikilink } from '../../../lib/wikilink'
import type { Node, Frame } from '../../../types'

export interface NodeLike {
  id: string
  title: string
  canvas_x: number
  canvas_y: number
  width?: number
  height?: number
}

export interface NodeNavigationDeps {
  getFilteredNodes: () => Node[]
  /** Frames, so a link naming a folder resolves inside it */
  getFrames?: () => Frame[]
  getNode: (id: string) => { id: string; canvas_x: number; canvas_y: number; width?: number; height?: number } | undefined
  getVisualNode: (id: string) => { id: string; canvas_x: number; canvas_y: number; width?: number; height?: number } | undefined
  selectNode: (id: string) => void
  canvasRef: Ref<HTMLElement | null>
  scale: Ref<number>
  offsetX: Ref<number>
  offsetY: Ref<number>
  neighborhoodMode: Ref<boolean>
}

/**
 * Composable for node navigation
 * Handles navigating to nodes by title and zooming to specific nodes
 */
export function useNodeNavigation(deps: NodeNavigationDeps) {
  /**
   * Navigate to a node by title (for wikilinks)
   * Handles paths like "concepts/FAIR-Digital-Objects" by falling back to filename match
   */
  function navigateToNode(title: string) {
    const nodes = deps.getFilteredNodes()
    const titleLower = title.toLowerCase()

    // The resolver the link rendering uses, so a link leads to the same note
    // wherever it is followed (PRODUCT_DESIGN.md > Syncing wikilink edges)
    let targetNode: NodeLike | undefined = resolveWikilink(title, {
      nodes,
      frames: deps.getFrames?.() ?? [],
    })

    // A title written with hyphens for a note whose title has spaces: the
    // resolver matches titles exactly, and this spelling is common in links
    if (!targetNode) {
      // wikilink-target: uses '/' on every platform
      const searchTerm = title.includes('/') ? title.split('/').pop()?.toLowerCase() : titleLower
      if (searchTerm) {
        targetNode = nodes.find(
          n => n.title.toLowerCase().replace(/-/g, ' ') === searchTerm.replace(/-/g, ' ')
        )
      }
    }

    if (!targetNode) {
      console.warn(`Node not found: ${title}`)
      return
    }

    // Center view on node
    const rect = deps.canvasRef.value?.getBoundingClientRect()
    if (rect) {
      const nodeCenterX = targetNode.canvas_x + (targetNode.width || NODE_DEFAULTS.WIDTH) / 2
      const nodeCenterY = targetNode.canvas_y + (targetNode.height || NODE_DEFAULTS.HEIGHT) / 2
      deps.offsetX.value = rect.width / 2 - nodeCenterX * deps.scale.value
      deps.offsetY.value = rect.height / 2 - nodeCenterY * deps.scale.value
    }

    // Select the node
    deps.selectNode(targetNode.id)
  }

  /**
   * Zoom to node - animate view to center on node and fit it in viewport
   */
  function zoomToNode(nodeId: string, requestedScale?: number) {
    // Use visual node position (accounts for neighborhood mode)
    const node = deps.neighborhoodMode.value
      ? deps.getVisualNode(nodeId)
      : deps.getNode(nodeId)
    if (!node) return

    const rect = deps.canvasRef.value?.getBoundingClientRect()
    if (!rect) return

    // Calculate node dimensions
    const nodeWidth = node.width || NODE_DEFAULTS.WIDTH
    const nodeHeight = node.height || NODE_DEFAULTS.HEIGHT
    const nodeCenterX = node.canvas_x + nodeWidth / 2
    const nodeCenterY = node.canvas_y + nodeHeight / 2

    // Calculate scale to fit node with padding (80% of viewport)
    const padding = 0.8
    const scaleToFitWidth = (rect.width * padding) / nodeWidth
    const scaleToFitHeight = (rect.height * padding) / nodeHeight
    const fitScale = Math.min(scaleToFitWidth, scaleToFitHeight, 2.0) // Cap at 2x zoom

    // Use requested scale if provided, otherwise calculate based on node size
    const targetScale = requestedScale ?? Math.max(0.5, Math.min(fitScale, 1.5))

    // Calculate target offset to center the node
    const targetOffsetX = rect.width / 2 - nodeCenterX * targetScale
    const targetOffsetY = rect.height / 2 - nodeCenterY * targetScale

    // Animate to the target position
    const startScale = deps.scale.value
    const startOffsetX = deps.offsetX.value
    const startOffsetY = deps.offsetY.value
    const duration = 300
    const startTime = performance.now()

    function easeOutCubic(t: number): number {
      return 1 - Math.pow(1 - t, 3)
    }

    function animate() {
      const elapsed = performance.now() - startTime
      const progress = Math.min(elapsed / duration, 1)
      const eased = easeOutCubic(progress)

      deps.scale.value = startScale + (targetScale - startScale) * eased
      deps.offsetX.value = startOffsetX + (targetOffsetX - startOffsetX) * eased
      deps.offsetY.value = startOffsetY + (targetOffsetY - startOffsetY) * eased

      if (progress < 1) {
        requestAnimationFrame(animate)
      } else {
        // Select the node after zoom completes
        deps.selectNode(nodeId)
      }
    }

    requestAnimationFrame(animate)
  }

  return {
    navigateToNode,
    zoomToNode,
  }
}
