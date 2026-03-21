/**
 * Hierarchical layout using dagre
 * Arranges nodes in layers based on their relationships
 */
import dagre from 'dagre'

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

export interface HierarchicalLayoutOptions {
  /** Direction of the hierarchy: TB (top-bottom), BT, LR, RL */
  direction?: 'TB' | 'BT' | 'LR' | 'RL'
  /** Horizontal spacing between nodes */
  nodeSpacingX?: number
  /** Vertical spacing between layers */
  nodeSpacingY?: number
  /** Center X position for the layout */
  centerX?: number
  /** Center Y position for the layout */
  centerY?: number
  /** Alignment within ranks: UL, UR, DL, DR */
  align?: 'UL' | 'UR' | 'DL' | 'DR'
  /** Algorithm for ranking: network-simplex, tight-tree, longest-path */
  ranker?: 'network-simplex' | 'tight-tree' | 'longest-path'
}

/**
 * Apply hierarchical layout to nodes using dagre
 * Returns new positions for each node
 */
export function applyHierarchicalLayout(
  nodes: LayoutNode[],
  edges: LayoutEdge[],
  options: HierarchicalLayoutOptions = {}
): Map<string, { x: number; y: number }> {
  const {
    direction = 'TB',
    nodeSpacingX = 150,
    nodeSpacingY = 240,
    centerX = 0,
    centerY = 0,
    align,
    ranker = 'network-simplex',
  } = options

  if (nodes.length === 0) {
    return new Map()
  }

  // Create dagre graph
  const g = new dagre.graphlib.Graph()

  // Set graph options
  g.setGraph({
    rankdir: direction,
    nodesep: nodeSpacingX,
    ranksep: nodeSpacingY,
    align,
    ranker,
  })

  // Default edge label (required by dagre)
  g.setDefaultEdgeLabel(() => ({}))

  // Add nodes
  const nodeMap = new Map(nodes.map(n => [n.id, n]))
  for (const node of nodes) {
    g.setNode(node.id, {
      width: node.width,
      height: node.height,
    })
  }

  // Add edges (only for nodes that exist)
  for (const edge of edges) {
    if (nodeMap.has(edge.source) && nodeMap.has(edge.target)) {
      g.setEdge(edge.source, edge.target)
    }
  }

  // Run layout
  dagre.layout(g)

  // Extract positions
  const positions = new Map<string, { x: number; y: number }>()
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity

  for (const nodeId of g.nodes()) {
    const nodeData = g.node(nodeId)
    if (nodeData) {
      // dagre returns center positions, convert to top-left
      const x = nodeData.x - nodeData.width / 2
      const y = nodeData.y - nodeData.height / 2
      positions.set(nodeId, { x, y })

      minX = Math.min(minX, x)
      maxX = Math.max(maxX, x + nodeData.width)
      minY = Math.min(minY, y)
      maxY = Math.max(maxY, y + nodeData.height)
    }
  }

  // Center the layout around centerX, centerY
  const layoutCenterX = (minX + maxX) / 2
  const layoutCenterY = (minY + maxY) / 2
  const offsetX = centerX - layoutCenterX
  const offsetY = centerY - layoutCenterY

  const centeredPositions = new Map<string, { x: number; y: number }>()
  for (const [id, pos] of positions) {
    centeredPositions.set(id, {
      x: Math.round(pos.x + offsetX),
      y: Math.round(pos.y + offsetY),
    })
  }

  return centeredPositions
}
