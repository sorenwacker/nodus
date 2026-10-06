/**
 * Canvas Zotero integration composable
 *
 * Handles adding nodes to Zotero from the context menu.
 * Wraps the useZotero composable with UI feedback.
 */
import { computed, type ComputedRef } from 'vue'
import { useZotero } from '../../../composables/useZotero'
import { isCitationNode } from '../../../lib/citationNodes'
import type { Node } from '../../../types'

/**
 * Context for canvas Zotero operations
 */
export interface UseCanvasZoteroContext {
  /** Store functions for node retrieval */
  store: {
    getNode: (id: string) => Node | undefined
  }
  /** Get affected node IDs from context menu */
  getAffectedNodeIds: () => string[]
  /** Toast notification function */
  showToast?: (message: string, type: 'success' | 'error' | 'info' | 'warning') => void
}

/** What adding nodes to Zotero came to */
export interface ZoteroAddReport {
  added: number
  /** Nodes whose DOI is already in the library */
  duplicates: number
  /** Nodes without content */
  skipped: number
  errors: string[]
}

/** The part of a node that becomes a Zotero item */
export type ZoteroCandidate = Pick<Node, 'title' | 'markdown_content' | 'node_type'>

/**
 * Return type for useCanvasZotero
 */
export interface UseCanvasZoteroReturn {
  /** Zotero composable instance */
  zotero: ReturnType<typeof useZotero>
  /**
   * Add nodes to the Zotero library and say what happened, in a toast and in
   * the returned counts. The context-menu action and the add_to_zotero tools
   * all go through here (PRODUCT_DESIGN.md > Adding to Zotero from an agent)
   */
  addNodesToZotero: (nodes: ZoteroCandidate[]) => Promise<ZoteroAddReport>
  /** How many of the nodes the context menu acts on Zotero takes */
  citationNodeCount: ComputedRef<number>
  /** Handle adding selected nodes to Zotero */
  handleAddToZotero: () => Promise<void>
}

/**
 * Composable for canvas Zotero operations
 *
 * Provides the handler for adding nodes to Zotero from the context menu,
 * with appropriate toast feedback for success/failure cases.
 */
export function useCanvasZotero(ctx: UseCanvasZoteroContext): UseCanvasZoteroReturn {
  const { store, getAffectedNodeIds, showToast } = ctx
  const zotero = useZotero()

  /**
   * Handle adding selected nodes to Zotero
   */
  async function handleAddToZotero() {
    const affectedIds = getAffectedNodeIds()
    if (affectedIds.length === 0) return

    // The menu offers the action for the citation nodes of the selection
    const nodes = affectedIds
      .map(id => store.getNode(id))
      .filter((n): n is Node => n !== undefined && isCitationNode(n))

    if (nodes.length === 0) return

    await addNodesToZotero(nodes)
  }

  const citationNodeCount = computed(
    () => getAffectedNodeIds().filter(id => { const n = store.getNode(id); return n !== undefined && isCitationNode(n) }).length
  )

  async function addNodesToZotero(candidates: ZoteroCandidate[]): Promise<ZoteroAddReport> {
    // A note that mentions a DOI is a note, not a reference
    // (PRODUCT_DESIGN.md > Zotero takes citation nodes)
    const nodes = candidates.filter(isCitationNode)
    const refused = candidates.filter(n => !isCitationNode(n)).map(n => `Not a citation node: ${n.title}`)
    if (nodes.length === 0) return { added: 0, duplicates: 0, skipped: 0, errors: refused }

    const result = await zotero.addNodesToZotero(nodes)

    if (result.cancelled) {
      if (result.added > 0) {
        showToast?.(`Stopped - added ${result.added} item(s) to Zotero`, 'warning')
      } else {
        showToast?.('Cancelled', 'info')
      }
    } else if (result.added > 0) {
      const parts: string[] = []
      if (result.duplicates > 0) parts.push(`${result.duplicates} duplicates`)
      if (result.skipped > 0) parts.push(`${result.skipped} no content`)
      const extraMsg = parts.length > 0 ? ` (${parts.join(', ')})` : ''
      showToast?.(`Added ${result.added} item(s) to Zotero${extraMsg}`, 'success')
    } else if (result.duplicates > 0) {
      showToast?.(`No items added - ${result.duplicates} already in Zotero`, 'info')
    } else if (result.skipped > 0) {
      showToast?.(`No items added - ${result.skipped} node(s) had no content`, 'warning')
    }
    const errors = [...refused, ...result.errors]
    if (errors.length > 0) {
      showToast?.(errors[0], 'error')
    }
    return { added: result.added, duplicates: result.duplicates, skipped: result.skipped, errors }
  }

  return {
    zotero,
    addNodesToZotero,
    citationNodeCount,
    handleAddToZotero,
  }
}
