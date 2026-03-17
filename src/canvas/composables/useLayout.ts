/**
 * Layout composable
 * Handles node layout algorithms and animations
 */
import { type Ref } from 'vue'
import { NODE_DEFAULTS } from '../constants'
import { applyForceLayout } from '../layout'

interface Node {
  id: string
  canvas_x: number
  canvas_y: number
  width?: number
  height?: number
}

interface Edge {
  id: string
  source_node_id: string
  target_node_id: string
}

interface Store {
  getNodes: () => Node[]
  getFilteredNodes: () => Node[]
  getFilteredEdges: () => Edge[]
  getSelectedNodeIds: () => string[]
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
      const node = store.getNodes().find(n => n.id === id)
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
   * Tetris-style bin packing for grid layout with edge-aware placement
   * Places connected nodes closer together to minimize total edge length
   */
  function tetrisGridLayout(
    nodes: Node[],
    edges: Edge[],
    startX: number,
    startY: number,
    gap: number
  ): Map<string, { x: number; y: number }> {
    const targets = new Map<string, { x: number; y: number }>()

    if (nodes.length === 0) return targets

    // Build adjacency map for edge-aware placement
    const nodeIds = new Set(nodes.map(n => n.id))
    const adjacency = new Map<string, Set<string>>()
    for (const node of nodes) {
      adjacency.set(node.id, new Set())
    }
    for (const edge of edges) {
      if (nodeIds.has(edge.source_node_id) && nodeIds.has(edge.target_node_id)) {
        adjacency.get(edge.source_node_id)?.add(edge.target_node_id)
        adjacency.get(edge.target_node_id)?.add(edge.source_node_id)
      }
    }

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

    // Sort nodes: prioritize by connectivity (most connected first), then by area
    const sorted = [...nodes].sort((a, b) => {
      const connA = adjacency.get(a.id)?.size || 0
      const connB = adjacency.get(b.id)?.size || 0
      if (connA !== connB) return connB - connA // Most connected first
      const areaA = (a.width || NODE_DEFAULTS.WIDTH) * (a.height || NODE_DEFAULTS.HEIGHT)
      const areaB = (b.width || NODE_DEFAULTS.WIDTH) * (b.height || NODE_DEFAULTS.HEIGHT)
      return areaB - areaA // Then largest first
    })

    // Track placed rectangles with node IDs
    const placed: { id: string; x: number; y: number; w: number; h: number }[] = []

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

    // Calculate distance to center of connected placed nodes
    function distanceToConnected(nodeId: string, x: number, y: number, w: number, h: number): number {
      const connected = adjacency.get(nodeId)
      if (!connected || connected.size === 0) return 0

      let totalDist = 0
      let count = 0
      const cx = x + w / 2
      const cy = y + h / 2

      for (const rect of placed) {
        if (connected.has(rect.id)) {
          const rcx = rect.x + rect.w / 2
          const rcy = rect.y + rect.h / 2
          totalDist += Math.sqrt((cx - rcx) ** 2 + (cy - rcy) ** 2)
          count++
        }
      }

      return count > 0 ? totalDist / count : 0
    }

    function findBestPosition(nodeId: string, w: number, h: number): { x: number; y: number } {
      const candidates: { x: number; y: number; packScore: number; edgeScore: number }[] = []

      candidates.push({ x: startX, y: startY, packScore: 0, edgeScore: 0 })

      for (const rect of placed) {
        const rightX = rect.x + rect.w + gap
        if (rightX + w <= startX + maxWidth) {
          candidates.push({ x: rightX, y: rect.y, packScore: rect.y * 10000 + rightX, edgeScore: 0 })
        }

        candidates.push({ x: rect.x, y: rect.y + rect.h + gap, packScore: (rect.y + rect.h + gap) * 10000 + rect.x, edgeScore: 0 })
        candidates.push({ x: startX, y: rect.y + rect.h + gap, packScore: (rect.y + rect.h + gap) * 10000, edgeScore: 0 })

        if (rightX + w <= startX + maxWidth) {
          candidates.push({ x: rightX, y: startY, packScore: startY * 10000 + rightX, edgeScore: 0 })
        }

        for (const other of placed) {
          if (other === rect) continue
          if (other.y > rect.y + rect.h + gap) {
            const gapTop = rect.y + rect.h + gap
            const gapHeight = other.y - gapTop - gap
            if (gapHeight >= h) {
              candidates.push({ x: rect.x, y: gapTop, packScore: gapTop * 10000 + rect.x, edgeScore: 0 })
            }
          }
        }
      }

      // Calculate edge distance scores for valid candidates
      const validCandidates: typeof candidates = []
      for (const cand of candidates) {
        if (cand.x >= startX && cand.y >= startY &&
            cand.x + w <= startX + maxWidth &&
            !overlaps(cand.x, cand.y, w, h)) {
          cand.edgeScore = distanceToConnected(nodeId, cand.x, cand.y, w, h)
          validCandidates.push(cand)
        }
      }

      if (validCandidates.length === 0) {
        let maxBottom = startY
        for (const rect of placed) {
          maxBottom = Math.max(maxBottom, rect.y + rect.h + gap)
        }
        return { x: startX, y: maxBottom }
      }

      // Sort by edge distance first (to minimize edge length), then by packing score
      // Weight edge proximity heavily for connected nodes
      validCandidates.sort((a, b) => {
        // If both have edge connections, prioritize closer to connected nodes
        if (a.edgeScore > 0 || b.edgeScore > 0) {
          const edgeDiff = a.edgeScore - b.edgeScore
          if (Math.abs(edgeDiff) > 50) return edgeDiff // Significant edge distance difference
        }
        // Otherwise use packing score
        return a.packScore - b.packScore
      })

      return { x: validCandidates[0].x, y: validCandidates[0].y }
    }

    for (const node of sorted) {
      const w = node.width || NODE_DEFAULTS.WIDTH
      const h = node.height || NODE_DEFAULTS.HEIGHT
      const pos = findBestPosition(node.id, w, h)
      targets.set(node.id, pos)
      placed.push({ id: node.id, x: pos.x, y: pos.y, w, h })
    }

    return targets
  }

