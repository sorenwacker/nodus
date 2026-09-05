/**
 * Bring a node's recorded tags up to date with the hashtags in its body.
 *
 * Tags are extracted when a node is created and when its content is edited.
 * Content that arrived by either path before that behaviour existed, or that
 * was written into the vault by another editor, was never scanned: measured on
 * a 12,853-node vault, 1,193 nodes held hashtags the graph did not know about.
 * The graph load runs this pass so the two paths and the stored state agree
 * (PRODUCT_DESIGN.md > Tags).
 */
import { extractHashtags } from '../../lib/contentParser'
import type { Node } from '../../types'

export interface HashtagBackfill {
  id: string
  /** The node's existing tags followed by the ones found in its body. */
  tags: string[]
}

/** The tags already recorded on a node, or none if the field is unset or malformed. */
function recordedTags(node: Node): string[] {
  if (!node.tags) return []
  try {
    const parsed = JSON.parse(node.tags)
    return Array.isArray(parsed) ? parsed.filter(t => typeof t === 'string') : []
  } catch {
    return []
  }
}

/**
 * Work out which nodes need their tags written, and what to write.
 *
 * Extraction merges rather than replaces, so a tag set by hand or carried in
 * frontmatter survives a body that does not mention it. A node is only listed
 * when the scan actually finds something new, which is what makes the pass
 * idempotent: the run after a backfill plans nothing.
 *
 * Args:
 *   nodes: Every node to consider. Nodes without content are skipped.
 *
 * Returns:
 *   One entry per node whose tags would change, holding the merged list.
 */
export function planHashtagBackfill(nodes: Node[]): HashtagBackfill[] {
  const plan: HashtagBackfill[] = []

  for (const node of nodes) {
    const content = node.markdown_content
    if (!content) continue

    const found = extractHashtags(content)
    if (found.length === 0) continue

    const existing = recordedTags(node)
    const missing = found.filter(tag => !existing.includes(tag))
    if (missing.length === 0) continue

    plan.push({ id: node.id, tags: [...existing, ...missing] })
  }

  return plan
}

/**
 * Apply a backfill plan.
 *
 * Writes are per node and only for nodes the plan names, so a vault whose tags
 * are already current costs one scan and no writes at all. Nothing here throws:
 * a tag that cannot be written must not take the graph load down with it.
 *
 * Args:
 *   nodes: The loaded nodes, updated in place so the canvas sees the new tags.
 *   persist: Writes one node's tags to the backend.
 *   onTags: Receives each node's new tags, for creating tag nodes and edges.
 *     Omitted when tag nodes are switched off.
 *
 * Returns:
 *   The number of nodes whose tags were written.
 */
export async function runHashtagBackfill(
  nodes: Node[],
  persist: (id: string, tags: string[]) => Promise<void>,
  onTags?: (id: string, tags: string[]) => Promise<void>
): Promise<number> {
  const plan = planHashtagBackfill(nodes)
  let written = 0

  for (const entry of plan) {
    try {
      await persist(entry.id, entry.tags)
      const node = nodes.find(n => n.id === entry.id)
      if (node) node.tags = JSON.stringify(entry.tags)
      written++
      if (onTags) await onTags(entry.id, entry.tags)
    } catch {
      // One unwritable node must not stop the rest of the pass
    }
  }

  return written
}
