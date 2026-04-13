/**
 * Layout composable
 * Handles node layout algorithms and animations
 */
import { type Ref } from 'vue'
import { NODE_DEFAULTS } from '../../constants'
import { applyForceLayout, applyHierarchicalLayout, layoutRegistry } from '../../layout'
import { fastGridLayout, batchUpdatePositions } from '../../layout/fastGrid'
import type { LayoutNode as StrategyLayoutNode, LayoutEdge as StrategyLayoutEdge } from '../../layout/types'
import {
  pushNodesOutOfFrames,
  constrainNodesToFrame,
  isNodeInFrame,
  type FrameRect,
  type NodeSize,
} from './useFrameCollision'
import {
  createLayoutAnimator,
  animateToPositions as animatePositions,
} from './useLayoutAnimation'
import { tetrisGridLayout } from './useTetrisLayout'
import { canvasStorage } from '../../../lib/storage'

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
  canvas_x: number
  canvas_y: number
  width: number
  height: number
  title?: string
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

  // Animation state
  const animationState = createLayoutAnimator()

  function stopAnimation() {
    animationState.stop()
  }

  function animateToPositions(targets: Map<string, { x: number; y: number }>, duration = 400) {
    animatePositions(
      targets,
      (id: string) => {
        const node = store.getNodes().find(n => n.id === id)
        return node ? { x: node.canvas_x, y: node.canvas_y } : null
      },
      store.updateNodePosition,
      animationState,
      duration
    )
  }

  // Helper to get frames for collision detection
  function getFramesForCollision(): FrameRect[] {
    return store.getFilteredFrames()
  }

  // Wrapper for pushNodesOutOfFrames that gets frames from store
  function pushOutOfFrames(
    positions: Map<string, { x: number; y: number }>,
    nodeMap: Map<string, NodeSize>
  ): Map<string, { x: number; y: number }> {
    return pushNodesOutOfFrames(positions, nodeMap, getFramesForCollision())
  }

  /**
   * Radial/concentric layout - places selected node at center with neighbors in rings
   */
  async function radialLayout(): Promise<void> {
    const selectedIds = store.getSelectedNodeIds()
    console.log('[RadialLayout] selectedIds:', selectedIds.length, selectedIds)
    if (selectedIds.length !== 1) {
      console.log('[RadialLayout] SKIPPING - need exactly 1 selected node, got:', selectedIds.length)
      return
    }

    const centerId = selectedIds[0]
    const allNodes = store.getFilteredNodes()
    const allEdges = store.getFilteredEdges()

    // Build adjacency map
    const adjacency = new Map<string, Set<string>>()
    for (const node of allNodes) {
      adjacency.set(node.id, new Set())
    }
    for (const edge of allEdges) {
      adjacency.get(edge.source_node_id)?.add(edge.target_node_id)
      adjacency.get(edge.target_node_id)?.add(edge.source_node_id)
    }

    // BFS to find all connected nodes and their depths, tracking parent for sorting
    const depths = new Map<string, number>()
    const parents = new Map<string, string>() // Track which node led to this one
    const queue: string[] = [centerId]
    depths.set(centerId, 0)

    while (queue.length > 0) {
      const nodeId = queue.shift()!
      const currentDepth = depths.get(nodeId)!
      const neighbors = adjacency.get(nodeId) || new Set()

      for (const neighborId of neighbors) {
        if (!depths.has(neighborId)) {
          depths.set(neighborId, currentDepth + 1)
          parents.set(neighborId, nodeId)
          queue.push(neighborId)
        }
      }
    }

    // Group nodes by depth level
    const levels = new Map<number, string[]>()
    let maxDepth = 0
    for (const [nodeId, depth] of depths) {
      if (!levels.has(depth)) {
        levels.set(depth, [])
      }
      levels.get(depth)!.push(nodeId)
      maxDepth = Math.max(maxDepth, depth)
    }

    // Find unconnected nodes (not reachable from center via BFS)
    const unconnectedNodes = allNodes.filter(n => !depths.has(n.id))
    if (unconnectedNodes.length > 0) {
      // Add them as an outer ring beyond maxDepth
      const outerDepth = maxDepth + 1
      levels.set(outerDepth, unconnectedNodes.map(n => n.id))
      for (const node of unconnectedNodes) {
        depths.set(node.id, outerDepth)
      }
      maxDepth = outerDepth
      console.log('[RadialLayout] unconnected nodes placed in outer ring:', unconnectedNodes.length)
    }

    // Track angles assigned to each node for parent-based sorting
    const nodeAngles = new Map<string, number>()

    // Get center node position
    const centerNode = allNodes.find(n => n.id === centerId)
    if (!centerNode) return

    const centerX = centerNode.canvas_x + (centerNode.width || NODE_DEFAULTS.WIDTH) / 2
    const centerY = centerNode.canvas_y + (centerNode.height || NODE_DEFAULTS.HEIGHT) / 2

    pushUndo()
    stopAnimation()

    // Get radial style setting
    const radialStyle = canvasStorage.getRadialStyle()
    const isCompact = radialStyle === 'compact'
    console.log('[RadialLayout] style:', radialStyle, 'isCompact:', isCompact)
    console.log('[RadialLayout] nodes found via BFS:', depths.size, 'maxDepth:', maxDepth)
    // Log nodes per depth level
    for (let d = 0; d <= maxDepth; d++) {
      const nodesAtD = levels.get(d) || []
      console.log(`[RadialLayout] depth ${d}: ${nodesAtD.length} nodes`)
    }

    // Calculate positions for each level
    const targets = new Map<string, { x: number; y: number }>()
    // Adjust ring distance based on style - compact has tighter rings with overlap allowed
    // Both baseRadius and minNodeSpacing scale with style to make difference visible even with many nodes
    const baseRadius = isCompact ? 250 : 600 // Distance between rings
    const minNodeSpacing = isCompact ? 80 : 280 // Spacing between nodes on a ring (compact allows overlap)
    console.log('[RadialLayout] baseRadius:', baseRadius, 'minNodeSpacing:', minNodeSpacing)
    const maxRadius = 50000 // Cap radius to avoid extreme coordinates (increased to fit more nodes per ring)
    const ringSpacing = isCompact ? 280 : 500 // Spacing between sub-rings when splitting large levels

    let lastUsedRadius = 0 // Track the actual radius used by the previous ring

    for (let depth = 0; depth <= maxDepth; depth++) {
      let nodesAtDepth = levels.get(depth) || []

      if (depth === 0) {
        // Center node stays in place
        targets.set(centerId, { x: centerNode.canvas_x, y: centerNode.canvas_y })
        nodeAngles.set(centerId, 0)
        continue
      }

      // Sort nodes by their parent's angle to keep related nodes together
      nodesAtDepth = [...nodesAtDepth].sort((a, b) => {
        const parentA = parents.get(a)
        const parentB = parents.get(b)
        const angleA = parentA ? (nodeAngles.get(parentA) ?? 0) : 0
        const angleB = parentB ? (nodeAngles.get(parentB) ?? 0) : 0
        return angleA - angleB
      })

      // Calculate base radius for this depth - ensure it's beyond the previous ring
      const minRadius = lastUsedRadius + baseRadius
      const depthRadius = Math.max(depth * baseRadius, minRadius)
      console.log(`[RadialLayout] depth ${depth}: depthRadius=${depthRadius}, lastUsedRadius=${lastUsedRadius}`)

      // Calculate how many nodes can fit at the max radius
      const maxNodesPerRing = Math.floor((2 * Math.PI * maxRadius) / minNodeSpacing)
      const nodeCount = nodesAtDepth.length

      if (nodeCount > maxNodesPerRing) {
        console.log(`[RadialLayout] depth ${depth}: SPLITTING into ${Math.ceil(nodeCount / maxNodesPerRing)} sub-rings`)
        // Split into multiple rings
        const numRings = Math.ceil(nodeCount / maxNodesPerRing)
        let nodeIndex = 0

        for (let ring = 0; ring < numRings; ring++) {
          const ringRadius = depthRadius + ring * ringSpacing
          const nodesInThisRing = Math.min(maxNodesPerRing, nodeCount - nodeIndex)
          const angleStep = (2 * Math.PI) / nodesInThisRing
          const startAngle = -Math.PI / 2 + (ring * 0.1) // Slight offset for each ring

          for (let i = 0; i < nodesInThisRing && nodeIndex < nodeCount; i++, nodeIndex++) {
            const nodeId = nodesAtDepth[nodeIndex]
            const node = allNodes.find(n => n.id === nodeId)
            if (!node) continue

            const angle = startAngle + i * angleStep
            nodeAngles.set(nodeId, angle)
            const x = centerX + Math.cos(angle) * ringRadius - (node.width || NODE_DEFAULTS.WIDTH) / 2
            const y = centerY + Math.sin(angle) * ringRadius - (node.height || NODE_DEFAULTS.HEIGHT) / 2

            targets.set(nodeId, { x: Math.round(x), y: Math.round(y) })
          }
        }
        // Track the outermost ring radius used
        lastUsedRadius = depthRadius + (numRings - 1) * ringSpacing
      } else {
        // Normal case - all nodes fit on one ring
        // Calculate if we need to expand the radius to fit all nodes
        const circumference = 2 * Math.PI * depthRadius
        const requiredCircumference = nodeCount * minNodeSpacing
        const adjustedRadius = requiredCircumference > circumference
          ? Math.min(requiredCircumference / (2 * Math.PI), maxRadius)
          : depthRadius
        console.log(`[RadialLayout] depth ${depth}: adjustedRadius=${Math.round(adjustedRadius)} (${nodeCount} nodes need ${Math.round(requiredCircumference)}px circumference)`)

        // Track the radius used for this ring
        lastUsedRadius = adjustedRadius

        const angleStep = (2 * Math.PI) / nodeCount
        const startAngle = -Math.PI / 2 // Start from top

        for (let i = 0; i < nodeCount; i++) {
          const nodeId = nodesAtDepth[i]
          const node = allNodes.find(n => n.id === nodeId)
          if (!node) continue

          const angle = startAngle + i * angleStep
          nodeAngles.set(nodeId, angle)
          const x = centerX + Math.cos(angle) * adjustedRadius - (node.width || NODE_DEFAULTS.WIDTH) / 2
          const y = centerY + Math.sin(angle) * adjustedRadius - (node.height || NODE_DEFAULTS.HEIGHT) / 2

          targets.set(nodeId, { x: Math.round(x), y: Math.round(y) })
        }
      }
    }

    // Animate to positions
    console.log('[RadialLayout] targets to animate:', targets.size)
    if (targets.size > 200) {
      await batchUpdatePositions(targets, store.updateNodePosition, 100)
    } else {
      animateToPositions(targets, 600)
    }
  }

  async function autoLayout(layout: 'grid' | 'horizontal' | 'vertical' | 'force' | 'hierarchical' | 'radial' = 'grid', frameId?: string) {

    // Radial layout is handled separately (requires exactly one selected node)
    if (layout === 'radial') {
      await radialLayout()
      return
    }

    const selectedIds = store.getSelectedNodeIds()
    const allNodes = store.getFilteredNodes()
    const allFrames = store.getFilteredFrames()

    // If frameId is provided, only layout nodes inside that frame
    let nodes: Node[]
    let targetFrame: Frame | undefined

    if (frameId) {
      targetFrame = allFrames.find(f => f.id === frameId)
      if (!targetFrame) {
        return
      }

      // Helper to check if a node is inside the target frame (explicit frame_id or 50%+ overlap)
      const isNodeInTargetFrame = (node: Node): boolean => {
        if (node.frame_id === frameId) return true
        const nodeWidth = node.width || NODE_DEFAULTS.WIDTH
        const nodeHeight = node.height || NODE_DEFAULTS.HEIGHT
        return isNodeInFrame(node.canvas_x, node.canvas_y, nodeWidth, nodeHeight, targetFrame!)
      }

      nodes = allNodes.filter(n => isNodeInTargetFrame(n))
    } else {
      nodes = selectedIds.length > 0
        ? allNodes.filter(n => selectedIds.includes(n.id))
        : allNodes
    }

    if (nodes.length === 0) return

    // Thresholds for layout performance
    const FAST_GRID_THRESHOLD = 500  // Use fast grid algorithm above this
    const HUGE_THRESHOLD = 5000      // Warn but still try for huge graphs

    pushUndo()
    stopAnimation()

    // Fast path for grid layout with large node sets
    if (layout === 'grid' && nodes.length > FAST_GRID_THRESHOLD) {

      // Calculate center - use frame center if frame-scoped
      let centerX: number, centerY: number
      if (targetFrame) {
        centerX = targetFrame.canvas_x + targetFrame.width / 2
        centerY = targetFrame.canvas_y + targetFrame.height / 2
      } else {
        let sumX = 0, sumY = 0
        for (const node of nodes) {
          sumX += node.canvas_x
          sumY += node.canvas_y
        }
        centerX = sumX / nodes.length
        centerY = sumY / nodes.length
      }

      // Use optimized fast grid with typed arrays
      const fastNodes = nodes.map(n => ({
        id: n.id,
        width: n.width || NODE_DEFAULTS.WIDTH,
        height: n.height || NODE_DEFAULTS.HEIGHT,
      }))

      const positions = fastGridLayout(fastNodes, {
        centerX,
        centerY,
        gap: 360,
      })

      // Push nodes out of frames OR constrain to frame boundaries
      const nodeMap = new Map(nodes.map(n => [n.id, { width: n.width, height: n.height }]))
      const finalPositions = targetFrame
        ? constrainNodesToFrame(positions, nodeMap, targetFrame)
        : pushOutOfFrames(positions, nodeMap)

      // Batch update positions to avoid blocking UI
      await batchUpdatePositions(finalPositions, store.updateNodePosition, 200)
      return
    }

    // Warn for huge graphs but still allow force/hierarchical
    if (nodes.length > HUGE_THRESHOLD) {
      console.warn(`Very large graph (${nodes.length} nodes) - ${layout} layout may be slow`)
    }

    // Helper to check if a node is spatially inside a frame (50%+ overlap)
    const checkNodeInFrame = (node: Node, frame: Frame): boolean => {
      const nodeWidth = node.width || NODE_DEFAULTS.WIDTH
      const nodeHeight = node.height || NODE_DEFAULTS.HEIGHT
      return isNodeInFrame(node.canvas_x, node.canvas_y, nodeWidth, nodeHeight, frame)
    }

    // Create frame map first for spatial checks
    const frameMap = new Map(allFrames.map(f => [f.id, f]))

    // When frameId is provided, layout nodes inside that frame directly
    // (don't filter them out as "framed nodes")
    let virtualNodes: Node[]

    if (frameId) {
      // Layout nodes inside the selected frame
      virtualNodes = [...nodes]
    } else {
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
          if (checkNodeInFrame(node, frame)) {
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
      virtualNodes = [...unframedNodes]
    }

    // Skip frames entirely - they don't participate in layout
    // (Previously we created virtual nodes for frames and moved them as units)

    if (virtualNodes.length === 0) {
      return
    }

    // Calculate layout center
    let centerX: number, centerY: number
    if (targetFrame) {
      // Use frame center for frame-scoped layout
      centerX = targetFrame.canvas_x + targetFrame.width / 2
      centerY = targetFrame.canvas_y + targetFrame.height / 2
    } else {
      // Use nodes' center for global layout
      let sumX = 0, sumY = 0
      for (const node of virtualNodes) {
        sumX += node.canvas_x + (node.width || NODE_DEFAULTS.WIDTH) / 2
        sumY += node.canvas_y + (node.height || NODE_DEFAULTS.HEIGHT) / 2
      }
      centerX = sumX / virtualNodes.length
      centerY = sumY / virtualNodes.length
    }

    // Gap between nodes in grid layout
    const gridGap = 360

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

      // Push nodes out of frames OR constrain to frame boundaries
      const nodeMap = new Map(nodes.map(n => [n.id, { width: n.width, height: n.height }]))
      const finalTargets = targetFrame
        ? constrainNodesToFrame(nodeTargets, nodeMap, targetFrame)
        : pushOutOfFrames(nodeTargets, nodeMap)

      // For large graphs, use batch updates instead of animation (much faster)
      if (virtualNodes.length > 500) {
        await batchUpdatePositions(finalTargets, store.updateNodePosition, 200)
      } else {
        animateToPositions(finalTargets, 800)
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

      // For very large graphs, use simpler ranker
      const ranker = virtualNodes.length > 2000 ? 'longest-path' : 'network-simplex'

      // Use requestIdleCallback or setTimeout to avoid blocking UI
      const positions = await new Promise<Map<string, { x: number; y: number }>>((resolve) => {
        // Give the UI a chance to update before heavy computation
        setTimeout(() => {
          const result = applyHierarchicalLayout(layoutNodes, layoutEdges, {
            direction: 'TB',
            nodeSpacingX: 150,
            nodeSpacingY: 360,
            centerX,
            centerY,
            ranker,
          })
          resolve(result)
        }, 10)
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

      // Push nodes out of frames OR constrain to frame boundaries
      const nodeMap = new Map(nodes.map(n => [n.id, { width: n.width, height: n.height }]))
      const finalTargets = targetFrame
        ? constrainNodesToFrame(nodeTargets, nodeMap, targetFrame)
        : pushOutOfFrames(nodeTargets, nodeMap)

      // For large graphs, use batch updates instead of animation (much faster)
      if (virtualNodes.length > 500) {
        await batchUpdatePositions(finalTargets, store.updateNodePosition, 200)
      } else {
        animateToPositions(finalTargets, 600)
      }
      return
    }

    const targets = new Map<string, { x: number; y: number }>()

    if (layout === 'grid') {
      const edges = store.getFilteredEdges()
      const trialTargets = tetrisGridLayout(virtualNodes, edges, 0, 0, gridGap)

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
    } else if (layout === 'horizontal') {
      const sorted = [...virtualNodes].sort((a, b) => (b.height || NODE_DEFAULTS.HEIGHT) - (a.height || NODE_DEFAULTS.HEIGHT))
      const totalWidth = sorted.reduce((sum, n) => sum + (n.width || NODE_DEFAULTS.WIDTH) + gridGap, -gridGap)
      let x = centerX - totalWidth / 2
      const maxHeight = Math.max(...sorted.map(n => n.height || NODE_DEFAULTS.HEIGHT))

      const virtualTargets = new Map<string, { x: number; y: number }>()
      for (const node of sorted) {
        const h = node.height || NODE_DEFAULTS.HEIGHT
        virtualTargets.set(node.id, { x, y: centerY - maxHeight / 2 + (maxHeight - h) / 2 })
        x += (node.width || NODE_DEFAULTS.WIDTH) + gridGap
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
      const totalHeight = sorted.reduce((sum, n) => sum + (n.height || NODE_DEFAULTS.HEIGHT) + gridGap, -gridGap)
      let y = centerY - totalHeight / 2
      const maxWidth = Math.max(...sorted.map(n => n.width || NODE_DEFAULTS.WIDTH))

      const virtualTargets = new Map<string, { x: number; y: number }>()
      for (const node of sorted) {
        const w = node.width || NODE_DEFAULTS.WIDTH
        virtualTargets.set(node.id, { x: centerX - maxWidth / 2 + (maxWidth - w) / 2, y })
        y += (node.height || NODE_DEFAULTS.HEIGHT) + gridGap
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

    // Push nodes out of frames OR constrain to frame boundaries
    const nodeMap = new Map(nodes.map(n => [n.id, { width: n.width, height: n.height }]))
    const finalTargets = targetFrame
      ? constrainNodesToFrame(targets, nodeMap, targetFrame)
      : pushOutOfFrames(targets, nodeMap)

    animateToPositions(finalTargets, 500)
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
    const positions = pushOutOfFrames(calculatedPositions, nodeMap)

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
    radialLayout,
    fitToContent,
    // Strategy pattern methods
    getAvailableLayouts,
    executeStrategy,
  }
}
