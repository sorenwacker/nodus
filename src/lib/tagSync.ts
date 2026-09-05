/**
 * Keep a node's tags in step with the hashtags in its body.
 *
 * Extraction used to merge and never withdraw, so a #tag deleted from the text
 * left its tag and its edge behind for good. A tag can also be added by hand
 * from a card's chips, and those were never in the body, so an edit must not
 * take them: what an edit may withdraw is exactly what the previous body held
 * and the new one does not (docs/content/features.md > Tags).
 */
import { extractHashtags } from './contentParser'

export interface TagChange {
  /** The node's tags after the edit. */
  tags: string[]
  /** Tags now in the body that were not recorded before; they need edges. */
  added: string[]
  /** Tags the body has withdrawn; their edges must go. */
  removed: string[]
}

/**
 * Work out a node's tags after a content edit.
 *
 * Args:
 *   previousContent: The body before the edit, or null for a new node.
 *   nextContent: The body after the edit.
 *   recordedTags: The tags currently stored on the node, from any source.
 *
 * Returns:
 *   The new tag list, and the tags that gained or lost their place in the body.
 */
export function planTagChange(
  previousContent: string | null | undefined,
  nextContent: string,
  recordedTags: string[]
): TagChange {
  const before = extractHashtags(previousContent || '')
  const after = extractHashtags(nextContent)

  // Only a tag the body used to carry may be withdrawn by an edit
  const removed = before.filter(tag => !after.includes(tag))
  const kept = recordedTags.filter(tag => !removed.includes(tag))
  const added = after.filter(tag => !recordedTags.includes(tag))

  return {
    tags: [...kept, ...after.filter(tag => !kept.includes(tag))],
    added,
    removed,
  }
}

export interface TagEdge {
  id: string
  source_node_id: string
  target_node_id: string
  link_type: string | null
}

export interface TagNode {
  id: string
  title: string
  node_type?: string
}

export interface TagEdgeRemoval {
  /** Tagged edges to delete. */
  edgeIds: string[]
  /** Tag nodes left with nothing pointing at them, so they go too. */
  orphanTagNodeIds: string[]
}

/** A tag's identity: its name without the hash, case folded. */
function tagKey(name: string): string {
  return name.replace(/^#/, '').toLowerCase()
}

/**
 * Find the edges a node's withdrawn tags leave behind, and the tag nodes that
 * nothing points at once those edges are gone.
 *
 * A tag node is shared, so it only goes when the last note using it lets go.
 *
 * Args:
 *   nodeId: The node whose tags changed.
 *   removed: The tag names withdrawn from its body.
 *   nodes: Every node, to find the tag nodes by name.
 *   edges: Every edge; only `tagged` ones are considered.
 *
 * Returns:
 *   The edges to delete and any tag node left with no remaining use.
 */
export function planTagEdgeRemoval(
  nodeId: string,
  removed: string[],
  nodes: TagNode[],
  edges: TagEdge[]
): TagEdgeRemoval {
  if (removed.length === 0) return { edgeIds: [], orphanTagNodeIds: [] }

  const removedKeys = new Set(removed.map(tagKey))
  const tagNodeIds = new Set(
    nodes.filter(n => n.node_type === 'tag' && removedKeys.has(tagKey(n.title))).map(n => n.id)
  )

  const edgeIds = edges
    .filter(
      e => e.link_type === 'tagged' && e.source_node_id === nodeId && tagNodeIds.has(e.target_node_id)
    )
    .map(e => e.id)

  const doomed = new Set(edgeIds)
  const orphanTagNodeIds = [...tagNodeIds].filter(
    tagId =>
      !edges.some(e => e.link_type === 'tagged' && e.target_node_id === tagId && !doomed.has(e.id))
  )

  return { edgeIds, orphanTagNodeIds }
}
