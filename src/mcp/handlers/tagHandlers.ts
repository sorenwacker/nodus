/**
 * Tag Handlers
 *
 * The tags of a workspace with the tag nodes that stand for them, and their
 * regeneration (PRODUCT_DESIGN.md > Tag nodes over MCP).
 */

import type { Node } from '../../types'
import type { McpTagNodeRebuild } from '../types'
import type { McpStoreInterface } from '../messageHandler'
import { countTagUsage } from '../../lib/tagSync'

export interface McpTagRow {
  tag: string
  /** Notes recording the tag */
  notes: number
  /** The tag node drawn for it, when there is one */
  node_id: string | null
  /** Tagged edges at that node */
  edges: number
}

/** A tag's identity: its name without the hash, case folded. */
function tagKey(title: string): string {
  return title.replace(/^#/, '').toLowerCase()
}

/**
 * Every tag in use, most used first, with its tag node and that node's edges.
 * A tag node no note records any more is listed with no notes, so an orphan
 * is visible.
 */
export function handleListTags(store: McpStoreInterface): { tags: McpTagRow[] } {
  const nodes = store.getFilteredNodes()
  const counts = countTagUsage(nodes)

  const tagNodes = new Map<string, Node>()
  for (const node of nodes) {
    if (node.node_type === 'tag' && !tagNodes.has(tagKey(node.title))) {
      tagNodes.set(tagKey(node.title), node)
    }
  }

  const edgesAt = new Map<string, number>()
  for (const edge of store.getFilteredEdges()) {
    if (edge.link_type !== 'tagged') continue
    edgesAt.set(edge.target_node_id, (edgesAt.get(edge.target_node_id) ?? 0) + 1)
  }

  const tags = [...new Set([...counts.keys(), ...tagNodes.keys()])].map((tag) => {
    const node = tagNodes.get(tag)
    return {
      tag,
      notes: counts.get(tag) ?? 0,
      node_id: node?.id ?? null,
      edges: node ? (edgesAt.get(node.id) ?? 0) : 0,
    }
  })
  tags.sort((a, b) => b.notes - a.notes || a.tag.localeCompare(b.tag))
  return { tags }
}

export function handleRebuildTagNodes(store: McpStoreInterface): Promise<McpTagNodeRebuild> {
  return store.rebuildTagNodes()
}
