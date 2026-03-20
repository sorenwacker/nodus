/**
 * Layout composable
 * Handles node layout algorithms and animations
 */
import { type Ref } from 'vue'
import { NODE_DEFAULTS } from '../constants'
import { applyForceLayout, applyHierarchicalLayout, layoutRegistry } from '../layout'
import { fastGridLayout, batchUpdatePositions } from '../layout/fastGrid'
import type { LayoutNode as StrategyLayoutNode, LayoutEdge as StrategyLayoutEdge } from '../layout/types'

interface Node {
  id: string
  canvas_x: number
  canvas_y: number
  width?: number
  height?: number
  frame_id?: string | null
}

interface Frame {
  id: string
  x: number
  y: number
  width: number
  height: number
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
  getFilteredFrames: () => Frame[]
  getSelectedNodeIds: () => string[]
  updateNodePosition: (id: string, x: number, y: number) => void
  updateFramePosition: (id: string, x: number, y: number) => void
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

  /**
   * Push nodes out of frame boundaries after layout calculation.
   * Ensures nodes don't end up inside frames.
   */
  function pushNodesOutOfFrames(
    positions: Map<string, { x: number; y: number }>,
    nodeMap: Map<string, { width?: number; height?: number }>
  ): Map<string, { x: number; y: number }> {
    const frames = store.getFilteredFrames()
    if (frames.length === 0) return positions

    const result = new Map<string, { x: number; y: number }>()

    for (const [nodeId, pos] of positions) {
      const nodeInfo = nodeMap.get(nodeId)
      const nodeWidth = nodeInfo?.width || NODE_DEFAULTS.WIDTH
      const nodeHeight = nodeInfo?.height || NODE_DEFAULTS.HEIGHT
      let newX = pos.x
      let newY = pos.y

      // Check collision with each frame and push out
      for (const frame of frames) {
        const nodeRight = newX + nodeWidth
        const nodeBottom = newY + nodeHeight
        const frameRight = frame.canvas_x + frame.width
        const frameBottom = frame.canvas_y + frame.height

        // Check if node overlaps frame
        const overlapX = newX < frameRight && nodeRight > frame.canvas_x
        const overlapY = newY < frameBottom && nodeBottom > frame.canvas_y

        if (overlapX && overlapY) {
          // Calculate push distances for each direction
          const pushLeft = nodeRight - frame.canvas_x
          const pushRight = frameRight - newX
          const pushUp = nodeBottom - frame.canvas_y
          const pushDown = frameBottom - newY

          // Find minimum push distance and apply
          const minPush = Math.min(pushLeft, pushRight, pushUp, pushDown)
          if (minPush === pushLeft) {
            newX = frame.canvas_x - nodeWidth - 20
          } else if (minPush === pushRight) {
            newX = frameRight + 20
          } else if (minPush === pushUp) {
            newY = frame.canvas_y - nodeHeight - 20
          } else {
            newY = frameBottom + 20
          }
        }
      }

      result.set(nodeId, { x: newX, y: newY })
    }

    return result
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

  async function autoLayout(layout: 'grid' | 'horizontal' | 'vertical' | 'force' | 'hierarchical' = 'grid') {
    console.log('autoLayout called with:', layout)
    const selectedIds = store.getSelectedNodeIds()
    const allNodes = store.getFilteredNodes()
    const allFrames = store.getFilteredFrames()
    const nodes = selectedIds.length > 0
      ? allNodes.filter(n => selectedIds.includes(n.id))
      : allNodes

    console.log('autoLayout nodes:', nodes.length, 'selected:', selectedIds.length, 'frames:', allFrames.length)
    if (nodes.length === 0) return

    // Thresholds for layout performance
    const FAST_GRID_THRESHOLD = 500  // Use fast grid algorithm above this
    const HUGE_THRESHOLD = 5000      // Warn but still try for huge graphs

    pushUndo()
    stopAnimation()

    // Fast path for grid layout with large node sets
    if (layout === 'grid' && nodes.length > FAST_GRID_THRESHOLD) {
      console.log(`Fast grid layout for ${nodes.length} nodes using optimized algorithm`)

      // Calculate center of current positions
      let sumX = 0, sumY = 0
      for (const node of nodes) {
        sumX += node.canvas_x
        sumY += node.canvas_y
      }
      const centerX = sumX / nodes.length
      const centerY = sumY / nodes.length

      // Use optimized fast grid with typed arrays
      const fastNodes = nodes.map(n => ({
        id: n.id,
        width: n.width || NODE_DEFAULTS.WIDTH,
        height: n.height || NODE_DEFAULTS.HEIGHT,
      }))

      const positions = fastGridLayout(fastNodes, {
        centerX,
        centerY,
        gap: 30,
      })

      // Batch update positions to avoid blocking UI
      await batchUpdatePositions(positions, store.updateNodePosition, 200)
      console.log(`Fast layout complete for ${nodes.length} nodes`)
      return
    }

    // Warn for huge graphs but still allow force/hierarchical
    if (nodes.length > HUGE_THRESHOLD) {
      console.warn(`Very large graph (${nodes.length} nodes) - ${layout} layout may be slow`)
    }

    // Helper to check if a node is spatially inside a frame (50%+ overlap)
    const isNodeInFrame = (node: Node, frame: Frame): boolean => {
      const nodeWidth = node.width || NODE_DEFAULTS.WIDTH
      const nodeHeight = node.height || NODE_DEFAULTS.HEIGHT
      const nodeArea = nodeWidth * nodeHeight

      const overlapX = Math.max(0,
        Math.min(node.canvas_x + nodeWidth, frame.canvas_x + frame.width) -
        Math.max(node.canvas_x, frame.canvas_x))
      const overlapY = Math.max(0,
        Math.min(node.canvas_y + nodeHeight, frame.canvas_y + frame.height) -
        Math.max(node.canvas_y, frame.canvas_y))

      return overlapX * overlapY > nodeArea * 0.5
    }

    // Create frame map first for spatial checks
    const frameMap = new Map(allFrames.map(f => [f.id, f]))

    // Group nodes by frame (check both frame_id and spatial overlap)
    const frameNodes = new Map<string, Node[]>() // frame_id -> nodes in that frame
    const unframedNodes: Node[] = []

    for (const node of nodes) {
      // Check explicit frame_id first
      if (node.frame_id && frameMap.has(node.frame_id)) {
        if (!frameNodes.has(node.frame_id)) {
          frameNodes.set(node.frame_id, [])
        }
        frameNodes.get(node.frame_id)!.push(node)
        continue
      }

      // Check spatial overlap with any frame
      let inFrame = false
      for (const frame of allFrames) {
        if (isNodeInFrame(node, frame)) {
          if (!frameNodes.has(frame.id)) {
            frameNodes.set(frame.id, [])
          }
          frameNodes.get(frame.id)!.push(node)
          inFrame = true
          break
        }
      }

      if (!inFrame) {
        unframedNodes.push(node)
      }
    }
    // Only layout unframed nodes - frames and their contents stay fixed
    const virtualNodes: Node[] = [...unframedNodes]

    // Skip frames entirely - they don't participate in layout
    // (Previously we created virtual nodes for frames and moved them as units)

    if (virtualNodes.length === 0) {
      console.log('[Layout] No unframed nodes to layout')
      return
    }

    // Calculate current center using unframed nodes only
    let sumX = 0, sumY = 0
    for (const node of virtualNodes) {
      sumX += node.canvas_x + (node.width || NODE_DEFAULTS.WIDTH) / 2
      sumY += node.canvas_y + (node.height || NODE_DEFAULTS.HEIGHT) / 2
    }
    const centerX = sumX / virtualNodes.length
    const centerY = sumY / virtualNodes.length

    const gap = 150

    // Frames are static - just pass through positions directly
    function expandToRealTargets(virtualTargets: Map<string, { x: number; y: number }>): Map<string, { x: number; y: number }> {
      return virtualTargets
    }

    if (layout === 'force') {
      // Get edges for force layout
      const edges = store.getFilteredEdges()
      const layoutNodes = virtualNodes.map(n => ({
        id: n.id,
        x: n.canvas_x,
        y: n.canvas_y,
        width: n.width || NODE_DEFAULTS.WIDTH,
        height: n.height || NODE_DEFAULTS.HEIGHT,
      }))
      const layoutEdges = edges
        .filter(e => {
          const nodeIdSet = new Set(virtualNodes.map(n => n.id))
          return nodeIdSet.has(e.source_node_id) && nodeIdSet.has(e.target_node_id)
        })
        .map(e => ({
          source: e.source_node_id,
          target: e.target_node_id,
        }))

      // Scale iterations based on node count (fewer for huge graphs)
      const n = virtualNodes.length
      const iterations = n > 2000 ? 30 : n > 1000 ? 50 : n > 500 ? 80 : n > 200 ? 100 : n > 100 ? 200 : 400
      const positions = await applyForceLayout(layoutNodes, layoutEdges, {
        centerX,
        centerY,
        iterations,
      })

      // Convert to targets map, expanding frames
      const virtualTargets = new Map<string, { x: number; y: number }>()
      for (const [id, pos] of positions) {
        virtualTargets.set(id, pos)
      }
      const realTargets = expandToRealTargets(virtualTargets)

      // Apply frame movements
      for (const [id, delta] of realTargets) {
        if (id.startsWith('__frame_move__')) {
          const frameId = id.replace('__frame_move__', '')
          const frame = frameMap.get(frameId)
          if (frame) {
            store.updateFramePosition(frameId, frame.canvas_x + delta.x, frame.canvas_y + delta.y)
          }
        }
      }

      // Remove frame move markers and apply positions
      const nodeTargets = new Map<string, { x: number; y: number }>()
      for (const [id, pos] of realTargets) {
        if (!id.startsWith('__frame_move__')) {
          nodeTargets.set(id, pos)
        }
      }

      // For large graphs, use batch updates instead of animation (much faster)
      if (virtualNodes.length > 500) {
        console.log(`Batch updating ${nodeTargets.size} node positions (skipping animation)`)
        await batchUpdatePositions(nodeTargets, store.updateNodePosition, 200)
      } else {
        animateToPositions(nodeTargets, 800)
      }
      return
    }

    if (layout === 'hierarchical') {
      // Get edges for hierarchical layout
      const edges = store.getFilteredEdges()
      const layoutNodes = virtualNodes.map(n => ({
        id: n.id,
        x: n.canvas_x,
        y: n.canvas_y,
        width: n.width || NODE_DEFAULTS.WIDTH,
        height: n.height || NODE_DEFAULTS.HEIGHT,
      }))
      const layoutEdges = edges
        .filter(e => {
          const nodeIdSet = new Set(virtualNodes.map(n => n.id))
          return nodeIdSet.has(e.source_node_id) && nodeIdSet.has(e.target_node_id)
        })
        .map(e => ({
          source: e.source_node_id,
          target: e.target_node_id,
        }))

      const positions = applyHierarchicalLayout(layoutNodes, layoutEdges, {
        direction: 'TB',
        nodeSpacingX: 50,
        nodeSpacingY: 120,
        centerX,
        centerY,
      })

      // Convert to targets map, expanding frames
      const virtualTargets = new Map<string, { x: number; y: number }>()
      for (const [id, pos] of positions) {
        virtualTargets.set(id, pos)
      }
      const realTargets = expandToRealTargets(virtualTargets)

      // Apply frame movements
      for (const [id, delta] of realTargets) {
        if (id.startsWith('__frame_move__')) {
          const frameId = id.replace('__frame_move__', '')
          const frame = frameMap.get(frameId)
          if (frame) {
            store.updateFramePosition(frameId, frame.canvas_x + delta.x, frame.canvas_y + delta.y)
          }
        }
      }

      // Remove frame move markers and animate nodes
      const nodeTargets = new Map<string, { x: number; y: number }>()
      for (const [id, pos] of realTargets) {
        if (!id.startsWith('__frame_move__')) {
          nodeTargets.set(id, pos)
        }
      }
      animateToPositions(nodeTargets, 600)
      return
    }

    const targets = new Map<string, { x: number; y: number }>()

    if (layout === 'grid') {
      const edges = store.getFilteredEdges()
      const trialTargets = tetrisGridLayout(virtualNodes, edges, 0, 0, gap)

      if (trialTargets.size === 0) {
        console.warn('Grid layout: no positions generated')
        return
      }

      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
      for (const node of virtualNodes) {
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

      const virtualTargets = new Map<string, { x: number; y: number }>()
      for (const [id, pos] of trialTargets) {
        virtualTargets.set(id, { x: pos.x + offsetX, y: pos.y + offsetY })
      }

      const realTargets = expandToRealTargets(virtualTargets)
      for (const [id, pos] of realTargets) {
        if (!id.startsWith('__frame_move__')) {
          targets.set(id, pos)
        }
      }

      // Move frames
      for (const [id, delta] of realTargets) {
        if (id.startsWith('__frame_move__')) {
          const frameId = id.replace('__frame_move__', '')
          const frame = frameMap.get(frameId)
          if (frame) {
            store.updateFramePosition(frameId, frame.canvas_x + delta.x, frame.canvas_y + delta.y)
          }
        }
      }

      console.log('Grid layout targets:', targets.size)
    } else if (layout === 'horizontal') {
      const sorted = [...virtualNodes].sort((a, b) => (b.height || NODE_DEFAULTS.HEIGHT) - (a.height || NODE_DEFAULTS.HEIGHT))
      const totalWidth = sorted.reduce((sum, n) => sum + (n.width || NODE_DEFAULTS.WIDTH) + gap, -gap)
      let x = centerX - totalWidth / 2
      const maxHeight = Math.max(...sorted.map(n => n.height || NODE_DEFAULTS.HEIGHT))

      const virtualTargets = new Map<string, { x: number; y: number }>()
      for (const node of sorted) {
        const h = node.height || NODE_DEFAULTS.HEIGHT
        virtualTargets.set(node.id, { x, y: centerY - maxHeight / 2 + (maxHeight - h) / 2 })
        x += (node.width || NODE_DEFAULTS.WIDTH) + gap
      }

      const realTargets = expandToRealTargets(virtualTargets)
      for (const [id, pos] of realTargets) {
        if (!id.startsWith('__frame_move__')) {
          targets.set(id, pos)
        }
      }
      for (const [id, delta] of realTargets) {
        if (id.startsWith('__frame_move__')) {
          const frameId = id.replace('__frame_move__', '')
          const frame = frameMap.get(frameId)
          if (frame) {
            store.updateFramePosition(frameId, frame.canvas_x + delta.x, frame.canvas_y + delta.y)
          }
        }
      }
    } else if (layout === 'vertical') {
      const sorted = [...virtualNodes].sort((a, b) => (b.width || NODE_DEFAULTS.WIDTH) - (a.width || NODE_DEFAULTS.WIDTH))
      const totalHeight = sorted.reduce((sum, n) => sum + (n.height || NODE_DEFAULTS.HEIGHT) + gap, -gap)
      let y = centerY - totalHeight / 2
      const maxWidth = Math.max(...sorted.map(n => n.width || NODE_DEFAULTS.WIDTH))

      const virtualTargets = new Map<string, { x: number; y: number }>()
      for (const node of sorted) {
        const w = node.width || NODE_DEFAULTS.WIDTH
        virtualTargets.set(node.id, { x: centerX - maxWidth / 2 + (maxWidth - w) / 2, y })
        y += (node.height || NODE_DEFAULTS.HEIGHT) + gap
      }

      const realTargets = expandToRealTargets(virtualTargets)
      for (const [id, pos] of realTargets) {
        if (!id.startsWith('__frame_move__')) {
          targets.set(id, pos)
        }
      }
      for (const [id, delta] of realTargets) {
        if (id.startsWith('__frame_move__')) {
          const frameId = id.replace('__frame_move__', '')
          const frame = frameMap.get(frameId)
          if (frame) {
            store.updateFramePosition(frameId, frame.canvas_x + delta.x, frame.canvas_y + delta.y)
          }
        }
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
    // Minimum scale of 0.02 to keep nodes visible, max of 1 to not zoom in beyond 100%
    viewState.scale.value = Math.max(0.02, Math.min(scaleX, scaleY, 1))

    viewState.offsetX.value = (rect.width - contentWidth * viewState.scale.value) / 2 - minX * viewState.scale.value + padding * viewState.scale.value
    viewState.offsetY.value = (rect.height - contentHeight * viewState.scale.value) / 2 - minY * viewState.scale.value + padding * viewState.scale.value
  }

  /**
   * Get available layout strategies from the registry
   */
  function getAvailableLayouts(): string[] {
    return layoutRegistry.names()
  }

  /**
   * Execute a registered layout strategy by name
   * This is an alternative to autoLayout that uses the strategy pattern
   */
  async function executeStrategy(
    strategyName: string,
    options?: { animate?: boolean; duration?: number }
  ): Promise<void> {
    const strategy = layoutRegistry.get(strategyName)
    if (!strategy) {
      console.warn(`Layout strategy '${strategyName}' not found, falling back to autoLayout`)
      // Fallback to autoLayout for unregistered strategies
      const layoutMap: Record<string, 'grid' | 'force' | 'hierarchical'> = {
        grid: 'grid',
        force: 'force',
        hierarchical: 'hierarchical',
      }
      if (layoutMap[strategyName]) {
        await autoLayout(layoutMap[strategyName])
      }
      return
    }

    const selectedIds = store.getSelectedNodeIds()
    const allNodes = store.getFilteredNodes()
    const allFrames = store.getFilteredFrames()

    // Helper to check if a node is inside any frame (50%+ overlap)
    const isNodeInAnyFrame = (node: Node): boolean => {
      if (node.frame_id) return true

      const nodeWidth = node.width || NODE_DEFAULTS.WIDTH
      const nodeHeight = node.height || NODE_DEFAULTS.HEIGHT
      const nodeArea = nodeWidth * nodeHeight

      for (const frame of allFrames) {
        const overlapX = Math.max(0,
          Math.min(node.canvas_x + nodeWidth, frame.canvas_x + frame.width) -
          Math.max(node.canvas_x, frame.canvas_x))
        const overlapY = Math.max(0,
          Math.min(node.canvas_y + nodeHeight, frame.canvas_y + frame.height) -
          Math.max(node.canvas_y, frame.canvas_y))
        if (overlapX * overlapY > nodeArea * 0.5) return true
      }
      return false
    }

    // Filter nodes: selected ones, excluding those in frames
    const candidateNodes = selectedIds.length > 0
      ? allNodes.filter(n => selectedIds.includes(n.id))
      : allNodes
    const nodes = candidateNodes.filter(n => !isNodeInAnyFrame(n))

    if (nodes.length === 0) return

    pushUndo()
    stopAnimation()

    // Calculate center
    let sumX = 0, sumY = 0
    for (const node of nodes) {
      sumX += node.canvas_x + (node.width || NODE_DEFAULTS.WIDTH) / 2
      sumY += node.canvas_y + (node.height || NODE_DEFAULTS.HEIGHT) / 2
    }
    const centerX = sumX / nodes.length
    const centerY = sumY / nodes.length

    // Prepare nodes and edges for strategy
    const layoutNodes: StrategyLayoutNode[] = nodes.map(n => ({
      id: n.id,
      x: n.canvas_x,
      y: n.canvas_y,
      width: n.width || NODE_DEFAULTS.WIDTH,
      height: n.height || NODE_DEFAULTS.HEIGHT,
    }))

    const edges = store.getFilteredEdges()
    const nodeIdSet = new Set(nodes.map(n => n.id))
    const layoutEdges: StrategyLayoutEdge[] = edges
      .filter(e => nodeIdSet.has(e.source_node_id) && nodeIdSet.has(e.target_node_id))
      .map(e => ({
        source: e.source_node_id,
        target: e.target_node_id,
      }))

    // Execute strategy
    const calculatedPositions = await strategy.calculate(layoutNodes, layoutEdges, {
      centerX,
      centerY,
    })

    // Build node map for frame collision detection
    const nodeMap = new Map(nodes.map(n => [n.id, { width: n.width, height: n.height }]))

    // Post-process: push nodes out of frames
    const positions = pushNodesOutOfFrames(calculatedPositions, nodeMap)

    // Apply positions
    const animate = options?.animate !== false
    const duration = options?.duration ?? 500

    if (animate && nodes.length <= 500) {
      animateToPositions(positions, duration)
    } else {
      await batchUpdatePositions(positions, store.updateNodePosition, 200)
    }
  }

  return {
    stopAnimation,
    animateToPositions,
    autoLayout,
    fitToContent,
    // Strategy pattern methods
    getAvailableLayouts,
    executeStrategy,
  }
}
