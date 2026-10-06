/**
 * Which nodes are references to a publication
 * (PRODUCT_DESIGN.md > Zotero takes citation nodes).
 */
import type { Node } from '../types'

/** A citation, or the stub standing in for one whose metadata is not fetched yet */
export function isCitationNode(node: Pick<Node, 'node_type'>): boolean {
  return node.node_type === 'citation' || node.node_type === 'citation-stub'
}
