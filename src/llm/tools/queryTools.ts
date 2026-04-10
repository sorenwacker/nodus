/**
 * Query tool registrations
 *
 * Handles: read_graph, query_nodes
 */

import { defineTool } from '../registry'

export function registerQueryTools(): void {
  defineTool<{ mode?: string; include_content?: boolean; max_content_length?: number }>(
    'read_graph',
    'Read the current graph state. Modes: "titles" (compact list), "summary" (stats only), "full" (default, with content).',
    {
      type: 'object',
      properties: {
        mode: { type: 'string', description: '"titles" = compact title list, "summary" = stats only, "full" = with content (default)' },
        include_content: { type: 'boolean', description: 'Include node content in full mode (default: true)' },
        max_content_length: { type: 'number', description: 'Max chars per node content (default 300)' },
      },
      required: [],
    },
    async (args, ctx) => {
      const mode = args.mode || 'full'
      const allNodes = ctx.store.filteredNodes
      const allEdges = ctx.store.filteredEdges

      if (allNodes.length === 0) {
        return 'Graph is empty. No nodes exist yet.'
      }

      // Summary mode - just stats
      if (mode === 'summary') {
        const withContent = allNodes.filter(n => n.markdown_content?.trim()).length
        const orphans = allNodes.filter(n => {
          const hasEdge = allEdges.some(e => e.source_node_id === n.id || e.target_node_id === n.id)
          return !hasEdge
        }).length
        return `GRAPH SUMMARY: ${allNodes.length} nodes (${withContent} with content, ${orphans} orphans), ${allEdges.length} edges`
      }

      // Titles mode - compact list
      if (mode === 'titles') {
        const titles = allNodes.map(n => n.title).join(', ')
        return `GRAPH (${allNodes.length} nodes, ${allEdges.length} edges): ${titles}`
      }

      // Full mode - breadth-first with content
      const includeContent = args.include_content !== false
      const maxContentLen = args.max_content_length || 300

      // Calculate available context budget
      const contextLimit = ctx.ollamaContextLength || 8192
      const reservedTokens = 4000
      const availableChars = (contextLimit - reservedTokens) * 4

      // Build nodes breadth-first until context is filled
      const includedNodes: typeof allNodes = []
      const nodeDescriptions: string[] = []
      let usedChars = 200 // overhead

      for (const node of allNodes) {
        const content = includeContent && node.markdown_content
          ? `\n   Content: ${node.markdown_content.slice(0, maxContentLen)}${node.markdown_content.length > maxContentLen ? '...' : ''}`
          : ''
        const desc = `- "${node.title}" @(${Math.round(node.canvas_x)},${Math.round(node.canvas_y)})${content}`

        if (usedChars + desc.length > availableChars) break

        includedNodes.push(node)
        nodeDescriptions.push(desc)
        usedChars += desc.length + 1
      }

      // Only include edges between returned nodes
      const nodeIds = new Set(includedNodes.map(n => n.id))
      const edges = allEdges.filter(e => nodeIds.has(e.source_node_id) && nodeIds.has(e.target_node_id))

      const edgeDescriptions: string[] = []
      for (const e of edges) {
        const from = includedNodes.find(n => n.id === e.source_node_id)?.title || '?'
        const to = includedNodes.find(n => n.id === e.target_node_id)?.title || '?'
        const label = e.label ? ` [${e.label}]` : ''
        const desc = `  "${from}" -> "${to}"${label}`

        if (usedChars + desc.length > availableChars) break
        edgeDescriptions.push(desc)
        usedChars += desc.length + 1
      }

      const truncated = includedNodes.length < allNodes.length
      const truncationNote = truncated
        ? `\n\nNOTE: Showing ${includedNodes.length} of ${allNodes.length} nodes (context: ${contextLimit} tokens). Use query_nodes to search.`
        : ''

      return `CURRENT GRAPH STATE:

NODES (${includedNodes.length}/${allNodes.length}):
${nodeDescriptions.join('\n')}

EDGES (${edgeDescriptions.length}/${allEdges.length}):
${edgeDescriptions.length > 0 ? edgeDescriptions.join('\n') : '  (none)'}${truncationNote}`
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
