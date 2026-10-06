/**
 * Zotero tool registrations
 *
 * Handles: add_to_zotero
 */

import { defineTool } from '../registry'

export function registerZoteroTools(): void {
  defineTool<{ node_ids: string[] }>(
    'add_to_zotero',
    'Add nodes to the user\'s Zotero library as new items. Title, authors, date, journal and DOI are read from each node. A node whose DOI is already in the library is not added; no existing Zotero item is changed.',
    {
      type: 'object',
      properties: {
        node_ids: { type: 'array', items: { type: 'string' }, description: 'Ids of the nodes to add' },
      },
      required: ['node_ids'],
    },
    async (args, ctx) => {
      if (!ctx.addNodesToZotero) return 'Adding to Zotero is not available here'
      const ids = Array.isArray(args.node_ids) ? args.node_ids : []
      if (ids.length === 0) return 'node_ids (a non-empty array of node ids) required'

      const errors: string[] = []
      const nodes = ids.flatMap(id => {
        const node = ctx.store.filteredNodes.find(n => n.id === id)
        if (!node) errors.push(`Node not found: ${id}`)
        return node ? [node] : []
      })
      const report =
        nodes.length > 0 ? await ctx.addNodesToZotero(nodes) : { added: 0, duplicates: 0, skipped: 0, errors: [] }
      errors.push(...report.errors)

      const parts = [`Added ${report.added} item(s) to Zotero`]
      if (report.duplicates > 0) parts.push(`${report.duplicates} already in the library`)
      if (report.skipped > 0) parts.push(`${report.skipped} without content`)
      if (errors.length > 0) parts.push(`errors: ${errors.join('; ')}`)
      return parts.join(', ')
    },
    { category: 'zotero' }
  )
}
