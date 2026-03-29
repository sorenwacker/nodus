/**
 * Force-directed layout using d3-force
 * Arranges nodes based on their connections for natural visualization
 */
import type {
  Simulation,
  SimulationNodeDatum,
  SimulationLinkDatum,
} from 'd3-force'

// Dynamic import to avoid bundling issues
let d3Force: typeof import('d3-force') | null = null
async function getD3Force() {
  if (!d3Force) {
    d3Force = await import('d3-force')
  }
  return d3Force
}

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
export async function applyForceLayout(
  nodes: LayoutNode[],
  edges: LayoutEdge[],
  options: ForceLayoutOptions = {}
): Promise<Map<string, { x: number; y: number }>> {
  const {
    centerX = 0,
    centerY = 0,
    chargeStrength = -3000,
    linkDistance = 250,
    iterations = 300,
    gravityStrength = 0.4,
    onTick,
  } = options

  if (nodes.length === 0) {
    return new Map()
  }

  // Dynamic import to avoid bundling issues with d3-timer
  const {
    forceSimulation,
    forceLink,
    forceManyBody,
    forceCollide,
    forceX,
    forceY,
  } = await getD3Force()

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

  // Pre-pass: move distant nodes closer to center before simulation
  // This ensures outliers can converge in limited iterations
  const maxInitialDistance = 2000
  for (const node of simNodes) {
    const dx = (node.x || 0) - centerX
    const dy = (node.y || 0) - centerY
    const dist = Math.sqrt(dx * dx + dy * dy)
    if (dist > maxInitialDistance) {
      // Pull node to maxInitialDistance from center
      const scale = maxInitialDistance / dist
      node.x = centerX + dx * scale
      node.y = centerY + dy * scale
    }
  }

  // If all or most nodes are disconnected, use moderate gravity (not too weak, not collapsing)
  const disconnectedRatio = simNodes.length > 0 ? disconnectedIds.size / simNodes.length : 0
  // Keep gravity reasonable even for disconnected graphs - 0.3 minimum
  const effectiveGravity = disconnectedRatio > 0.5 ? Math.max(gravityStrength * 0.5, 0.3) : gravityStrength

  // Create simulation - keep nodes close together
  const simulation: Simulation<SimNode, SimulationLinkDatum<SimNode>> = forceSimulation(simNodes)
    .force('link', forceLink<SimNode, SimulationLinkDatum<SimNode>>(simLinks)
      .id(d => d.id)
      .distance(linkDistance)
      .strength(1.0))
    .force('charge', forceManyBody<SimNode>()
      .strength(d => {
        // Disconnected nodes: no repulsion (only collision prevents overlap)
        // This keeps them in the cluster instead of being pushed out
        if (disconnectedIds.has(d.id)) return 0
        return chargeStrength
      })
      .distanceMin(10)
      .distanceMax(800)
      .theta(simNodes.length > 200 ? 0.9 : 0.7))
    // Gravity to keep nodes clustered - stronger for disconnected nodes
    .force('gravityX', forceX<SimNode>(centerX).strength(d =>
      disconnectedIds.has(d.id) ? effectiveGravity * 1.5 : effectiveGravity))
    .force('gravityY', forceY<SimNode>(centerY).strength(d =>
      disconnectedIds.has(d.id) ? effectiveGravity * 1.5 : effectiveGravity))
    .force('collide', forceCollide<SimNode>()
      .radius(d => {
        // Use actual node diagonal / 2 as collision radius
        // Larger gap (30px) for more spacing between nodes
        const diagonal = Math.sqrt(d.width ** 2 + d.height ** 2)
        return diagonal / 2 + 30
      })
      .strength(0.9)
      .iterations(3))

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
  const positions = await applyForceLayout(nodes, edges, options)

  // Update all positions
  const updates = Array.from(positions.entries()).map(([id, pos]) =>
    updatePosition(id, pos.x, pos.y)
  )

  await Promise.all(updates)
}
