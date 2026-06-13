/**
 * Core auto-layout implementation
 * Handles grid, horizontal, vertical, force, and hierarchical layouts
 */
import { NODE_DEFAULTS } from '../../constants'
import { applyForceLayout, applyHierarchicalLayout } from '../../layout'
import { fastGridLayout, batchUpdatePositions } from '../../layout/fastGrid'
import { tetrisGridLayout } from './useTetrisLayout'
import {
  prepareFrameAwareLayout,
  processFrameAwareLayoutResults,
  type FrameAwareLayoutContext,
  type Node,
  type Edge,
  type Frame,
} from './useLayoutFrameAware'
import type { NodeSize } from './useFrameCollision'

export type LayoutType = 'grid' | 'horizontal' | 'vertical' | 'force' | 'hierarchical' | 'radial'

export interface AutoLayoutStore {
  getNodes: () => Node[]
  getFilteredNodes: () => Node[]
  getFilteredEdges: () => Edge[]
  getFilteredFrames: () => Frame[]
  getSelectedNodeIds: () => string[]
  updateNodePosition: (id: string, x: number, y: number) => void
  updateFramePosition: (id: string, x: number, y: number) => void
  updateFrameSize: (id: string, width: number, height: number) => void
}

export interface AutoLayoutOptions {
  store: AutoLayoutStore
  animateToPositions: (targets: Map<string, { x: number; y: number }>, duration?: number) => void
  applyFrameConstraints: (
    positions: Map<string, { x: number; y: number }>,
    nodes: Node[],
    targetFrame?: Frame
  ) => Map<string, { x: number; y: number }>
  pushOutOfFrames: (
    positions: Map<string, { x: number; y: number }>,
    nodeMap: Map<string, NodeSize>
  ) => Map<string, { x: number; y: number }>
  expandFramesToFitNodes: () => Promise<void>
}

/**
 * Execute auto-layout algorithm
 * Returns true if layout was applied, false if skipped (e.g., radial needs separate handling)
 */
