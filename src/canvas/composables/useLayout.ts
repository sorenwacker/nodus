/**
 * Layout composable
 * Handles node layout algorithms and animations
 */
import { type Ref } from 'vue'
import { NODE_DEFAULTS } from '../constants'

interface Node {
  id: string
  canvas_x: number
  canvas_y: number
  width?: number
  height?: number
}

interface Store {
  nodes: Node[]
  filteredNodes: Node[]
  selectedNodeIds: string[]
  updateNodePosition: (id: string, x: number, y: number) => void
  layoutNodes: (nodeIds?: string[], options?: { centerX: number; centerY: number }) => Promise<void>
}

interface ViewState {
  scale: Ref<number>
  offsetX: Ref<number>
  offsetY: Ref<number>
  canvasRect: () => DOMRect | null
}

export interface UseLayoutOptions {
  store: Store
  viewState: ViewState
  pushUndo: () => void
}

export function useLayout(options: UseLayoutOptions) {
  const { store, viewState, pushUndo } = options

  let layoutAnimationId: number | null = null

  function stopAnimation() {
    if (layoutAnimationId) {
      cancelAnimationFrame(layoutAnimationId)
      layoutAnimationId = null
    }
  }

  function animateToPositions(targets: Map<string, { x: number; y: number }>, duration = 400) {
    stopAnimation()

    const startTime = performance.now()
    const startPositions = new Map<string, { x: number; y: number }>()

    for (const [id] of targets) {
      const node = store.nodes.find(n => n.id === id)
      if (node) {
        startPositions.set(id, { x: node.canvas_x, y: node.canvas_y })
      }
    }

    function easeOutCubic(t: number): number {
      return 1 - Math.pow(1 - t, 3)
    }

    function animate() {
      const elapsed = performance.now() - startTime
      const progress = Math.min(elapsed / duration, 1)
      const eased = easeOutCubic(progress)

      for (const [id, target] of targets) {
        const start = startPositions.get(id)
        if (start) {
          const x = start.x + (target.x - start.x) * eased
          const y = start.y + (target.y - start.y) * eased
          store.updateNodePosition(id, x, y)
        }
      }

      if (progress < 1) {
        layoutAnimationId = requestAnimationFrame(animate)
      } else {
        layoutAnimationId = null
      }
    }

    layoutAnimationId = requestAnimationFrame(animate)
  }

  /**
   * Tetris-style bin packing for grid layout using maximal rectangles algorithm
   */
  function tetrisGridLayout(
    nodes: Node[],
    startX: number,
    startY: number,
    gap: number
  ): Map<string, { x: number; y: number }> {
    const targets = new Map<string, { x: number; y: number }>()

    if (nodes.length === 0) return targets

    // Calculate total area to estimate ideal dimensions
    let totalArea = 0
    let maxNodeWidth = 0
    let maxNodeHeight = 0
    for (const node of nodes) {
      const w = node.width || NODE_DEFAULTS.WIDTH
      const h = node.height || NODE_DEFAULTS.HEIGHT
      totalArea += (w + gap) * (h + gap)
      maxNodeWidth = Math.max(maxNodeWidth, w)
      maxNodeHeight = Math.max(maxNodeHeight, h)
    }

    // Target a roughly square layout
    const idealSide = Math.sqrt(totalArea) * 1.2
    const maxWidth = Math.max(idealSide, maxNodeWidth + gap)

    // Sort nodes by area (largest first) for better packing
    const sorted = [...nodes].sort((a, b) => {
      const areaA = (a.width || NODE_DEFAULTS.WIDTH) * (a.height || NODE_DEFAULTS.HEIGHT)
      const areaB = (b.width || NODE_DEFAULTS.WIDTH) * (b.height || NODE_DEFAULTS.HEIGHT)
      return areaB - areaA
    })

    // Track placed rectangles
    const placed: { x: number; y: number; w: number; h: number }[] = []

    function overlaps(x: number, y: number, w: number, h: number): boolean {
      for (const rect of placed) {
        if (x < rect.x + rect.w + gap &&
            x + w + gap > rect.x &&
            y < rect.y + rect.h + gap &&
            y + h + gap > rect.y) {
          return true
        }
      }
      return false
    }

    function findBestPosition(w: number, h: number): { x: number; y: number } {
      const candidates: { x: number; y: number; score: number }[] = []

      candidates.push({ x: startX, y: startY, score: 0 })

      for (const rect of placed) {
        const rightX = rect.x + rect.w + gap
        if (rightX + w <= startX + maxWidth) {
          candidates.push({ x: rightX, y: rect.y, score: rect.y * 10000 + rightX })
        }

        candidates.push({ x: rect.x, y: rect.y + rect.h + gap, score: (rect.y + rect.h + gap) * 10000 + rect.x })
        candidates.push({ x: startX, y: rect.y + rect.h + gap, score: (rect.y + rect.h + gap) * 10000 })

        if (rightX + w <= startX + maxWidth) {
          candidates.push({ x: rightX, y: startY, score: startY * 10000 + rightX })
        }

        for (const other of placed) {
          if (other === rect) continue
          if (other.y > rect.y + rect.h + gap) {
            const gapTop = rect.y + rect.h + gap
            const gapHeight = other.y - gapTop - gap
            if (gapHeight >= h) {
              candidates.push({ x: rect.x, y: gapTop, score: gapTop * 10000 + rect.x })
            }
          }
        }
      }

      candidates.sort((a, b) => a.score - b.score)

      for (const cand of candidates) {
        if (cand.x >= startX && cand.y >= startY &&
            cand.x + w <= startX + maxWidth &&
            !overlaps(cand.x, cand.y, w, h)) {
          return { x: cand.x, y: cand.y }
        }
      }

      let maxBottom = startY
      for (const rect of placed) {
        maxBottom = Math.max(maxBottom, rect.y + rect.h + gap)
      }
      return { x: startX, y: maxBottom }
    }

    for (const node of sorted) {
      const w = node.width || NODE_DEFAULTS.WIDTH
      const h = node.height || NODE_DEFAULTS.HEIGHT
      const pos = findBestPosition(w, h)
      targets.set(node.id, pos)
      placed.push({ x: pos.x, y: pos.y, w, h })
    }

    return targets
  }

  async function autoLayout(layout: 'grid' | 'horizontal' | 'vertical' | 'force' = 'grid') {
    const selectedIds = store.selectedNodeIds
    const allNodes = store.filteredNodes
    const nodes = selectedIds.length > 0
      ? allNodes.filter(n => selectedIds.includes(n.id))
      : allNodes

    if (nodes.length === 0) return

    pushUndo()
    stopAnimation()

    // Calculate current center
    let sumX = 0, sumY = 0
    for (const node of nodes) {
      sumX += node.canvas_x + (node.width || NODE_DEFAULTS.WIDTH) / 2
      sumY += node.canvas_y + (node.height || NODE_DEFAULTS.HEIGHT) / 2
    }
    const centerX = sumX / nodes.length
    const centerY = sumY / nodes.length

    const gap = 150

    if (layout === 'force') {
      const nodeIds = selectedIds.length > 0 ? selectedIds : undefined
      await store.layoutNodes(nodeIds, { centerX, centerY })
      return
    }

    const targets = new Map<string, { x: number; y: number }>()

    if (layout === 'grid') {
      const trialTargets = tetrisGridLayout(nodes, 0, 0, gap)

      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
      for (const node of nodes) {
        const pos = trialTargets.get(node.id)!
        const w = node.width || NODE_DEFAULTS.WIDTH
        const h = node.height || NODE_DEFAULTS.HEIGHT
        minX = Math.min(minX, pos.x)
        minY = Math.min(minY, pos.y)
        maxX = Math.max(maxX, pos.x + w)
        maxY = Math.max(maxY, pos.y + h)
      }

      const layoutCenterX = (minX + maxX) / 2
      const layoutCenterY = (minY + maxY) / 2
      const offsetX = centerX - layoutCenterX
      const offsetY = centerY - layoutCenterY

      for (const [id, pos] of trialTargets) {
        targets.set(id, { x: pos.x + offsetX, y: pos.y + offsetY })
      }
    } else if (layout === 'horizontal') {
      const sorted = [...nodes].sort((a, b) => (b.height || NODE_DEFAULTS.HEIGHT) - (a.height || NODE_DEFAULTS.HEIGHT))
      const totalWidth = sorted.reduce((sum, n) => sum + (n.width || NODE_DEFAULTS.WIDTH) + gap, -gap)
      let x = centerX - totalWidth / 2
      const maxHeight = Math.max(...sorted.map(n => n.height || NODE_DEFAULTS.HEIGHT))

      for (const node of sorted) {
        const h = node.height || NODE_DEFAULTS.HEIGHT
        targets.set(node.id, { x, y: centerY - maxHeight / 2 + (maxHeight - h) / 2 })
        x += (node.width || NODE_DEFAULTS.WIDTH) + gap
      }
    } else if (layout === 'vertical') {
      const sorted = [...nodes].sort((a, b) => (b.width || NODE_DEFAULTS.WIDTH) - (a.width || NODE_DEFAULTS.WIDTH))
      const totalHeight = sorted.reduce((sum, n) => sum + (n.height || NODE_DEFAULTS.HEIGHT) + gap, -gap)
      let y = centerY - totalHeight / 2
      const maxWidth = Math.max(...sorted.map(n => n.width || NODE_DEFAULTS.WIDTH))

      for (const node of sorted) {
        const w = node.width || NODE_DEFAULTS.WIDTH
        targets.set(node.id, { x: centerX - maxWidth / 2 + (maxWidth - w) / 2, y })
        y += (node.height || NODE_DEFAULTS.HEIGHT) + gap
      }
    }

    animateToPositions(targets, 500)
  }

  function fitToContent() {
    if (store.filteredNodes.length === 0) return

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const node of store.filteredNodes) {
      minX = Math.min(minX, node.canvas_x)
      minY = Math.min(minY, node.canvas_y)
      maxX = Math.max(maxX, node.canvas_x + (node.width || NODE_DEFAULTS.WIDTH))
      maxY = Math.max(maxY, node.canvas_y + (node.height || NODE_DEFAULTS.HEIGHT))
    }

    const rect = viewState.canvasRect()
    if (!rect) return

    const padding = 50
    const contentWidth = maxX - minX + padding * 2
    const contentHeight = maxY - minY + padding * 2

    const scaleX = rect.width / contentWidth
    const scaleY = rect.height / contentHeight
    viewState.scale.value = Math.min(scaleX, scaleY, 1)

    viewState.offsetX.value = (rect.width - contentWidth * viewState.scale.value) / 2 - minX * viewState.scale.value + padding * viewState.scale.value
    viewState.offsetY.value = (rect.height - contentHeight * viewState.scale.value) / 2 - minY * viewState.scale.value + padding * viewState.scale.value
  }

  return {
    stopAnimation,
    animateToPositions,
    autoLayout,
    fitToContent,
  }
}
