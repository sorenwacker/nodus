/**
 * Zotero
 */
import type { McpToolDeclaration } from './types'

export const ZOTERO_TOOLS: McpToolDeclaration[] = [
  {
    name: 'add_to_zotero',
    description:
      'Add nodes to the user\'s Zotero library as new items, as the "Add to Zotero" menu action does. Title, authors, date, journal and DOI are read from each node. A node whose DOI is already in the library is counted as a duplicate and not added; a node without content is skipped; no existing Zotero item is changed. Needs a Zotero API key with write access set in Nodus. Returns the counts of added, duplicate and skipped nodes, and errors.',
    inputSchema: {
      type: 'object',
      properties: {
        node_ids: {
          type: 'array',
          items: { type: 'string' },
          description: 'Ids of the nodes to add (see list_nodes or search_nodes).',
        },
      },
      required: ['node_ids'],
    },
  },
]
