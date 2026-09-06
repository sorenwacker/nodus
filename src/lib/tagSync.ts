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

/**
 * How many notes must share a tag before it is worth a node of its own.
 *
 * Materialising one per distinct tag put 606 tag nodes into a workspace holding
 * 360 real ones, and 542 of them - 89% - were reachable from a single note or
 * none. A tag used once connects nothing: it labels that note, which its card
 * already shows as a chip. What earns a node is a tag that joins notes together
 * - #person across 191 of them, #department across 42
 * (docs/content/features.md > Tags).
 */
export const MIN_NOTES_FOR_TAG_NODE = 2

/** A node's recorded tags, or none when the field is unset or malformed. */
function recordedTagsOf(node: { tags?: string | null }): string[] {
  if (!node.tags) return []
  try {
    const parsed = JSON.parse(node.tags)
    return Array.isArray(parsed) ? parsed.filter(t => typeof t === 'string') : []
  } catch {
    return []
  }
}

export interface TaggableNode {
  node_type?: string
  tags?: string | null
}

/**
 * How many notes carry each tag.
 *
 * Args:
 *   nodes: Every node. Tag nodes are skipped, since a tag node carrying its own
 *     name would count itself as a user of it.
 *
 * Returns:
 *   Note counts by normalised tag name - lower case, no leading hash - so
 *   `#Person` and `person` are one tag.
 */
export function countTagUsage(nodes: TaggableNode[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const node of nodes) {
    if (node.node_type === 'tag') continue
    // A note counts once for a tag however many times it records it
    const seen = new Set(recordedTagsOf(node).map(tagKey))
    for (const tag of seen) counts.set(tag, (counts.get(tag) ?? 0) + 1)
  }
  return counts
}

/**
 * The tags that earn a node, by the threshold above.
 *
 * Args:
 *   nodes: Every node.
 *
 * Returns:
 *   Normalised tag names shared by at least MIN_NOTES_FOR_TAG_NODE notes.
 */
export function tagsWorthDrawing(nodes: TaggableNode[]): Set<string> {
  const worth = new Set<string>()
  for (const [tag, count] of countTagUsage(nodes)) {
    if (count >= MIN_NOTES_FOR_TAG_NODE) worth.add(tag)
  }
  return worth
}
