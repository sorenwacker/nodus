/**
 * Force-directed layout using d3-force
 * Arranges nodes based on their connections for natural visualization
 */
import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCenter,
  forceCollide,
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
    chargeStrength = -500,
    linkDistance = 200,
    collisionMultiplier = 1.2,
    iterations = 300,
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

  // Calculate average node size for collision
  const avgSize = simNodes.reduce((sum, n) => sum + Math.max(n.width, n.height), 0) / simNodes.length

  // Create simulation
  const simulation: Simulation<SimNode, SimulationLinkDatum<SimNode>> = forceSimulation(simNodes)
    .force('link', forceLink<SimNode, SimulationLinkDatum<SimNode>>(simLinks)
      .id(d => d.id)
      .distance(linkDistance)
      .strength(0.5))
    .force('charge', forceManyBody<SimNode>()
      .strength(chargeStrength))
    .force('center', forceCenter(centerX, centerY))
    .force('collide', forceCollide<SimNode>()
      .radius(d => Math.max(d.width, d.height) * collisionMultiplier / 2)
      .strength(0.8))

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
