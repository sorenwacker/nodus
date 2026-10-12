/**
 * Query tool registrations
 *
 * Handles: read_graph, read_node, query_nodes, get_connected_components
 */

import { defineTool, findNodeByTitle } from '../registry'
import { handleGetConnectedComponents } from '../../mcp/handlers/nodeHandlers'

export function registerQueryTools(): void {
  defineTool<Record<string, never>>(
    'get_connected_components',
    'Report how many separate groups the graph falls into, and which nodes are in each. Call this before claiming the graph is connected: without it the answer can only be a guess.',
    { type: 'object', properties: {}, required: [] },
    async (_args, ctx) => {
      // The same computation MCP clients get, rather than a second one here
      // (PRODUCT_DESIGN.md > One rule, one place)
      const result = handleGetConnectedComponents({
        getFilteredNodes: () => ctx.store.filteredNodes,
        getFilteredEdges: () => ctx.store.filteredEdges,
      } as never)

      if (result.component_count === 1) {
        return 'The graph is one connected group.'
      }

      const groups = result.components
        .map((c, i) => {
          const sample = (c.nodes ?? c.sample_nodes ?? []).map(n => n.title).join(', ')
          return `  ${i + 1}. ${c.size} node(s): ${sample}`
        })
        .join('\n')
      return `The graph falls into ${result.component_count} separate groups:\n${groups}`
    },
    { category: 'query' }
  )

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

  defineTool<{ title: string }>(
    'read_node',
    'Read one node\'s full content by title. After query_nodes, read the hits the answer needs instead of the whole graph.',
    {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Exact node title (case-insensitive)' },
      },
      required: ['title'],
    },
    async (args, ctx) => {
      const node = findNodeByTitle(ctx.store.filteredNodes, args.title)
      if (!node) {
        return `No node titled "${args.title}". Use query_nodes("search term") to find the title.`
      }
      const content = node.markdown_content?.trim()
      return content ? `"${node.title}":\n${content}` : `"${node.title}" has no content.`
    },
    { category: 'query' }
  )

  defineTool<{ filter: string }>(
    'query_nodes',
    'Search node titles and content. Returns each hit with a preview of its content; a plural term also finds its singular. Read a hit in full with read_node.',
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
        const matches = termMatcher(filter)
        nodes = nodes.filter(n => matches(n.title) || matches(n.markdown_content || ''))
      }

      const lines = nodes.map(n => {
        const content = (n.markdown_content || '').trim()
        if (!content) return `- ${n.title} (empty)`
        const preview = content.length > PREVIEW_CHARS ? `${content.slice(0, PREVIEW_CHARS)}...` : content
        return `- ${n.title} - ${preview.replace(/\s+/g, ' ')}`
      })

      return `Found ${lines.length} nodes:\n${lines.join('\n')}`
    },
    { category: 'query' }
  )
}

/** Chars of content shown per hit: enough to tell the hits apart without a read per node */
const PREVIEW_CHARS = 120

/** A stem shorter than this would match almost anything ("bus" -> "bu") */
const MIN_STEM_LENGTH = 3

/**
 * Match a search term as typed and, when it ends in a plural suffix, as its
 * stem, so "FIPs" finds a note titled "FIP" (PRODUCT_DESIGN.md > Reading the
 * note the question is about). The stem is a substring of the plural, so the
 * singular term already finds the plural.
 */
function termMatcher(filter: string): (text: string) => boolean {
  const term = filter.toLowerCase()
  const stem = pluralStem(term)
  const variants = stem && stem.length >= MIN_STEM_LENGTH ? [term, stem] : [term]
  return text => {
    const lower = text.toLowerCase()
    return variants.some(v => lower.includes(v))
  }
}

function pluralStem(term: string): string | null {
  if (term.endsWith('ies')) return `${term.slice(0, -3)}y`
  if (term.endsWith('es')) return term.slice(0, -2)
  if (term.endsWith('s')) return term.slice(0, -1)
  return null
}
