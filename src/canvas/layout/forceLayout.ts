/**
 * Force-directed layout using d3-force
 * Arranges nodes based on their connections for natural visualization
 */
import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCollide,
  forceX,
  forceY,
  type Simulation,
  type SimulationNodeDatum,
  type SimulationLinkDatum,
} from 'd3-force'

export interface LayoutNode {
  id: string
  x: number
  y: number
  width: number
  height: number
}

export interface LayoutEdge {
  source: string
  target: string
}

export interface ForceLayoutOptions {
  /** Center X coordinate */
  centerX?: number
  /** Center Y coordinate */
  centerY?: number
  /** Repulsion strength between nodes (negative = repel) */
  chargeStrength?: number
  /** Distance for links */
  linkDistance?: number
  /** Collision radius multiplier */
  collisionMultiplier?: number
  /** Number of simulation ticks */
  iterations?: number
  /** Gravity strength - pulls nodes towards center (0 = none, 1 = strong) */
  gravityStrength?: number
  /** Callback for each tick (for animation) */
  onTick?: (nodes: LayoutNode[]) => void
}

interface SimNode extends SimulationNodeDatum {
  id: string
  width: number
  height: number
}

/**
 * Apply force-directed layout to nodes
 * Returns new positions for each node
 */
export function applyForceLayout(
  nodes: LayoutNode[],
  edges: LayoutEdge[],
  options: ForceLayoutOptions = {}
): Map<string, { x: number; y: number }> {
  const {
    centerX = 0,
    centerY = 0,
    chargeStrength = -100,
    linkDistance = 150,
    collisionMultiplier = 1.0,  // Not used anymore - collision uses actual node sizes
    iterations = 300,
    gravityStrength = 0.6,
    onTick,
  } = options

  if (nodes.length === 0) {
    return new Map()
  }

  // Create simulation nodes with initial positions
  const simNodes: SimNode[] = nodes.map(n => ({
    id: n.id,
    x: n.x,
    y: n.y,
    width: n.width,
    height: n.height,
  }))

  // Create node map for edge lookup
  const nodeById = new Map(simNodes.map(n => [n.id, n]))

  // Create simulation links
  const simLinks: SimulationLinkDatum<SimNode>[] = edges
    .filter(e => nodeById.has(e.source) && nodeById.has(e.target))
    .map(e => ({
      source: e.source,
      target: e.target,
    }))

  // Find disconnected nodes (no edges)
  const connectedIds = new Set<string>()
  for (const e of edges) {
    connectedIds.add(e.source)
    connectedIds.add(e.target)
  }
  const disconnectedIds = new Set(simNodes.filter(n => !connectedIds.has(n.id)).map(n => n.id))
  console.log('[FORCE] total nodes:', simNodes.length, 'connected:', connectedIds.size, 'disconnected:', disconnectedIds.size, 'center:', centerX, centerY)

  // Calculate average node diagonal for base spacing
  const avgDiagonal = simNodes.reduce((sum, n) =>
    sum + Math.sqrt(n.width ** 2 + n.height ** 2), 0) / simNodes.length

  // Create simulation - keep nodes close together
  const simulation: Simulation<SimNode, SimulationLinkDatum<SimNode>> = forceSimulation(simNodes)
    .force('link', forceLink<SimNode, SimulationLinkDatum<SimNode>>(simLinks)
      .id(d => d.id)
      .distance(linkDistance)
      .strength(1.0))
    .force('charge', forceManyBody<SimNode>()
      .strength(d => {
        // Disconnected nodes don't repel - they only get pulled to center
        if (disconnectedIds.has(d.id)) return 0
        return chargeStrength
      })
      .distanceMin(20)
      .distanceMax(300))
    // Strong gravity to keep nodes clustered
    .force('gravityX', forceX<SimNode>(centerX).strength(d =>
      disconnectedIds.has(d.id) ? gravityStrength : gravityStrength * 0.5))
    .force('gravityY', forceY<SimNode>(centerY).strength(d =>
      disconnectedIds.has(d.id) ? gravityStrength : gravityStrength * 0.5))
    .force('collide', forceCollide<SimNode>()
      .radius(d => {
        // Use actual node diagonal / 2 as collision radius
        // This is the minimum to prevent overlap, plus small gap for edges
        const diagonal = Math.sqrt(d.width ** 2 + d.height ** 2)
        return diagonal / 2 + 30  // 30px gap for edge routing
      })
      .strength(1.0)
      .iterations(4))

  // Run simulation
  if (onTick) {
    // Animated mode - call tick callback
    for (let i = 0; i < iterations; i++) {
      simulation.tick()
      if (i % 10 === 0) {
        onTick(simNodes.map(n => ({
          id: n.id,
          x: n.x || 0,
          y: n.y || 0,
          width: n.width,
          height: n.height,
        })))
      }
    }
  } else {
    // Instant mode - just tick to completion
    simulation.stop()
    for (let i = 0; i < iterations; i++) {
      simulation.tick()
    }
  }

  // Return new positions
  const positions = new Map<string, { x: number; y: number }>()
  for (const node of simNodes) {
    positions.set(node.id, {
      x: Math.round(node.x || 0),
      y: Math.round(node.y || 0),
    })
  }

  return positions
}

/**
 * Apply force layout and update node positions via callback
 */
export async function layoutNodesWithForce(
  nodes: LayoutNode[],
  edges: LayoutEdge[],
  updatePosition: (id: string, x: number, y: number) => Promise<void>,
  options: ForceLayoutOptions = {}
): Promise<void> {
  const positions = applyForceLayout(nodes, edges, options)

  // Update all positions
  const updates = Array.from(positions.entries()).map(([id, pos]) =>
    updatePosition(id, pos.x, pos.y)
  )

  await Promise.all(updates)
}
