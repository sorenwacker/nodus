/**
 * Node layout composable
 * Handles force-directed layout and collision detection for nodes
 */

import { applyForceLayout } from '../canvas/layout'
import { pushOverlappingNodes as pushNodesApart } from '../lib/nodeCollision'
import { invoke } from '../lib/tauri'
import type { Node, Edge, Frame } from '../types'

export interface NodeLayoutDeps {
  getNodes: () => Node[]
  getFilteredNodes: () => Node[]
  getFilteredEdges: () => Edge[]
  getFilteredFrames: () => Frame[]
  updateNodePosition: (id: string, x: number, y: number) => Promise<void>
  updateNodeSize: (id: string, width: number, height: number) => Promise<void>
  incrementLayoutVersion: () => void
}

export interface LayoutOptions {
  centerX?: number
  centerY?: number
  chargeStrength?: number
  linkDistance?: number
  frameId?: string
  fitToFrame?: boolean
}

export function useNodeLayout(deps: NodeLayoutDeps) {
  /**
   * Push nodes that overlap with the given node away (ripples through graph)
   */
  function pushOverlappingNodes(sourceNode: Node) {
    const collisionNode = {
      id: sourceNode.id,
      canvas_x: sourceNode.canvas_x,
      canvas_y: sourceNode.canvas_y,
      width: sourceNode.width || 200,
      height: sourceNode.height || 120,
      workspace_id: sourceNode.workspace_id,
    }

    const collisionNodes = deps.getNodes().map(n => ({
      id: n.id,
      canvas_x: n.canvas_x,
      canvas_y: n.canvas_y,
      width: n.width || 200,
      height: n.height || 120,
      workspace_id: n.workspace_id,
    }))

    pushNodesApart(collisionNode, {
      nodes: collisionNodes,
      updatePosition: (id, x, y) => {
        const node = deps.getNodes().find(n => n.id === id)
        if (node) {
          node.canvas_x = x
          node.canvas_y = y
          node.updated_at = Date.now()
          invoke('update_node_position', { id, x, y })
            .catch(e => console.error('Failed to update pushed node position:', e))
        }
      },
    })
  }

  /**
   * Apply force-directed layout to all nodes or a subset
   * When frameId is provided, layout only nodes inside that frame
   * Otherwise, nodes inside frames are excluded from layout
   */
  async function layoutNodes(nodeIds?: string[], options?: LayoutOptions) {
    const frameId = options?.frameId
    const fitToFrame = options?.fitToFrame ?? true
    const filteredNodes = deps.getFilteredNodes()
    const filteredFrames = deps.getFilteredFrames()
    const filteredEdges = deps.getFilteredEdges()

    // Helper to check if a node is inside a specific frame (50%+ overlap)
    const isNodeInSpecificFrame = (node: Node, frame: Frame): boolean => {
      if (node.frame_id === frame.id) return true

      const nodeWidth = node.width || 200
      const nodeHeight = node.height || 120
      const nodeArea = nodeWidth * nodeHeight

      const overlapX = Math.max(0,
        Math.min(node.canvas_x + nodeWidth, frame.canvas_x + frame.width) -
        Math.max(node.canvas_x, frame.canvas_x))
      const overlapY = Math.max(0,
        Math.min(node.canvas_y + nodeHeight, frame.canvas_y + frame.height) -
        Math.max(node.canvas_y, frame.canvas_y))
      return overlapX * overlapY > nodeArea * 0.5
    }

    // Helper to check if a node is inside any frame
    const isNodeInAnyFrame = (node: Node): boolean => {
      for (const frame of filteredFrames) {
        if (isNodeInSpecificFrame(node, frame)) return true
      }
      return false
    }

    let targetNodes: Node[]
    let targetFrame: Frame | undefined

    if (frameId) {
      // Frame-scoped layout: only nodes inside the selected frame
      targetFrame = filteredFrames.find(f => f.id === frameId)
      if (!targetFrame) {
        return
      }

      targetNodes = filteredNodes.filter(n => isNodeInSpecificFrame(n, targetFrame!))
    } else {
      // Canvas layout: exclude nodes inside frames
      const allTargetNodes = nodeIds
        ? filteredNodes.filter(n => nodeIds.includes(n.id))
        : filteredNodes

      targetNodes = allTargetNodes.filter(n => !isNodeInAnyFrame(n))
    }

    if (targetNodes.length === 0) return

    const layoutNodesList = targetNodes.map(n => ({
      id: n.id,
      x: n.canvas_x,
      y: n.canvas_y,
      width: n.width || 200,
      height: n.height || 120,
    }))

    // Calculate layout center
    let centerX: number, centerY: number

    if (targetFrame) {
      // Center within frame
      centerX = targetFrame.canvas_x + targetFrame.width / 2
      centerY = targetFrame.canvas_y + targetFrame.height / 2
    } else {
      // Use centroid of nodes being laid out
      centerX = layoutNodesList.reduce((sum, n) => sum + n.x, 0) / layoutNodesList.length
      centerY = layoutNodesList.reduce((sum, n) => sum + n.y, 0) / layoutNodesList.length
    }

    // Get edges between target nodes
    const layoutNodeIds = new Set(targetNodes.map(n => n.id))
    const layoutEdges = filteredEdges
      .filter(e => layoutNodeIds.has(e.source_node_id) && layoutNodeIds.has(e.target_node_id))
      .map(e => ({
        source: e.source_node_id,
        target: e.target_node_id,
      }))

    // Adaptive iterations based on graph size
    const nodeCount = layoutNodesList.length
    const iterations = nodeCount > 300 ? 150 : nodeCount > 100 ? 250 : 400

    // Adjust charge and link distance for frame-scoped layout
    let chargeStrength = options?.chargeStrength
    let linkDistance = options?.linkDistance

    if (targetFrame && !chargeStrength && !linkDistance) {
      // Tighter layout for frame-scoped
      const frameArea = targetFrame.width * targetFrame.height
      const nodeArea = nodeCount * 200 * 120 // Approximate average node size
      const density = nodeArea / frameArea

      // Stronger repulsion and shorter links for denser layouts
      chargeStrength = density > 0.5 ? -200 : -300
      linkDistance = density > 0.5 ? 80 : 120
    }

    const positions = await applyForceLayout(layoutNodesList, layoutEdges, {
      centerX: options?.centerX ?? centerX,
      centerY: options?.centerY ?? centerY,
      chargeStrength,
      linkDistance,
      iterations,
    })

    // If frame-scoped, constrain positions to frame bounds and optionally resize nodes
    if (targetFrame && fitToFrame) {
      const padding = 30
      const frameLeft = targetFrame.canvas_x + padding
      const frameTop = targetFrame.canvas_y + padding + 30 // Extra space for title
      const frameRight = targetFrame.canvas_x + targetFrame.width - padding
      const frameBottom = targetFrame.canvas_y + targetFrame.height - padding

      // Calculate available space and optimal node size
      const availableWidth = frameRight - frameLeft
      const availableHeight = frameBottom - frameTop
      const cols = Math.ceil(Math.sqrt(nodeCount * availableWidth / availableHeight))
      const rows = Math.ceil(nodeCount / cols)

      const nodeWidth = Math.min(200, Math.max(100, (availableWidth - (cols - 1) * 20) / cols))
      const nodeHeight = Math.min(120, Math.max(60, (availableHeight - (rows - 1) * 20) / rows))

      // Resize nodes and constrain positions
      const updates: Promise<void>[] = []
      for (const [id, pos] of positions) {
        // Constrain position to frame bounds
        const constrainedX = Math.max(frameLeft, Math.min(frameRight - nodeWidth, pos.x))
        const constrainedY = Math.max(frameTop, Math.min(frameBottom - nodeHeight, pos.y))

        updates.push(deps.updateNodePosition(id, constrainedX, constrainedY))
        updates.push(deps.updateNodeSize(id, nodeWidth, nodeHeight))
      }
      await Promise.all(updates)
    } else {
      // Standard position update
      const updates: Promise<void>[] = []
      for (const [id, pos] of positions) {
        updates.push(deps.updateNodePosition(id, pos.x, pos.y))
      }
      await Promise.all(updates)
    }

    deps.incrementLayoutVersion()
  }

  return {
    layoutNodes,
    pushOverlappingNodes,
  }
}