  async function autoLayout(layout: 'grid' | 'horizontal' | 'vertical' | 'force' = 'grid') {
    console.log('autoLayout called with:', layout)
    const selectedIds = store.getSelectedNodeIds()
    const allNodes = store.getFilteredNodes()
    const nodes = selectedIds.length > 0
      ? allNodes.filter(n => selectedIds.includes(n.id))
      : allNodes

    console.log('autoLayout nodes:', nodes.length, 'selected:', selectedIds.length)
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
      // Get edges for force layout
      const edges = store.getFilteredEdges()
      const layoutNodes = nodes.map(n => ({
        id: n.id,
        x: n.canvas_x,
        y: n.canvas_y,
        width: n.width || NODE_DEFAULTS.WIDTH,
        height: n.height || NODE_DEFAULTS.HEIGHT,
      }))
      const layoutEdges = edges
        .filter(e => {
          const nodeIdSet = new Set(nodes.map(n => n.id))
          return nodeIdSet.has(e.source_node_id) && nodeIdSet.has(e.target_node_id)
        })
        .map(e => ({
          source: e.source_node_id,
          target: e.target_node_id,
        }))

      const positions = await applyForceLayout(layoutNodes, layoutEdges, {
        centerX,
        centerY,
        iterations: nodes.length > 100 ? 200 : 400,
      })

      // Convert to targets map and animate
      const targets = new Map<string, { x: number; y: number }>()
      for (const [id, pos] of positions) {
        targets.set(id, pos)
      }
      animateToPositions(targets, 800)
      return
    }

    const targets = new Map<string, { x: number; y: number }>()

    if (layout === 'grid') {
      const edges = store.getFilteredEdges()
      const trialTargets = tetrisGridLayout(nodes, edges, 0, 0, gap)

      if (trialTargets.size === 0) {
        console.warn('Grid layout: no positions generated')
        return
      }

      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
      for (const node of nodes) {
        const pos = trialTargets.get(node.id)
        if (!pos) continue
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
      console.log('Grid layout targets:', targets.size)
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

    console.log('Calling animateToPositions with', targets.size, 'targets')
    animateToPositions(targets, 500)
  }

  function fitToContent() {
    const nodes = store.getFilteredNodes()
    if (nodes.length === 0) return

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const node of nodes) {
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
