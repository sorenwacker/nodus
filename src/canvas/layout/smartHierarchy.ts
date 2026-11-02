/**
 * Graph side of smart layout: who may be whose parent, and placing the
 * resulting trees (features.md > Smart Layout).
 */
import { applyHierarchicalLayout } from './hierarchicalLayout'

export interface HierarchyNode {
  id: string
  title: string
  /** The node type: tag, term, note, citation, ... */
  kind: string
  width: number
  height: number
}

export interface HierarchyEdge {
  source_node_id: string
  target_node_id: string
}

const ROW_GAP = 160
const NODE_GAP = 40

/**
 * Candidate parents per node: its connected neighbours of broader rank.
 *
 * Rank is a strict total order - kind position, then more connections, then
 * id - so a parent link always points to a strictly broader node and the
 * links cannot form a cycle. Candidates come most specific first (fewest
 * connections).
 *
 * Args:
 *   nodes: Nodes being arranged.
 *   edges: All edges; those leaving the node set are ignored.
 *   kindOrder: Kinds from broad to specific; unknown kinds rank last.
 *
 * Returns:
 *   Candidate parent ids per node id.
 */
export function parentCandidates(
  nodes: HierarchyNode[],
  edges: HierarchyEdge[],
  kindOrder: string[]
): Map<string, string[]> {
  const ids = new Set(nodes.map(n => n.id))
  const neighbours = new Map(nodes.map(n => [n.id, new Set<string>()]))
  for (const e of edges) {
    if (e.source_node_id === e.target_node_id || !ids.has(e.source_node_id) || !ids.has(e.target_node_id)) continue
    neighbours.get(e.source_node_id)!.add(e.target_node_id)
    neighbours.get(e.target_node_id)!.add(e.source_node_id)
  }
  const kindOf = new Map(nodes.map(n => [n.id, n.kind]))
  const kindRank = (id: string) => {
    const i = kindOrder.indexOf(kindOf.get(id)!)
    return i < 0 ? kindOrder.length : i
  }
  const degree = (id: string) => neighbours.get(id)!.size
  // Negative when a is broader than b
  const broader = (a: string, b: string) =>
    kindRank(a) - kindRank(b) || degree(b) - degree(a) || (a < b ? -1 : a > b ? 1 : 0)

  const candidates = new Map<string, string[]>()
  for (const n of nodes) {
    const options = [...neighbours.get(n.id)!].filter(m => broader(m, n.id) < 0)
    options.sort((a, b) => degree(a) - degree(b) || (a < b ? -1 : 1))
    candidates.set(n.id, options)
  }
  return candidates
}

/**
 * Place nodes as top-down trees along their parent links; nodes in no link
 * go in rows below the trees.
 *
 * Args:
 *   nodes: Nodes being arranged.
 *   parents: Parent id per child id.
 *   origin: Top-left corner of the arrangement.
 *
 * Returns:
 *   Top-left position per node id.
 */
export function layoutForest(
  nodes: HierarchyNode[],
  parents: Map<string, string>,
  origin: { x: number; y: number }
): Map<string, { x: number; y: number }> {
  const linked = new Set<string>()
  for (const [child, parent] of parents) {
    linked.add(child)
    linked.add(parent)
  }
  const treeNodes = nodes.filter(n => linked.has(n.id))
  const loose = nodes.filter(n => !linked.has(n.id))

  const positions = new Map<string, { x: number; y: number }>()
  let bottom = origin.y
  if (treeNodes.length > 0) {
    const placed = applyHierarchicalLayout(
      treeNodes.map(n => ({ id: n.id, x: 0, y: 0, width: n.width, height: n.height })),
      [...parents].map(([child, parent]) => ({ source: parent, target: child })),
      { direction: 'TB' }
    )
    const minX = Math.min(...[...placed.values()].map(p => p.x))
    const minY = Math.min(...[...placed.values()].map(p => p.y))
    for (const n of treeNodes) {
      const p = placed.get(n.id)!
      const at = { x: origin.x + p.x - minX, y: origin.y + p.y - minY }
      positions.set(n.id, at)
      bottom = Math.max(bottom, at.y + n.height)
    }
    bottom += ROW_GAP
  }

  if (loose.length > 0) {
    const cols = Math.ceil(Math.sqrt(loose.length * 3))
    const cellW = Math.max(...loose.map(n => n.width)) + NODE_GAP
    const cellH = Math.max(...loose.map(n => n.height)) + NODE_GAP
    loose.forEach((n, i) => {
      positions.set(n.id, { x: origin.x + (i % cols) * cellW, y: bottom + Math.floor(i / cols) * cellH })
    })
  }
  return positions
}
