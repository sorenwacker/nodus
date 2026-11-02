/**
 * Node layout composable
 * Handles force-directed layout and collision detection for nodes
 */

import { applyForceLayout } from '../canvas/layout'
import { pushOverlappingNodes as pushNodesApart } from '../lib/nodeCollision'
import type { Node, Edge } from '../types'

export interface NodeLayoutDeps {
  getNodes: () => Node[]
  getFilteredNodes: () => Node[]
  getFilteredEdges: () => Edge[]
  updateNodePosition: (id: string, x: number, y: number) => Promise<void>
  updateNodeSize: (id: string, width: number, height: number) => Promise<void>
  incrementLayoutVersion: () => void
}

export interface LayoutOptions {
  centerX?: number
  centerY?: number
  chargeStrength?: number
  linkDistance?: number
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
      // Through the injected collaborator, like every other move in this file.
      // Mutating the node and calling invoke here skipped the store's own path
      // (PRODUCT_DESIGN.md > Depending on what is supplied)
      updatePosition: (id, x, y) => {
        void deps.updateNodePosition(id, x, y)
      },
    })
  }

  /**
   * Apply force-directed layout to all nodes or a subset
   */
  async function layoutNodes(nodeIds?: string[], options?: LayoutOptions) {
    const filteredNodes = deps.getFilteredNodes()
    const targetNodes = nodeIds ? filteredNodes.filter(n => nodeIds.includes(n.id)) : filteredNodes
    if (targetNodes.length === 0) return

    const layoutNodesList = targetNodes.map(n => ({
      id: n.id,
      x: n.canvas_x,
      y: n.canvas_y,
      width: n.width || 200,
      height: n.height || 120,
    }))

    // Centroid of the nodes being laid out
    const centerX = layoutNodesList.reduce((sum, n) => sum + n.x, 0) / layoutNodesList.length
    const centerY = layoutNodesList.reduce((sum, n) => sum + n.y, 0) / layoutNodesList.length

    const layoutNodeIds = new Set(targetNodes.map(n => n.id))
    const layoutEdges = deps.getFilteredEdges()
      .filter(e => layoutNodeIds.has(e.source_node_id) && layoutNodeIds.has(e.target_node_id))
      .map(e => ({
        source: e.source_node_id,
        target: e.target_node_id,
      }))

    // Adaptive iterations based on graph size
    const nodeCount = layoutNodesList.length
    const iterations = nodeCount > 300 ? 150 : nodeCount > 100 ? 250 : 400

    const positions = await applyForceLayout(layoutNodesList, layoutEdges, {
      centerX: options?.centerX ?? centerX,
      centerY: options?.centerY ?? centerY,
      chargeStrength: options?.chargeStrength,
      linkDistance: options?.linkDistance,
      iterations,
    })

    await Promise.all([...positions].map(([id, pos]) => deps.updateNodePosition(id, pos.x, pos.y)))
    deps.incrementLayoutVersion()
  }

  return {
    layoutNodes,
    pushOverlappingNodes,
  }
}