export async function executeAutoLayout(
  layout: LayoutType,
  frameId: string | undefined,
  options: AutoLayoutOptions
): Promise<boolean> {
  const { store, animateToPositions, applyFrameConstraints, pushOutOfFrames, expandFramesToFitNodes } = options

  // Radial layout is handled separately (requires exactly one selected node)
  if (layout === 'radial') {
    return false
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
      return true
    }

    // Only include nodes explicitly assigned to this frame via frame_id
    // Do NOT use visual overlap - that creates inconsistent state and breaks undo
    nodes = allNodes.filter(n => n.frame_id === frameId)
  } else {
    nodes = selectedIds.length > 0
      ? allNodes.filter(n => selectedIds.includes(n.id))
      : allNodes
  }

  if (nodes.length === 0) return true

  // Thresholds for layout performance
  const FAST_GRID_THRESHOLD = 500  // Use fast grid algorithm above this
  const HUGE_THRESHOLD = 5000      // Warn but still try for huge graphs

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

    // Calculate appropriate gap for frame-scoped layouts
    let gap = 360
    if (targetFrame) {
      // Calculate gap to fit nodes within frame
      const padding = 30
      const availableWidth = targetFrame.width - 2 * padding
      const availableHeight = targetFrame.height - 2 * padding
      const avgWidth = fastNodes.reduce((s, n) => s + n.width, 0) / fastNodes.length
      const avgHeight = fastNodes.reduce((s, n) => s + n.height, 0) / fastNodes.length
      const cols = Math.ceil(Math.sqrt(nodes.length))
      const rows = Math.ceil(nodes.length / cols)
      // Gap that would fit nodes in available space
      const maxGapX = Math.max(8, (availableWidth - cols * avgWidth) / Math.max(1, cols - 1))
      const maxGapY = Math.max(8, (availableHeight - rows * avgHeight) / Math.max(1, rows - 1))
      gap = Math.min(maxGapX, maxGapY, 360) // Use smaller gap, capped at 360
    }

    const positions = fastGridLayout(fastNodes, {
      centerX,
      centerY,
      gap,
    })

    // Push nodes out of frames OR constrain to frame boundaries
    const finalPositions = applyFrameConstraints(positions, nodes, targetFrame)

    // Batch update positions to avoid blocking UI
    await batchUpdatePositions(finalPositions, store.updateNodePosition, 200)

    // After layout, ensure all framed nodes are inside their assigned frames
    await expandFramesToFitNodes()
    return true
  }

  // Warn for huge graphs but still allow force/hierarchical
  if (nodes.length > HUGE_THRESHOLD) {
    console.warn(`Very large graph (${nodes.length} nodes) - ${layout} layout may be slow`)
  }

  // Create frame map for lookups
  const frameMap = new Map(allFrames.map(f => [f.id, f]))

  // When frameId is provided, layout nodes inside that frame directly
  let virtualNodes: Node[]

  // Track which nodes belong to which frame
  const frameNodes = new Map<string, Node[]>() // frame_id -> nodes in that frame
  const unframedNodes: Node[] = []

  if (frameId) {
    // Layout nodes inside the selected frame
    virtualNodes = [...nodes]
  } else {
    // Group nodes by frame membership
    // Primary: use frame_id from database (authoritative)
    // Fallback: spatial check for nodes without frame_id (newly placed nodes)

    for (const node of nodes) {
      // frame_id is the ONLY source of truth for frame membership
      // NO spatial fallback - that creates non-deterministic behavior
      if (node.frame_id) {
        if (frameMap.has(node.frame_id)) {
          if (!frameNodes.has(node.frame_id)) {
            frameNodes.set(node.frame_id, [])
          }
          frameNodes.get(node.frame_id)!.push(node)
        }
        // Node with frame_id is always considered "framed" - skip layout
        continue
      }

      // No frame_id = unframed node = participates in layout
      unframedNodes.push(node)
    }
    // Only layout unframed nodes - nodes with frame_id stay fixed
    virtualNodes = [...unframedNodes]
  }

  // When no unframed nodes exist, lay out the FRAMES instead
  if (virtualNodes.length === 0 && frameNodes.size > 0) {
    await layoutFramesOnly(store, frameNodes, frameMap)
    return true
  }

  if (virtualNodes.length === 0) {
    return true
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
  const gridGap = 24 // Tight packing gap

  if (layout === 'force' || layout === 'hierarchical') {
    const edges = store.getFilteredEdges()

    // Use shared helpers for frame-aware layout preparation
    const ctx: FrameAwareLayoutContext = {
      virtualNodes,
      allFrames,
      frameNodes,
      frameId: frameId || null,
      centerX,
      centerY,
      nodes,
      targetFrame: targetFrame || null,
    }
    const { layoutNodes, layoutEdges, frameSnapshot } = prepareFrameAwareLayout(ctx, edges)

    // Execute the specific layout algorithm
    let positions: Map<string, { x: number; y: number }>

    if (layout === 'force') {
      // Scale iterations based on node count
      const n = layoutNodes.length
      const iterations = n > 2000 ? 30 : n > 1000 ? 50 : n > 500 ? 80 : n > 200 ? 100 : n > 100 ? 200 : 400
      positions = await applyForceLayout(layoutNodes, layoutEdges, {
        centerX,
        centerY,
        iterations,
      })
    } else {
      // For very large graphs, use simpler ranker
      const ranker = layoutNodes.length > 2000 ? 'longest-path' : 'network-simplex'

      // Use setTimeout to avoid blocking UI
      positions = await new Promise<Map<string, { x: number; y: number }>>((resolve) => {
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
    }

    // Use shared helper to process results (frame movement + frame expansion for frame-scoped layouts)
    const finalTargets = processFrameAwareLayoutResults(
      ctx,
      positions,
      frameSnapshot,
      store.updateFramePosition,
      pushOutOfFrames,
      store.updateFrameSize
    )

    // Apply positions with animation or batch update
    const animationDuration = layout === 'force' ? 800 : 600
    if (finalTargets.size > 500) {
      await batchUpdatePositions(finalTargets, store.updateNodePosition, 200)
      // After global layout, ensure all framed nodes are inside their assigned frames
      // Skip for frame-scoped layout since we expanded the frame to fit
      if (!frameId) {
        await expandFramesToFitNodes()
      }
    } else {
      animateToPositions(finalTargets, animationDuration)
      // After global layout, ensure all framed nodes are inside their assigned frames
      // Skip for frame-scoped layout since we expanded the frame to fit
      if (!frameId) {
        setTimeout(() => expandFramesToFitNodes(), animationDuration + 100)
      }
    }
    return true
  }

  const targets = new Map<string, { x: number; y: number }>()

  if (layout === 'grid') {
    const edges = store.getFilteredEdges()
    // Pass frame width constraint for frame-scoped layouts
    const containerWidth = targetFrame ? targetFrame.width - 60 : undefined // 60 = 2 * padding
    const trialTargets = tetrisGridLayout(virtualNodes, edges, 0, 0, gridGap, containerWidth)

    if (trialTargets.size === 0) {
      console.warn('Grid layout: no positions generated')
      return true
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

    for (const [id, pos] of trialTargets) {
      targets.set(id, { x: pos.x + offsetX, y: pos.y + offsetY })
    }
  } else if (layout === 'horizontal') {
    const sorted = [...virtualNodes].sort((a, b) => (b.height || NODE_DEFAULTS.HEIGHT) - (a.height || NODE_DEFAULTS.HEIGHT))
    const totalWidth = sorted.reduce((sum, n) => sum + (n.width || NODE_DEFAULTS.WIDTH) + gridGap, -gridGap)
    let x = centerX - totalWidth / 2
    const maxHeight = Math.max(...sorted.map(n => n.height || NODE_DEFAULTS.HEIGHT))

    for (const node of sorted) {
      const h = node.height || NODE_DEFAULTS.HEIGHT
      targets.set(node.id, { x, y: centerY - maxHeight / 2 + (maxHeight - h) / 2 })
      x += (node.width || NODE_DEFAULTS.WIDTH) + gridGap
    }
  } else if (layout === 'vertical') {
    const sorted = [...virtualNodes].sort((a, b) => (b.width || NODE_DEFAULTS.WIDTH) - (a.width || NODE_DEFAULTS.WIDTH))
    const totalHeight = sorted.reduce((sum, n) => sum + (n.height || NODE_DEFAULTS.HEIGHT) + gridGap, -gridGap)
    let y = centerY - totalHeight / 2
    const maxWidth = Math.max(...sorted.map(n => n.width || NODE_DEFAULTS.WIDTH))

    for (const node of sorted) {
      const w = node.width || NODE_DEFAULTS.WIDTH
      targets.set(node.id, { x: centerX - maxWidth / 2 + (maxWidth - w) / 2, y })
      y += (node.height || NODE_DEFAULTS.HEIGHT) + gridGap
    }
  }

  // Push nodes out of frames OR constrain to frame boundaries
  const finalTargets = applyFrameConstraints(targets, nodes, targetFrame)

  animateToPositions(finalTargets, 500)

  // After layout, ensure all framed nodes are inside their assigned frames
  // Use setTimeout to let animation complete first
  setTimeout(() => expandFramesToFitNodes(), 600)

  return true
}

/**
 * Layout only frames when no unframed nodes exist
 */
async function layoutFramesOnly(
  store: AutoLayoutStore,
  frameNodes: Map<string, Node[]>,
  frameMap: Map<string, Frame>
): Promise<void> {
  // Create virtual nodes representing frames
  const frameVirtualNodes: Node[] = []
  for (const [fid] of frameNodes) {
    const frame = frameMap.get(fid)
    if (frame) {
      frameVirtualNodes.push({
        id: fid,
        canvas_x: frame.canvas_x,
        canvas_y: frame.canvas_y,
        width: frame.width,
        height: frame.height,
      })
    }
  }

  if (frameVirtualNodes.length > 0) {
    // Calculate center of frames
    let sumX = 0, sumY = 0
    for (const vn of frameVirtualNodes) {
      sumX += vn.canvas_x + (vn.width || 400) / 2
      sumY += vn.canvas_y + (vn.height || 300) / 2
    }
    const frameCenterX = sumX / frameVirtualNodes.length
    const frameCenterY = sumY / frameVirtualNodes.length

    // Apply grid layout to frames
    const frameGap = 40
    const edges = store.getFilteredEdges()
    const frameTargets = tetrisGridLayout(frameVirtualNodes, edges, 0, 0, frameGap)

    // Center the layout
    if (frameTargets.size > 0) {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
      for (const vn of frameVirtualNodes) {
        const pos = frameTargets.get(vn.id)
        if (!pos) continue
        minX = Math.min(minX, pos.x)
        minY = Math.min(minY, pos.y)
        maxX = Math.max(maxX, pos.x + (vn.width || 400))
        maxY = Math.max(maxY, pos.y + (vn.height || 300))
      }
      const layoutCenterX = (minX + maxX) / 2
      const layoutCenterY = (minY + maxY) / 2
      const offsetX = frameCenterX - layoutCenterX
      const offsetY = frameCenterY - layoutCenterY

      // Move frames AND their nodes together (preserve relative positions)
      for (const [fid, pos] of frameTargets) {
        const frame = frameMap.get(fid)
        if (!frame) continue

        const newX = pos.x + offsetX
        const newY = pos.y + offsetY
        const deltaX = newX - frame.canvas_x
        const deltaY = newY - frame.canvas_y

        // Move the frame
        store.updateFramePosition(fid, newX, newY)

        // Move all nodes inside this frame by the same delta
        const nodesInThisFrame = frameNodes.get(fid) || []
        for (const node of nodesInThisFrame) {
          store.updateNodePosition(node.id, node.canvas_x + deltaX, node.canvas_y + deltaY)
        }
      }
    }
  }
}
