/**
 * Repair tag nodes left behind by the unnormalised lookup.
 *
 * getOrCreateTagNode once compared a bare tag name against a title stored with
 * its hash, so the comparison never matched and every save of the same hashtag
 * created another tag node and another edge to it. The comparison is normalised
 * now, but the rows it produced remain: a vault held "test" beside "#test", and
 * "#Paradigm" twice in one workspace (docs/content/features.md > Tags).
 */
import type { Edge, Node } from '../types'

export interface TagNodeMerge {
  /** The tag node that survives. */
  keepId: string
  /** Duplicates to delete once their edges are dealt with. */
  dropIds: string[]
  /**
   * Tagged edges to move onto the kept node. There is no command to change an
   * edge's target, so a move is the old edge deleted and a new one created;
   * the source has to travel with the id for that.
   */
  repointEdges: { id: string; sourceNodeId: string }[]
  /** Tagged edges to delete, because the kept node already has that connection. */
  deleteEdgeIds: string[]
}

export interface TagNodeRename {
  id: string
  title: string
}

export interface TagNodeRepairPlan {
  merges: TagNodeMerge[]
  renames: TagNodeRename[]
}

/** A tag's identity: its name without the hash, case folded. */
function tagKey(node: Node): string {
  return node.title.replace(/^#/, '').toLowerCase()
}

/**
 * Work out what a vault's tag nodes need.
 *
 * Duplicates are grouped per workspace, because the same tag in two workspaces
 * is two different nodes by design. The first of a group survives; the rest are
 * dropped once their tagged edges are moved onto it, and an edge whose
 * connection the survivor already has is deleted rather than duplicated.
 *
 * Args:
 *   nodes: Every node. Anything that is not a tag node is ignored.
 *   edges: Every edge. Only `tagged` edges are considered.
 *
 * Returns:
 *   The merges and renames needed. Empty on a healthy vault.
 */
export function planTagNodeRepair(nodes: Node[], edges: Edge[]): TagNodeRepairPlan {
  const tagNodes = nodes.filter(n => n.node_type === 'tag')
  const groups = new Map<string, Node[]>()

  for (const node of tagNodes) {
    const key = `${node.workspace_id ?? ''}::${tagKey(node)}`
    const group = groups.get(key)
    if (group) group.push(node)
    else groups.set(key, [node])
  }

  const merges: TagNodeMerge[] = []
  const merged = new Set<string>()

  for (const group of groups.values()) {
    if (group.length < 2) continue

    const [keep, ...drops] = group
    const dropIds = drops.map(n => n.id)
    const keptSources = new Set(
      edges.filter(e => e.link_type === 'tagged' && e.target_node_id === keep.id).map(e => e.source_node_id)
    )

    const repointEdges: { id: string; sourceNodeId: string }[] = []
    const deleteEdgeIds: string[] = []
    for (const edge of edges) {
      if (edge.link_type !== 'tagged' || !dropIds.includes(edge.target_node_id)) continue
      if (keptSources.has(edge.source_node_id)) {
        deleteEdgeIds.push(edge.id)
      } else {
        repointEdges.push({ id: edge.id, sourceNodeId: edge.source_node_id })
        keptSources.add(edge.source_node_id)
      }
    }

    merges.push({ keepId: keep.id, dropIds, repointEdges, deleteEdgeIds })
    for (const id of dropIds) merged.add(id)
  }

  // A dropped node is about to disappear, so only survivors are worth renaming
  const renames = tagNodes
    .filter(n => !merged.has(n.id) && !n.title.startsWith('#'))
    .map(n => ({ id: n.id, title: `#${n.title}` }))

  return { merges, renames }
}

export interface TagNodeRepairDeps {
  createTaggedEdge: (sourceNodeId: string, targetNodeId: string) => Promise<void>
  deleteEdge: (edgeId: string) => Promise<void>
  deleteNode: (nodeId: string) => Promise<void>
  renameNode: (nodeId: string, title: string) => Promise<void>
}

export interface TagNodeRepairResult {
  merged: number
  edgesRepointed: number
  edgesDeleted: number
  renamed: number
}

/**
 * Apply a repair plan.
 *
 * Edges are moved before their old tag node is deleted, so a tagged connection
 * is never dropped on the floor by the repair itself.
 *
 * Args:
 *   plan: The plan from planTagNodeRepair.
 *   deps: The operations that write.
 *
 * Returns:
 *   What was actually changed.
 */
export async function runTagNodeRepair(
  plan: TagNodeRepairPlan,
  deps: TagNodeRepairDeps
): Promise<TagNodeRepairResult> {
  const result: TagNodeRepairResult = { merged: 0, edgesRepointed: 0, edgesDeleted: 0, renamed: 0 }

  for (const merge of plan.merges) {
    for (const edge of merge.repointEdges) {
      await deps.createTaggedEdge(edge.sourceNodeId, merge.keepId)
      await deps.deleteEdge(edge.id)
      result.edgesRepointed++
    }
    for (const edgeId of merge.deleteEdgeIds) {
      await deps.deleteEdge(edgeId)
      result.edgesDeleted++
    }
    for (const nodeId of merge.dropIds) {
      await deps.deleteNode(nodeId)
      result.merged++
    }
  }

  for (const rename of plan.renames) {
    await deps.renameNode(rename.id, rename.title)
    result.renamed++
  }

  return result
}
