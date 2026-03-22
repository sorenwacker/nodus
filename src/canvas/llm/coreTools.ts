/**
 * Core tool registrations
 *
 * Registers built-in tools using the ToolRegistry pattern.
 * Plugins can register additional tools using the same API.
 */

import { defineTool, toolRegistry } from './registry'
import { cleanContent } from './utils'
import { applyForceLayout } from '../layout'

// Position counter for new nodes (module-level state)
let nodePositionCounter = 0

export function resetPositionCounter() {
  nodePositionCounter = 0
}

/**
 * Register all core tools
 * Call this once at app startup
 */
export function registerCoreTools(): void {
  // Skip if already registered
  if (toolRegistry.has('create_node')) {
    return
  }

  // ============================================================
  // NODE CRUD
  // ============================================================

  defineTool<{ title: string; content?: string; x?: number; y?: number }>(
    'create_node',
    'Create a new node on the canvas with a title and markdown content',
    {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Node title' },
        content: { type: 'string', description: 'Markdown content for the node' },
        x: { type: 'number', description: 'X position (optional)' },
        y: { type: 'number', description: 'Y position (optional)' },
      },
      required: ['title'],
    },
    async (args, ctx) => {
      try {
        const pos = ctx.screenToCanvas(window.innerWidth / 2, window.innerHeight / 2)
        const offsetX = (nodePositionCounter % 4) * 250
        const offsetY = Math.floor(nodePositionCounter / 4) * 180
        nodePositionCounter++

        console.log('[create_node] Creating:', args.title, 'at', pos.x + offsetX, pos.y + offsetY)

        const node = await ctx.store.createNode({
          title: args.title || '',
          node_type: 'note',
          markdown_content: cleanContent(args.content),
          canvas_x: ctx.snapToGrid(args.x ?? pos.x + offsetX),
          canvas_y: ctx.snapToGrid(args.y ?? pos.y + offsetY),
        })

        console.log('[create_node] Created node:', node.id)
        return `Created node "${args.title}" with id ${node.id}`
      } catch (e) {
        console.error('[create_node] Error:', e)
        return `Error creating node: ${e}`
      }
    },
    { category: 'crud' }
  )

  defineTool<{ from_title: string; to_title: string; label?: string; color?: string }>(
    'create_edge',
    'Create an edge connecting two nodes by their titles',
    {
      type: 'object',
      properties: {
        from_title: { type: 'string', description: 'Title of source node' },
        to_title: { type: 'string', description: 'Title of target node' },
        label: { type: 'string', description: 'Edge label (optional)' },
        color: { type: 'string', description: 'Edge color as hex code, e.g. #ff0000 (optional)' },
      },
      required: ['from_title', 'to_title'],
    },
    async (args, ctx) => {
      const fromNode = ctx.store.filteredNodes.find(n => n.title === args.from_title)
      const toNode = ctx.store.filteredNodes.find(n => n.title === args.to_title)
      if (!fromNode) return `Error: Node "${args.from_title}" not found`
      if (!toNode) return `Error: Node "${args.to_title}" not found`

      await ctx.store.createEdge({
        source_node_id: fromNode.id,
        target_node_id: toNode.id,
        label: args.label,
        color: args.color,
      })
      return `Created edge from "${args.from_title}" to "${args.to_title}"`
    },
    { category: 'crud' }
  )

  defineTool<{ edges: Array<{ from_title: string; to_title: string; label?: string; color?: string }> }>(
    'create_edges_batch',
    'Create multiple edges at once. More efficient than create_edge for mind maps and graphs.',
    {
      type: 'object',
      properties: {
        edges: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              from_title: { type: 'string', description: 'Source node title' },
              to_title: { type: 'string', description: 'Target node title' },
              label: { type: 'string', description: 'Edge label (optional)' },
              color: { type: 'string', description: 'Edge color as hex code, e.g. #ff0000 (optional)' },
            },
            required: ['from_title', 'to_title'],
          },
          description: 'Array of edges to create',
        },
      },
      required: ['edges'],
    },
    async (args, ctx) => {
      const results: string[] = []
      let created = 0
      let failed = 0

      for (const edge of args.edges) {
        const fromNode = ctx.store.filteredNodes.find(n => n.title === edge.from_title)
        const toNode = ctx.store.filteredNodes.find(n => n.title === edge.to_title)

        if (!fromNode) {
          results.push(`Skip: "${edge.from_title}" not found`)
          failed++
          continue
        }
        if (!toNode) {
          results.push(`Skip: "${edge.to_title}" not found`)
          failed++
          continue
        }

        await ctx.store.createEdge({
          source_node_id: fromNode.id,
          target_node_id: toNode.id,
          label: edge.label,
          color: edge.color,
        })
        created++
      }

      if (failed > 0) {
        return `Created ${created} edges, ${failed} failed: ${results.join('; ')}`
      }
      return `Created ${created} edges`
    },
    { category: 'batch' }
  )

  defineTool<{ title: string }>(
    'delete_node',
    'Delete a single node by its title',
    {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Title of node to delete' },
      },
      required: ['title'],
    },
    async (args, ctx) => {
      const node = ctx.store.filteredNodes.find(n => n.title === args.title)
      if (!node) return `Error: Node "${args.title}" not found`
      await ctx.store.deleteNode(node.id)
      return `Deleted node "${args.title}"`
    },
    { category: 'crud' }
  )

  defineTool<{ filter: string }>(
    'delete_edges',
    'Delete edges. Use to remove connections without deleting nodes.',
    {
      type: 'object',
      properties: {
        filter: { type: 'string', description: '"all" to delete all edges, or node title to delete edges from/to that node' },
      },
      required: ['filter'],
    },
    async (args, ctx) => {
      const filter = args.filter || 'all'
      let edges = [...ctx.store.filteredEdges]

      if (filter !== 'all') {
        const node = ctx.store.filteredNodes.find(n => n.title.toLowerCase() === filter.toLowerCase())
        if (node) {
          edges = edges.filter(e => e.source_node_id === node.id || e.target_node_id === node.id)
        } else {
          return `Node "${filter}" not found`
        }
      }

      if (edges.length === 0) return 'No edges to delete'

      ctx.log(`> Deleting ${edges.length} edges...`)
      for (const edge of edges) {
        await ctx.store.deleteEdge(edge.id)
      }
      return `Deleted ${edges.length} edges`
    },
    { category: 'crud' }
  )

  defineTool<{ from_title: string; to_title: string; label?: string; color?: string }>(
    'update_edge',
    'Update an edge label or color by specifying the connected node titles',
    {
      type: 'object',
      properties: {
        from_title: { type: 'string', description: 'Title of source node' },
        to_title: { type: 'string', description: 'Title of target node' },
        label: { type: 'string', description: 'New edge label (optional)' },
        color: { type: 'string', description: 'New edge color as hex code, e.g. #ff0000 (optional)' },
      },
      required: ['from_title', 'to_title'],
    },
    async (args, ctx) => {
      const fromNode = ctx.store.filteredNodes.find(n => n.title === args.from_title)
      const toNode = ctx.store.filteredNodes.find(n => n.title === args.to_title)
      if (!fromNode) return `Error: Node "${args.from_title}" not found`
      if (!toNode) return `Error: Node "${args.to_title}" not found`

      // Find the edge between these nodes
      const edge = ctx.store.filteredEdges.find(
        e => (e.source_node_id === fromNode.id && e.target_node_id === toNode.id) ||
             (e.source_node_id === toNode.id && e.target_node_id === fromNode.id)
      )
      if (!edge) return `Error: No edge between "${args.from_title}" and "${args.to_title}"`

      const updates: string[] = []

      if (args.label !== undefined && ctx.store.updateEdgeLabel) {
        await ctx.store.updateEdgeLabel(edge.id, args.label || null)
        updates.push(`label="${args.label || '(none)'}"`)
      }

      if (args.color !== undefined && ctx.store.updateEdgeColor) {
        await ctx.store.updateEdgeColor(edge.id, args.color || null)
        updates.push(`color="${args.color || 'default'}"`)
      }

      if (updates.length === 0) {
        return 'No updates provided (specify label or color)'
      }

      return `Updated edge "${args.from_title}" -> "${args.to_title}": ${updates.join(', ')}`
    },
    { category: 'crud' }
  )

  defineTool<{ filter: string }>(
    'delete_matching',
    'Delete multiple nodes matching a filter.',
    {
      type: 'object',
      properties: {
        filter: { type: 'string', description: '"all", "even", "odd", "empty", or search term' },
      },
      required: ['filter'],
    },
    async (args, ctx) => {
      const filter = args.filter || 'all'
      let nodes = [...ctx.store.filteredNodes]

      if (filter === 'even') {
        nodes = nodes.filter(n => {
          const num = parseInt(n.title.match(/\d+/)?.[0] || '0')
          return num % 2 === 0
        })
      } else if (filter === 'odd') {
        nodes = nodes.filter(n => {
          const num = parseInt(n.title.match(/\d+/)?.[0] || '0')
          return num % 2 === 1
        })
      } else if (filter === 'empty') {
        nodes = nodes.filter(n => !n.markdown_content?.trim())
      } else if (filter !== 'all') {
        const term = filter.toLowerCase()
        nodes = nodes.filter(n => n.title.toLowerCase().includes(term))
      }

      if (nodes.length === 0) return `No nodes match filter "${filter}"`

      ctx.log(`> Deleting ${nodes.length} nodes...`)
      for (const node of nodes) {
        await ctx.store.deleteNode(node.id)
      }
      return `Deleted ${nodes.length} nodes (${filter})`
    },
    { category: 'crud' }
  )

  // ============================================================
  // NODE UPDATES
  // ============================================================

  defineTool<{ title: string; new_content: string }>(
    'update_node',
    'Update ONE node. For multiple nodes use batch_update.',
    {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Title of node to update' },
        new_content: { type: 'string', description: 'Literal content (no templates)' },
      },
      required: ['title', 'new_content'],
    },
    async (args, ctx) => {
      const node = ctx.store.filteredNodes.find(n => n.title === args.title)
      if (!node) return `Error: Node "${args.title}" not found`
      await ctx.store.updateNodeContent(node.id, cleanContent(args.new_content))
      return `Updated node "${args.title}"`
    },
    { category: 'update' }
  )

  defineTool<{ title: string; x: number; y: number }>(
    'move_node',
    'Move a single node to a new position',
    {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Title of node to move' },
        x: { type: 'number', description: 'New X position' },
        y: { type: 'number', description: 'New Y position' },
      },
      required: ['title', 'x', 'y'],
    },
    async (args, ctx) => {
      const node = ctx.store.filteredNodes.find(n => n.title === args.title)
      if (!node) return `Error: Node "${args.title}" not found`
      const x = Number(args.x)
      const y = Number(args.y)
      if (isNaN(x) || isNaN(y)) return `Error: Invalid position (${args.x}, ${args.y})`
      await ctx.store.updateNodePosition(node.id, x, y)
      return `Moved "${args.title}" to (${x}, ${y})`
    },
    { category: 'update' }
  )

  defineTool<{ updates: Array<{ title: string; set_title?: string; set_content?: string; x?: number; y?: number }> }>(
    'batch_update',
    'Update multiple nodes. LLM decides values. Use for titles, content, OR positions.',
    {
      type: 'object',
      properties: {
        updates: { type: 'array', description: '[{title: "Node 1", set_title?: "Lion", set_content?: "...", x?: 100, y?: 200}]' },
      },
      required: ['updates'],
    },
    async (args, ctx) => {
      const updates = args.updates || []

      if (!Array.isArray(updates) || updates.length === 0) {
        return 'No updates provided'
      }

      const results: string[] = []
      for (const upd of updates) {
        const node = ctx.store.filteredNodes.find(n => n.title === upd.title)
        if (!node) {
          results.push(`${upd.title}: not found`)
          continue
        }

        if (upd.set_title) {
          await ctx.store.updateNodeTitle(node.id, upd.set_title)
          results.push(`${upd.title} → ${upd.set_title}`)
        }
        if (upd.set_content !== undefined) {
          await ctx.store.updateNodeContent(node.id, upd.set_content)
        }
        const newX = upd.x
        const newY = upd.y
        if (newX !== undefined || newY !== undefined) {
          const x = newX !== undefined ? Number(newX) : node.canvas_x
          const y = newY !== undefined ? Number(newY) : node.canvas_y
          await ctx.store.updateNodePosition(node.id, x, y)
          results.push(`${upd.title} → (${x},${y})`)
        }
      }

      return `Updated ${results.length} nodes`
    },
    { category: 'update' }
  )

  // ============================================================
  // BATCH OPERATIONS
  // ============================================================

  defineTool<{ count: number; title_pattern: string; content_pattern?: string; layout?: string; connect?: boolean }>(
    'generate_sequence',
    'Generate N nodes with a pattern. Use for large batches (100+). Pattern uses {n} for number.',
    {
      type: 'object',
      properties: {
        count: { type: 'number', description: 'Number of nodes to create' },
        title_pattern: { type: 'string', description: 'Title pattern, e.g., "Node {n}" or "Item {n}"' },
        content_pattern: { type: 'string', description: 'Content pattern, e.g., "{n}" or empty' },
        layout: { type: 'string', description: '"grid" (default), "horizontal", or "vertical"' },
        connect: { type: 'boolean', description: 'If true, connect nodes sequentially (1->2->3...)' },
      },
      required: ['count', 'title_pattern'],
    },
    async (args, ctx) => {
      const count = Math.min(args.count || 10, 10000)
      const titlePattern = args.title_pattern || 'Node {n}'
      const contentPattern = args.content_pattern || ''
      const layout = args.layout || 'grid'
      const connect = args.connect || false

      const pos = ctx.screenToCanvas(window.innerWidth / 2, window.innerHeight / 2)
      const cols = layout === 'horizontal' ? count : layout === 'vertical' ? 1 : Math.ceil(Math.sqrt(count))
      const spacing = 250

      ctx.log(`> Generating ${count} nodes${connect ? ' (connected)' : ''}...`)

      const createdNodes: { id: string; title: string }[] = []

      for (let i = 1; i <= count; i++) {
        const title = titlePattern.replace(/\{n\}/g, String(i))
        const content = contentPattern.replace(/\{n\}/g, String(i))

        const col = (i - 1) % cols
        const row = Math.floor((i - 1) / cols)
        const x = pos.x + col * spacing
        const y = pos.y + row * 180

        const node = await ctx.store.createNode({
          title,
          node_type: 'note',
          markdown_content: content,
          canvas_x: ctx.snapToGrid(x),
          canvas_y: ctx.snapToGrid(y),
        })

        createdNodes.push({ id: node.id, title })

        if (i % 100 === 0) {
          ctx.log(`> Created ${i}/${count}...`)
        }
      }

      if (connect && createdNodes.length > 1) {
        ctx.log(`> Connecting ${createdNodes.length - 1} edges...`)
        for (let i = 0; i < createdNodes.length - 1; i++) {
          await ctx.store.createEdge({
            source_node_id: createdNodes[i].id,
            target_node_id: createdNodes[i + 1].id,
          })
        }
      }

      return `Generated ${count} nodes${connect ? ` with ${count - 1} edges` : ''}`
    },
    { category: 'batch' }
  )

  defineTool<{ nodes: Array<{ title?: string; content?: string; mode?: string }> }>(
    'create_nodes_batch',
    'Create or update multiple nodes (up to ~50). For larger batches, use generate_sequence.',
    {
      type: 'object',
      properties: {
        nodes: {
          type: 'array',
          description: 'Array of {title, content, mode?} objects. mode="append" adds to existing content.',
        },
      },
      required: ['nodes'],
    },
    async (args, ctx) => {
      let nodesList = args.nodes || []
      if (typeof nodesList === 'string') {
        try {
          nodesList = JSON.parse(nodesList)
        } catch {
          try {
            const fixed = (nodesList as unknown as string)
              .replace(/'/g, '"')
              .replace(/(\w+):/g, '"$1":')
            nodesList = JSON.parse(fixed)
          } catch {
            return 'Error: could not parse nodes array'
          }
        }
      }
      if (!Array.isArray(nodesList) || nodesList.length === 0) {
        return 'Error: nodes must be a non-empty array'
      }

      const existingByTitle = new Map(
        ctx.store.filteredNodes.map(n => [n.title.toLowerCase(), n])
      )

      const pos = ctx.screenToCanvas(window.innerWidth / 2, window.innerHeight / 2)
      const created: string[] = []
      const updated: string[] = []
      let newIndex = 0

      for (const n of nodesList) {
        const title = n.title || `Node ${newIndex + 1}`
        const existing = existingByTitle.get(title.toLowerCase())

        if (existing) {
          const newContent = n.mode === 'append'
            ? (existing.markdown_content || '') + '\n\n' + cleanContent(n.content || '')
            : cleanContent(n.content || '')
          await ctx.store.updateNodeContent(existing.id, newContent)
          updated.push(title)
        } else {
          const cols = Math.ceil(Math.sqrt(nodesList.length))
          const x = pos.x + (newIndex % cols) * 250
          const y = pos.y + Math.floor(newIndex / cols) * 180

          await ctx.store.createNode({
            title,
            node_type: 'note',
            markdown_content: cleanContent(n.content || ''),
            canvas_x: ctx.snapToGrid(x),
            canvas_y: ctx.snapToGrid(y),
          })
          created.push(title)
          newIndex++
        }
      }

      const parts = []
      if (created.length) parts.push(`created ${created.length}`)
      if (updated.length) parts.push(`updated ${updated.length}`)
      return parts.join(', ') || 'No changes'
    },
    { category: 'batch' }
  )

  // ============================================================
  // LAYOUT
  // ============================================================

  defineTool<{ layout: string; sort?: string }>(
    'auto_layout',
    'Arrange nodes in a layout',
    {
      type: 'object',
      properties: {
        layout: { type: 'string', description: '"grid", "horizontal", "vertical", "circle", "clock", "star", "force" (force-directed based on edges)' },
        sort: { type: 'string', description: '"alphabetical", "numeric", "reverse" (optional)' },
      },
      required: ['layout'],
    },
    async (args, ctx) => {
      const nodes = [...ctx.store.filteredNodes]
      if (nodes.length === 0) return 'No nodes to layout'

      // Sort if requested
      if (args.sort) {
        const sortKey = args.sort
        const desc = sortKey.startsWith('-')
        const key = desc ? sortKey.slice(1) : sortKey

        nodes.sort((a, b) => {
          let valA: unknown, valB: unknown
          if (key === 'title' || key === 'alphabetical') {
            valA = a.title; valB = b.title
          } else if (key === 'numeric' || key === 'number') {
            valA = parseInt(a.title.match(/\d+/)?.[0] || '0')
            valB = parseInt(b.title.match(/\d+/)?.[0] || '0')
          } else {
            return 0
          }

          const cmp = typeof valA === 'string' ? (valA as string).localeCompare(valB as string) : (valA as number) - (valB as number)
          return desc ? -cmp : cmp
        })
      }

      const layout = args.layout || 'grid'
      const centerX = 600
      const centerY = 400
      const nodeWidth = 220
      const nodeHeight = 150
      const gap = 30

      if (layout === 'force') {
        const layoutNodes = nodes.map(n => ({
          id: n.id,
          x: n.canvas_x,
          y: n.canvas_y,
          width: n.width || 200,
          height: n.height || 120,
        }))
        const layoutEdges = ctx.store.filteredEdges.map(e => ({
          source: e.source_node_id,
          target: e.target_node_id,
        }))
        const positions = await applyForceLayout(layoutNodes, layoutEdges, {
          centerX,
          centerY,
          iterations: 300,
        })
        for (const node of nodes) {
          const pos = positions.get(node.id)
          if (pos) {
            await ctx.store.updateNodePosition(node.id, pos.x, pos.y)
          }
        }
        return `Arranged ${nodes.length} nodes using force-directed layout`
      }

      for (let i = 0; i < nodes.length; i++) {
        let x: number, y: number
        if (layout === 'horizontal') {
          x = 100 + i * (nodeWidth + gap)
          y = 100
        } else if (layout === 'vertical') {
          x = 100
          y = 100 + i * (nodeHeight + gap)
        } else if (layout === 'circle') {
          const nodeSize = Math.max(nodeWidth, nodeHeight) + gap
          const circumference = nodes.length * nodeSize
          const radius = Math.max(300, circumference / (2 * Math.PI))
          const angle = (2 * Math.PI * i) / nodes.length - Math.PI / 2
          x = centerX + radius * Math.cos(angle)
          y = centerY + radius * Math.sin(angle)
        } else if (layout === 'star') {
          const nodeSize = Math.max(nodeWidth, nodeHeight) + gap
          const circumference = (nodes.length - 1) * nodeSize
          const radius = Math.max(300, circumference / (2 * Math.PI))
          if (i === 0) {
            x = centerX
            y = centerY
          } else {
            const angle = (2 * Math.PI * (i - 1)) / (nodes.length - 1) - Math.PI / 2
            x = centerX + radius * Math.cos(angle)
            y = centerY + radius * Math.sin(angle)
          }
        } else {
          // grid
          const cols = Math.ceil(Math.sqrt(nodes.length))
          x = 100 + (i % cols) * (nodeWidth + gap)
          y = 100 + Math.floor(i / cols) * (nodeHeight + gap)
        }
        await ctx.store.updateNodePosition(nodes[i].id, x, y)
      }
      return `Arranged ${nodes.length} nodes in ${layout} layout`
    },
    { category: 'layout' }
  )

  // ============================================================
  // QUERY
  // ============================================================

  defineTool<{ include_content?: boolean; max_content_length?: number }>(
    'read_graph',
    'Read the current graph state including nodes, their content, and connections. Use this first to understand what exists.',
    {
      type: 'object',
      properties: {
        include_content: { type: 'boolean', description: 'Include node content (default: true)' },
        max_content_length: { type: 'number', description: 'Max chars per node content (default: 200)' },
      },
      required: [],
    },
    async (args, ctx) => {
      const includeContent = args.include_content !== false
      const maxLen = args.max_content_length || 200
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

  // ============================================================
  // SMART TOOLS (LLM-powered)
  // ============================================================

  defineTool<{ instruction: string }>(
    'smart_move',
    'Move nodes based on semantic criteria. LLM reasons about each node. Use for "move cars left, animals right".',
    {
      type: 'object',
      properties: {
        instruction: { type: 'string', description: 'Natural language: "car brands to x=100, animals to x=600"' },
      },
      required: ['instruction'],
    },
    async (args, _ctx) => {
      // This tool requires external LLM calls - handled by agent runner
      return `__SMART_MOVE__:${args.instruction}`
    },
    { category: 'smart' }
  )

  defineTool<{ groups: string }>(
    'smart_connect',
    'Connect nodes within semantic groups. E.g., "connect animals together, connect cars together, but not across".',
    {
      type: 'object',
      properties: {
        groups: { type: 'string', description: 'Group descriptions: "animals, car brands"' },
      },
      required: ['groups'],
    },
    async (args, _ctx) => {
      return `__SMART_CONNECT__:${args.groups}`
    },
    { category: 'smart' }
  )

  defineTool<{ instruction: string }>(
    'smart_color',
    'Color nodes based on semantic criteria. LLM reasons about each node.',
    {
      type: 'object',
      properties: {
        instruction: { type: 'string', description: 'Natural language: "males blue, females pink" or "urgent red, normal green"' },
      },
      required: ['instruction'],
    },
    async (_args, _ctx) => {
      return `__UNHANDLED__:smart_color`
    },
    { category: 'smart' }
  )

  defineTool<{ pattern: string; color: string }>(
    'color_matching',
    'Color nodes matching a text pattern (grep-style). Fast, no LLM reasoning.',
    {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'Text pattern to match (e.g., "#department", "urgent", "2024")' },
        color: { type: 'string', description: 'Color hex code: #ef4444 (red), #f97316 (orange), #eab308 (yellow), #22c55e (green), #3b82f6 (blue), #8b5cf6 (purple), #ec4899 (pink)' },
      },
      required: ['pattern', 'color'],
    },
    async (_args, _ctx) => {
      return `__UNHANDLED__:color_matching`
    },
    { category: 'smart' }
  )

  // ============================================================
  // UTILITY
  // ============================================================

  defineTool<{ query: string }>(
    'web_search',
    'Search the web for information. Use this to research topics before creating nodes.',
    {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
      },
      required: ['query'],
    },
    async (args, _ctx) => {
      return `__WEB_SEARCH__:${args.query}`
    },
    { category: 'utility' }
  )

  defineTool<{ summary: string; force?: boolean }>(
    'done',
    'Signal that the agent has completed all work. For graph tasks, include edges before calling done.',
    {
      type: 'object',
      properties: {
        summary: { type: 'string', description: 'Brief summary of what was accomplished' },
        force: { type: 'boolean', description: 'Set to true to complete without edges (for non-graph tasks)' },
      },
      required: ['summary'],
    },
    async (args, ctx) => {
      const nodes = ctx.store.filteredNodes
      const edges = ctx.store.filteredEdges

      // Only warn about missing edges if not forced and we have many nodes
      // This catches graph-creation tasks while allowing simple node creation
      if (!args.force && nodes.length > 3 && edges.length === 0) {
        return `NOTE: Graph has ${nodes.length} nodes but no edges. If this is a mindmap/hierarchy, use create_edges_batch to connect them. If standalone nodes are intended, call done(summary, force=true).`
      }

      return `AGENT_DONE: ${args.summary || 'completed'} (${nodes.length} nodes, ${edges.length} edges)`
    },
    { category: 'utility' }
  )

  // ============================================================
  // THINKING & PLANNING TOOLS
  // ============================================================

  defineTool<{ thought: string }>(
    'think',
    'Express your reasoning or thinking process. Use this to plan before acting.',
    {
      type: 'object',
      properties: {
        thought: { type: 'string', description: 'Your thought or reasoning' },
      },
      required: ['thought'],
    },
    async (args, ctx) => {
      ctx.log(`[think] ${args.thought}`)
      return 'Thought recorded'
    },
    { category: 'planning' }
  )

  defineTool<{ tasks: string[] }>(
    'plan',
    'Create a task list for a complex operation. Each task will be shown in the log.',
    {
      type: 'object',
      properties: {
        tasks: {
          type: 'array',
          items: { type: 'string' },
          description: 'List of task descriptions'
        },
      },
      required: ['tasks'],
    },
    async (_args, _ctx) => {
      // Return unhandled so PixiCanvas.vue handles it with task state
      return `__UNHANDLED__:plan`
    },
    { category: 'planning' }
  )

  defineTool<{ task_index: number; status: string }>(
    'update_task',
    'Update the status of a task in the current plan.',
    {
      type: 'object',
      properties: {
        task_index: { type: 'number', description: 'Task index (0-based)' },
        status: { type: 'string', description: 'New status: "done", "in_progress", "failed", or custom text' },
      },
      required: ['task_index', 'status'],
    },
    async (_args, _ctx) => {
      // Return unhandled so PixiCanvas.vue handles it with task state
      return `__UNHANDLED__:update_task`
    },
    { category: 'planning' }
  )

  defineTool<{ message: string }>(
    'remember',
    'Store important information for future reference in this conversation.',
    {
      type: 'object',
      properties: {
        message: { type: 'string', description: 'Information to remember' },
      },
      required: ['message'],
    },
    async (_args, _ctx) => {
      // Return unhandled so PixiCanvas.vue handles it with memory state
      return `__UNHANDLED__:remember`
    },
    { category: 'planning' }
  )

  // ============================================================
  // AGENT PLANNING TOOLS (for interactive approval flow)
  // ============================================================

  defineTool<{ title: string; steps: Array<{ description: string; details?: string }> }>(
    'create_plan',
    'Create a detailed plan with steps for user approval. IMPORTANT: Plans for graphs MUST include separate steps for: 1) Creating nodes, 2) Creating edges with labels, 3) Applying layout.',
    {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Short title describing the plan goal' },
        steps: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              description: { type: 'string', description: 'Specific action (e.g., "Create 7 nodes for brain regions")' },
              details: { type: 'string', description: 'Specific details (e.g., "Nodes: Cerebrum, Cerebellum, Brainstem, ...")' },
            },
          },
          description: 'REQUIRED STEPS FOR GRAPHS: 1) Create nodes (list specific nodes), 2) Create edges with labels (specify connections), 3) Apply layout, 4) Done',
        },
      },
      required: ['title', 'steps'],
    },
    async (args, _ctx) => {
      // Return marker for PixiCanvas to handle with plan state
      return `__CREATE_PLAN__:${JSON.stringify(args)}`
    },
    { category: 'agent' }
  )

  defineTool<{ plan_id?: string; message?: string }>(
    'request_approval',
    'Request user approval for the current plan. Agent will pause until user approves, rejects, or modifies.',
    {
      type: 'object',
      properties: {
        plan_id: { type: 'string', description: 'Optional plan ID (defaults to current plan)' },
        message: { type: 'string', description: 'Optional message to show user with approval request' },
      },
      required: [],
    },
    async (args, _ctx) => {
      // Return marker for PixiCanvas to handle - pauses agent loop
      return `__REQUEST_APPROVAL__:${JSON.stringify(args)}`
    },
    { category: 'agent' }
  )

  defineTool<{ query: string; sources?: string[] }>(
    'research',
    'Research a topic across web and local nodes. Returns results with source attribution.',
    {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
        sources: {
          type: 'array',
          items: { type: 'string' },
          description: 'Sources to search: "local", "web", "wikipedia". Defaults to ["local", "web"]',
        },
      },
      required: ['query'],
    },
    async (args, _ctx) => {
      // Return marker for PixiCanvas to handle with research module
      return `__RESEARCH__:${JSON.stringify(args)}`
    },
    { category: 'agent' }
  )

  defineTool<{
    topic: string
    depth?: 'quick' | 'moderate' | 'thorough' | 'exhaustive'
    aspects?: string[]
  }>(
    'deep_research',
    'Perform deep, iterative research with cross-validation. Use for comprehensive research that needs multiple rounds of queries, Wikipedia article fetching, and source validation. Returns findings with confidence levels.',
    {
      type: 'object',
      properties: {
        topic: { type: 'string', description: 'Main research topic' },
        depth: {
          type: 'string',
          description: 'Research depth: "quick" (1 round), "moderate" (2 rounds), "thorough" (3 rounds), "exhaustive" (5 rounds). Default: moderate',
        },
        aspects: {
          type: 'array',
          items: { type: 'string' },
          description: 'Specific aspects to investigate (e.g., ["anatomy", "function", "disorders"])',
        },
      },
      required: ['topic'],
    },
    async (args, _ctx) => {
      return `__DEEP_RESEARCH__:${JSON.stringify(args)}`
    },
    { category: 'agent' }
  )

  defineTool<{ title: string }>(
    'fetch_wikipedia',
    'Fetch full Wikipedia article content for a topic. Use to get detailed information on a specific subject.',
    {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Wikipedia article title (e.g., "Cerebral cortex")' },
      },
      required: ['title'],
    },
    async (args, _ctx) => {
      return `__FETCH_WIKIPEDIA__:${JSON.stringify(args)}`
    },
    { category: 'agent' }
  )

  defineTool<{ query: string; limit?: number }>(
    'wikipedia_search',
    'Search Wikipedia for articles matching a query. Returns list of matching articles with snippets. Use this to discover relevant Wikipedia articles before fetching full content.',
    {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
        limit: { type: 'number', description: 'Max results (default: 5)' },
      },
      required: ['query'],
    },
    async (args, _ctx) => {
      return `__WIKIPEDIA_SEARCH__:${JSON.stringify(args)}`
    },
    { category: 'agent' }
  )

  defineTool<{ claim: string }>(
    'validate_claim',
    'Cross-validate a specific claim or fact across multiple sources. Returns confidence level and supporting sources.',
    {
      type: 'object',
      properties: {
        claim: { type: 'string', description: 'The claim or fact to validate' },
      },
      required: ['claim'],
    },
    async (args, _ctx) => {
      return `__VALIDATE_CLAIM__:${JSON.stringify(args)}`
    },
    { category: 'agent' }
  )

  defineTool<{ topic: string; findings: string[] }>(
    'check_completeness',
    'Assess if research on a topic is complete. Returns coverage score and suggests follow-up queries if gaps exist.',
    {
      type: 'object',
      properties: {
        topic: { type: 'string', description: 'The research topic' },
        findings: {
          type: 'array',
          items: { type: 'string' },
          description: 'List of findings/claims already discovered',
        },
      },
      required: ['topic', 'findings'],
    },
    async (args, _ctx) => {
      return `__CHECK_COMPLETENESS__:${JSON.stringify(args)}`
    },
    { category: 'agent' }
  )

  // ============================================================
  // THEME TOOLS
  // ============================================================

  defineTool<{ name: string; description: string }>(
    'create_theme',
    'Create a new custom theme. LLM generates YAML based on description.',
    {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Theme name (kebab-case, e.g., "crazy-bananas")' },
        description: { type: 'string', description: 'Description of desired colors and style' },
      },
      required: ['name', 'description'],
    },
    async (_args, _ctx) => {
      // Return unhandled so PixiCanvas.vue switch handles it with LLM access
      return `__UNHANDLED__:create_theme`
    },
    { category: 'theme' }
  )

  defineTool<{ name: string; changes: string }>(
    'update_theme',
    'Update an existing custom theme based on changes description.',
    {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Theme name to update' },
        changes: { type: 'string', description: 'Description of changes to make' },
      },
      required: ['name', 'changes'],
    },
    async (_args, _ctx) => {
      // Return unhandled so PixiCanvas.vue switch handles it with LLM access
      return `__UNHANDLED__:update_theme`
    },
    { category: 'theme' }
  )

  defineTool<{ name: string }>(
    'apply_theme',
    'Switch to a named theme',
    {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Theme name to apply' },
      },
      required: ['name'],
    },
    async (_args, _ctx) => {
      // Return unhandled so PixiCanvas.vue switch handles it
      return `__UNHANDLED__:apply_theme`
    },
    { category: 'theme' }
  )

  defineTool<Record<string, never>>(
    'list_themes',
    'List available themes',
    {
      type: 'object',
      properties: {},
      required: [],
    },
    async (_args, _ctx) => {
      // Return unhandled so PixiCanvas.vue switch handles it
      return `__UNHANDLED__:list_themes`
    },
    { category: 'theme' }
  )

  // ============================================================
  // FOR_EACH (template-based)
  // ============================================================

  defineTool<{ filter?: string; action: string; template: string }>(
    'for_each_node',
    'Process nodes: set/append content with templates, or use LLM to generate/transform content.',
    {
      type: 'object',
      properties: {
        filter: { type: 'string', description: '"all", "empty", "has_content", or search term' },
        action: { type: 'string', description: '"set", "append", or "llm" (LLM generates content)' },
        template: { type: 'string', description: 'Template with {title}, {content}, {n}. Examples: "What is {title}? 100 words max" or "Summarize: {content}"' },
      },
      required: ['action', 'template'],
    },
    async (args, ctx) => {
      let nodes = [...ctx.store.filteredNodes]
      const filter = args.filter || 'all'

      if (filter === 'empty') {
        nodes = nodes.filter(n => !n.markdown_content?.trim())
      } else if (filter === 'has_content') {
        nodes = nodes.filter(n => n.markdown_content?.trim())
      } else if (filter !== 'all') {
        const term = filter.toLowerCase()
        nodes = nodes.filter(n => n.title.toLowerCase().includes(term))
      }

      if (nodes.length === 0) return `No nodes match filter "${filter}"`

      const template = args.template
      const action = args.action

      // LLM action - use LLM to generate/transform content
      if (action === 'llm') {
        const { providerRegistry } = await import('./providers')
        const provider = providerRegistry.getActiveProvider()
        let processed = 0

        for (let i = 0; i < nodes.length; i++) {
          const node = nodes[i]
          const n = i + 1
          ctx.log(`> Processing "${node.title}"...`)

          // Apply template variables to the instruction
          const instruction = template
            .replace(/\{title\}/g, node.title)
            .replace(/\{content\}/g, node.markdown_content || '')
            .replace(/\{n\}/g, String(n))

          // Use existing content if available, otherwise use title for generation
          const hasContent = !!node.markdown_content?.trim()

          try {
            // Build prompt - if template has {title}, use it directly; otherwise add context
            const hasTemplateVars = /\{title\}|\{content\}/.test(template)
            let prompt: string
            if (hasTemplateVars) {
              // User provided explicit template like "What is {title}?"
              prompt = instruction
            } else if (hasContent) {
              // Transform existing content
              prompt = `${instruction}\n\nContent:\n${node.markdown_content}`
            } else {
              // Generate from title
              prompt = `Write about "${node.title}". ${instruction}`
            }

            const result = await provider.generate({
              prompt,
              system: `Write about "${node.title}" only. No preamble.`,
            })

            if (result.content?.trim()) {
              await ctx.store.updateNodeContent(node.id, cleanContent(result.content))
              processed++
            }
          } catch (err) {
            ctx.log(`> Error processing "${node.title}": ${err}`)
          }
        }

        return `Processed ${processed}/${nodes.length} nodes with LLM`
      }

      // Template-based actions (set/append)
      for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i]
        const n = i + 1

        // Evaluate template
        let content = template
          .replace(/\{title\}/g, node.title)
          .replace(/\{content\}/g, node.markdown_content || '')
          .replace(/\{n\}/g, String(n))
          .replace(/\{n\^2\}/g, String(n * n))
          .replace(/\{n\+1\}/g, String(n + 1))
          .replace(/\{n-1\}/g, String(n - 1))
          .replace(/\{n\*2\}/g, String(n * 2))

        if (action === 'append') {
          content = (node.markdown_content || '') + '\n\n' + content
        }

        await ctx.store.updateNodeContent(node.id, content)
      }

      return `Updated ${nodes.length} nodes with template`
    },
    { category: 'batch' }
  )
}
