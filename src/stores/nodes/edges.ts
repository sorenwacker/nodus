/**
 * Edge operations for the nodes store
 */

import { invoke } from '../../lib/tauri'
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
 * Delete an edge. If it's a wikilink edge, convert the [[...]] to plain text in the source node.
 */
export async function deleteEdge(
  deps: NodeStoreDependencies,
  id: string
): Promise<void> {
  const { state, edgesStore } = deps
  const edge = edgesStore.getEdge(id)

  // If it's a wikilink edge, convert the wikilink to plain text in source node
  if (edge && edge.link_type === 'wikilink') {
    const sourceNode = state.nodes.value.find(n => n.id === edge.source_node_id)
    const targetNode = state.nodes.value.find(n => n.id === edge.target_node_id)

    if (sourceNode && targetNode && sourceNode.markdown_content) {
      // Replace [[Target Title]] or [[Target Title|display]] with just the display text
      const targetTitle = targetNode.title
      const wikilinkRegex = new RegExp(
        `\\[\\[${escapeRegex(targetTitle)}(?:\\|([^\\]]+))?\\]\\]`,
        'gi'
      )
      const newContent = sourceNode.markdown_content.replace(wikilinkRegex, (_match, display) => {
        return display || targetTitle
      })

      if (newContent !== sourceNode.markdown_content) {
        // Update content without triggering edge sync (would cause infinite loop)
        sourceNode.markdown_content = newContent
        sourceNode.updated_at = Date.now()
        try {
          await invoke<string | null>('update_node_content', { id: sourceNode.id, content: newContent })
        } catch (e) {
          console.error('Failed to update content after wikilink removal:', e)
        }
      }
    }
  }

  await edgesStore.deleteEdge(id)
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
