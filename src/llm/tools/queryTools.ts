/**
 * Query tool registrations
 *
 * Handles: read_graph, query_nodes
 */

import { defineTool } from '../registry'

export function registerQueryTools(): void {
  defineTool<{ mode?: string; include_content?: boolean; max_content_length?: number }>(
    'read_graph',
    'Read the current graph state. Auto-adapts to available context. Modes: "auto" (default), "titles", "summary", "full".',
    {
      type: 'object',
      properties: {
        mode: { type: 'string', description: '"auto" = adapts to context (default), "titles" = compact, "summary" = stats only, "full" = with positions' },
        include_content: { type: 'boolean', description: 'Include node content (auto-determined if not specified)' },
        max_content_length: { type: 'number', description: 'Max chars per node content (auto-determined if not specified)' },
      },
      required: [],
    },
    async (args, ctx) => {
      const allNodes = ctx.store.filteredNodes
      const allEdges = ctx.store.filteredEdges

      if (allNodes.length === 0) {
        return 'Graph is empty. No nodes exist yet.'
      }

      // Get context limit from provider config (chars ≈ tokens * 4)
      const contextLimit = ctx.ollamaContextLength || 8192
      const reservedForConversation = Math.min(contextLimit * 0.6, 6000) // Reserve 60% or 6k for conversation
      const availableTokens = contextLimit - reservedForConversation
      const availableChars = availableTokens * 3.5 // Conservative: ~3.5 chars per token

      // Estimate graph size
      const avgTitleLen = allNodes.reduce((sum, n) => sum + n.title.length, 0) / allNodes.length
      const avgContentLen = allNodes.reduce((sum, n) => sum + (n.markdown_content?.length || 0), 0) / allNodes.length
      const titlesOnlySize = allNodes.length * (avgTitleLen + 20) // title + overhead
      const fullNoContentSize = allNodes.length * (avgTitleLen + 50) // title + position + overhead
      const fullWithContentSize = allNodes.length * (avgTitleLen + Math.min(avgContentLen, 200) + 60)

      // Auto-select mode based on what fits
      let mode = args.mode || 'auto'
      if (mode === 'auto') {
        if (fullWithContentSize < availableChars * 0.8) {
          mode = 'full'
        } else if (fullNoContentSize < availableChars * 0.8) {
          mode = 'full' // But without content
        } else if (titlesOnlySize < availableChars * 0.8) {
          mode = 'titles'
        } else {
          mode = 'summary'
        }
      }

      // Summary mode - just stats
      if (mode === 'summary') {
        const withContent = allNodes.filter(n => n.markdown_content?.trim()).length
        const orphans = allNodes.filter(n => {
          const hasEdge = allEdges.some(e => e.source_node_id === n.id || e.target_node_id === n.id)
          return !hasEdge
        }).length
        return `GRAPH SUMMARY: ${allNodes.length} nodes (${withContent} with content, ${orphans} orphans), ${allEdges.length} edges. Context limit: ${contextLimit} tokens - use query_nodes to search specific nodes.`
      }

      // Titles mode - compact list (with truncation if needed)
      if (mode === 'titles') {
        let titles = allNodes.map(n => n.title).join(', ')
        if (titles.length > availableChars) {
          // Truncate to fit
          const maxNodes = Math.floor(availableChars / (avgTitleLen + 2))
          titles = allNodes.slice(0, maxNodes).map(n => n.title).join(', ')
          return `GRAPH (showing ${maxNodes}/${allNodes.length} nodes, ${allEdges.length} edges): ${titles}...`
        }
        return `GRAPH (${allNodes.length} nodes, ${allEdges.length} edges): ${titles}`
      }

      // Full mode - adaptive content inclusion
      // Auto-determine content settings if not specified
      const canFitContent = fullWithContentSize < availableChars * 0.9
      const includeContent = args.include_content ?? canFitContent

      // Adaptive max content length based on available space
      let maxContentLen = args.max_content_length
      if (!maxContentLen && includeContent) {
        const charsPerNode = availableChars / allNodes.length
        maxContentLen = Math.max(50, Math.min(500, Math.floor(charsPerNode - 60)))
      }
      maxContentLen = maxContentLen || 200

      // Build nodes until context is filled
      const includedNodes: typeof allNodes = []
      const nodeDescriptions: string[] = []
      let usedChars = 300 // overhead for structure

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
        ? `\n\n[Showing ${includedNodes.length}/${allNodes.length} nodes - context: ${contextLimit} tokens. Use query_nodes("search term") for specific nodes.]`
        : ''

      return `CURRENT GRAPH STATE:

NODES (${includedNodes.length}/${allNodes.length})${includeContent ? ' with content' : ''}:
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
