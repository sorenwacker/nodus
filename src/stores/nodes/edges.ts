/**
 * Edge operations for the nodes store
 */

import { asOneUndoStep } from './undoRecorder'
import type { Node, Edge, CreateEdgeInput, NodeStoreDependencies } from './types'

/**
 * Create an edge - forwarded to edges store
 */
export function createEdge(
  edgesStore: NodeStoreDependencies['edgesStore'],
  data: CreateEdgeInput
): Promise<Edge> {
  return edgesStore.createEdge(data)
}

/**
 * Delete an edge. A wikilink edge stands for a link in the node that holds it,
 * or in both nodes when it is undirected; that link becomes plain text first
 * (PRODUCT_DESIGN.md > Deleting a merged wikilink edge).
 *
 * @param saveContent - Writes a node's content through the store, so the
 *   rewrite is recorded for undo and keeps the node's checksum current. It
 *   must not re-sync wikilink edges, because this edge is being deleted.
 */
export async function deleteEdge(
  deps: NodeStoreDependencies,
  id: string,
  saveContent: (nodeId: string, content: string) => Promise<void>
): Promise<void> {
  const { state, edgesStore } = deps
  const edge = edgesStore.getEdge(id)

  if (edge && edge.link_type === 'wikilink') {
    const byId = (nodeId: string) => state.nodes.value.find(n => n.id === nodeId)
    const holders: Array<[Node | undefined, Node | undefined]> = [
      [byId(edge.source_node_id), byId(edge.target_node_id)],
    ]
    if (edge.directed === false) {
      holders.push([byId(edge.target_node_id), byId(edge.source_node_id)])
    }

    await asOneUndoStep(async () => {
      for (const [holder, linked] of holders) {
        if (!holder?.markdown_content || !linked) continue
        const unlinked = withoutWikilinksTo(holder.markdown_content, linked.title)
        if (unlinked !== holder.markdown_content) await saveContent(holder.id, unlinked)
      }
    })
  }

  await edgesStore.deleteEdge(id)
}

/** Replace `[[Title]]` and `[[Title|display]]` with their display text */
function withoutWikilinksTo(content: string, title: string): string {
  const wikilink = new RegExp(`\\[\\[${escapeRegex(title)}(?:\\|([^\\]]+))?\\]\\]`, 'gi')
  return content.replace(wikilink, (_match, display) => display || title)
}

/**
 * Escape special regex characters in a string
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Restore an edge - forwarded to edges store
 */
export function restoreEdge(
  edgesStore: NodeStoreDependencies['edgesStore'],
  edge: Edge
): void {
  edgesStore.restoreEdge(edge)
}

/**
 * Update edge link type - forwarded to edges store
 */
export function updateEdgeLinkType(
  edgesStore: NodeStoreDependencies['edgesStore'],
  id: string,
  linkType: string
): Promise<void> {
  return edgesStore.updateEdgeLinkType(id, linkType)
}

/**
 * Update edge color - forwarded to edges store
 */
export function updateEdgeLabel(
  edgesStore: NodeStoreDependencies['edgesStore'],
  id: string,
  label: string | null
): Promise<void> {
  return edgesStore.updateEdgeLabel(id, label)
}

export function updateEdgeColor(
  edgesStore: NodeStoreDependencies['edgesStore'],
  id: string,
  color: string | null
): Promise<void> {
  return edgesStore.updateEdgeColor(id, color)
}

/**
 * Update edge directed status - forwarded to edges store
 */
export function updateEdgeDirected(
  edgesStore: NodeStoreDependencies['edgesStore'],
  id: string,
  directed: boolean
): Promise<void> {
  return edgesStore.updateEdgeDirected(id, directed)
}

/**
 * Clean up orphan edges - forwarded to edges store
 */
export function cleanupOrphanEdges(
  edgesStore: NodeStoreDependencies['edgesStore'],
  nodes: Node[]
): void {
  edgesStore.cleanupOrphanEdges(new Set(nodes.map(n => n.id)))
}

/**
 * Deduplicate edges - forwarded to edges store
 */
export function deduplicateEdges(
  edgesStore: NodeStoreDependencies['edgesStore']
): void {
  edgesStore.deduplicateEdges()
}
