/**
 * Query tool registrations
 *
 * Handles: read_graph, query_nodes
 */

import { defineTool } from '../registry'

export function registerQueryTools(): void {
  defineTool<{ include_content?: boolean; max_content_length?: number }>(
    'read_graph',
    'Read the current graph state including nodes, their content, and connections. Use this first to understand what exists.',
    {
      type: 'object',
      properties: {
        include_content: { type: 'boolean', description: 'Include node content (default: true)' },
        max_content_length: { type: 'number', description: 'Max chars per node content (default 200, max 5000)' },
      },
      required: [],
    },
    async (args, ctx) => {
      const includeContent = args.include_content !== false
      const maxLen = Math.min(args.max_content_length || 200, 5000)
      const nodes = ctx.store.filteredNodes
      const edges = ctx.store.filteredEdges

      if (nodes.length === 0) {
        return 'Graph is empty. No nodes exist yet.'
      }

      // Build node descriptions
      const nodeDescriptions = nodes.map(n => {
        const content = includeContent && n.markdown_content
          ? `\n   Content: ${n.markdown_content.slice(0, maxLen)}${n.markdown_content.length > maxLen ? '...' : ''}`
          : ''
        return `- "${n.title}" @(${Math.round(n.canvas_x)},${Math.round(n.canvas_y)})${content}`
      }).join('\n')

      // Build edge descriptions
      const edgeDescriptions = edges.length > 0
        ? edges.map(e => {
            const from = nodes.find(n => n.id === e.source_node_id)?.title || '?'
            const to = nodes.find(n => n.id === e.target_node_id)?.title || '?'
            const label = e.label ? ` [${e.label}]` : ''
            return `  "${from}" -> "${to}"${label}`
          }).join('\n')
        : '  (no connections)'

      return `CURRENT GRAPH STATE:

NODES (${nodes.length}):
${nodeDescriptions}

EDGES (${edges.length}):
${edgeDescriptions}`
    },
    { category: 'query' }
  )

  defineTool<{ filter: string }>(
    'query_nodes',
    'Query nodes from database. Returns list of {title, content} for planning.',
    {
      type: 'object',
      properties: {
        filter: { type: 'string', description: 'Filter: "all", "empty" (no content), "has_content", or a search term' },
      },
      required: ['filter'],
    },
    async (args, ctx) => {
      let nodes = ctx.store.filteredNodes
      const filter = args.filter

      if (filter === 'empty') {
        nodes = nodes.filter(n => !n.markdown_content?.trim())
      } else if (filter === 'has_content') {
        nodes = nodes.filter(n => n.markdown_content?.trim())
      } else if (filter && filter !== 'all') {
        const term = filter.toLowerCase()
        nodes = nodes.filter(n =>
          n.title.toLowerCase().includes(term) ||
          n.markdown_content?.toLowerCase().includes(term)
        )
      }

      const result = nodes.map(n => ({
        title: n.title,
        has_content: !!n.markdown_content?.trim(),
        preview: (n.markdown_content || '').slice(0, 50),
      }))

      return `Found ${result.length} nodes:\n${result.map(n => `- ${n.title}${n.has_content ? '' : ' (empty)'}`).join('\n')}`
    },
    { category: 'query' }
  )
}
