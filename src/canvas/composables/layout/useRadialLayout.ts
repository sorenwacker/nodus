/**
 * Radial/concentric layout algorithm
 * Places selected node at center with neighbors arranged in rings
 */
import { NODE_DEFAULTS } from '../../constants'
import { canvasStorage } from '../../../lib/storage'

export interface Node {
  id: string
  canvas_x: number
  canvas_y: number
  width?: number
  height?: number
  frame_id?: string | null
}

export interface Edge {
  id: string
  source_node_id: string
  target_node_id: string
}

export interface Frame {
  id: string
  canvas_x: number
  canvas_y: number
  width: number
  height: number
  title?: string
}

export interface RadialLayoutOptions {
  getSelectedNodeIds: () => string[]
  getNode: (id: string) => Node | undefined
  getFilteredNodes: () => Node[]
  getFilteredEdges: () => Edge[]
  getFilteredFrames: () => Frame[]
  applyFrameConstraints: (
    positions: Map<string, { x: number; y: number }>,
    nodes: Node[],
    targetFrame?: Frame
  ) => Map<string, { x: number; y: number }>
}

export interface RadialLayoutResult {
  targets: Map<string, { x: number; y: number }>
  zOrder: string[]
}

/**
 * Compute radial layout positions
 * Only affects nodes in the same frame context as the center node:
 * - If center is in a frame, only nodes in that same frame are moved
 * - If center is NOT in a frame, only unframed nodes are moved (framed nodes are NEVER touched)
 */
export function computeRadialLayout(options: RadialLayoutOptions): RadialLayoutResult | null {
  const {
    getSelectedNodeIds,
    getNode,
    getFilteredNodes,
    getFilteredEdges,
    getFilteredFrames,
    applyFrameConstraints,
  } = options

  const selectedIds = getSelectedNodeIds()
  if (selectedIds.length !== 1) {
    return null
  }

  const centerId = selectedIds[0]
  const centerNode = getNode(centerId)
  if (!centerNode) {
    return null
  }

  // Get all nodes and edges
  const allNodes = getFilteredNodes()
  const allEdges = getFilteredEdges()

  // frame_id is the ONLY source of truth - no spatial fallback
  const getNodeFrameId = (node: Node): string | null => {
    return node.frame_id || null
  }

  // Determine center node's frame (frame_id only)
  const centerFrameId = getNodeFrameId(centerNode)
  const centerIsFramed = !!centerFrameId

  // Filter nodes to only those that should be laid out (frame_id only)
  const nodesToLayout = allNodes.filter(n => {
    const nodeFrameId = getNodeFrameId(n)
    if (centerIsFramed) {
      // Center is in a frame - only include nodes in the SAME frame
      return nodeFrameId === centerFrameId
    } else {
      // Center is NOT in a frame - NEVER move nodes that are in any frame
      return !nodeFrameId
    }
  })
  const nodeIdsToLayout = new Set(nodesToLayout.map(n => n.id))

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

  // Find unconnected nodes that should be laid out (not reachable from center via BFS)
  // IMPORTANT: Only include nodes from nodesToLayout, not all nodes
  const unconnectedNodes = nodesToLayout.filter(n => !depths.has(n.id))
  if (unconnectedNodes.length > 0) {
    // Add them as an outer ring beyond maxDepth
    const outerDepth = maxDepth + 1
    levels.set(outerDepth, unconnectedNodes.map(n => n.id))
    for (const node of unconnectedNodes) {
      depths.set(node.id, outerDepth)
    }
    maxDepth = outerDepth
  }

  // Track angles assigned to each node for parent-based sorting
  const nodeAngles = new Map<string, number>()

  // Use center node's current position as layout center
  const centerX = centerNode.canvas_x + (centerNode.width || NODE_DEFAULTS.WIDTH) / 2
  const centerY = centerNode.canvas_y + (centerNode.height || NODE_DEFAULTS.HEIGHT) / 2

  // Get radial style setting
  const radialStyle = canvasStorage.getRadialStyle()
  const isCompact = radialStyle === 'compact'

  // Calculate positions for each level
  const targets = new Map<string, { x: number; y: number }>()
  // Adjust ring distance based on style - compact has tighter rings with overlap allowed
  // Both baseRadius and minNodeSpacing scale with style to make difference visible even with many nodes
  const firstRingRadius = isCompact ? 300 : 500 // Minimum distance from center to first ring
  const baseRadius = isCompact ? 150 : 400 // Distance between subsequent rings
  const minNodeSpacing = isCompact ? 80 : 280 // Spacing between nodes on a ring (must exceed node width ~200px for spacious)
  const maxRadius = 50000 // Cap radius for reasonable layout size
  const ringSpacing = isCompact ? 180 : 400 // Spacing between sub-rings when splitting large levels

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
    // First ring uses firstRingRadius, subsequent rings use baseRadius spacing
    const ringDistance = depth === 1 ? firstRingRadius : baseRadius
    const minRadius = lastUsedRadius + ringDistance
    const depthRadius = Math.max(depth === 1 ? firstRingRadius : depth * baseRadius, minRadius)

    // Calculate how many nodes can fit at the max radius
    const maxNodesPerRing = Math.floor((2 * Math.PI * maxRadius) / minNodeSpacing)
    const nodeCount = nodesAtDepth.length

    if (nodeCount > maxNodesPerRing) {
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

          // Only move nodes that should be laid out (skip nodes in other frames)
          if (!nodeIdsToLayout.has(nodeId)) continue

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

        // Only move nodes that should be laid out (skip nodes in other frames)
        if (!nodeIdsToLayout.has(nodeId)) continue

        const x = centerX + Math.cos(angle) * adjustedRadius - (node.width || NODE_DEFAULTS.WIDTH) / 2
        const y = centerY + Math.sin(angle) * adjustedRadius - (node.height || NODE_DEFAULTS.HEIGHT) / 2

        targets.set(nodeId, { x: Math.round(x), y: Math.round(y) })
      }
    }
  }

  // Constrain to frame OR push out of frames
  const targetFrame = centerFrameId
    ? getFilteredFrames().find(f => f.id === centerFrameId)
    : undefined
  const finalTargets = applyFrameConstraints(targets, allNodes, targetFrame)

  // Build z-order based on angles (angle increases clockwise from top)
  // Nodes with higher angles should render on top
  const angleOrder: Array<{ id: string; angle: number }> = []
  for (const [nodeId, angle] of nodeAngles) {
    angleOrder.push({ id: nodeId, angle })
  }
  // Sort by angle (ascending) so higher angles get higher z-index
  angleOrder.sort((a, b) => a.angle - b.angle)
  const zOrder = angleOrder.map(item => item.id)

  return { targets: finalTargets, zOrder }
}
