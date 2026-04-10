/**
 * Node CRUD tool registrations
 *
 * Handles: create_node, create_edge, create_edges_batch, delete_node, delete_edges, update_edge, delete_matching
 */

import { defineTool } from '../registry'
import { cleanContent } from '../utils'

// Position counter for new nodes (module-level state)
let nodePositionCounter = 0

export function resetPositionCounter() {
  nodePositionCounter = 0
}

export function registerNodeTools(): void {
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

        const node = await ctx.store.createNode({
          title: args.title || '',
          node_type: 'note',
          markdown_content: cleanContent(args.content),
          canvas_x: ctx.snapToGrid(args.x ?? pos.x + offsetX),
          canvas_y: ctx.snapToGrid(args.y ?? pos.y + offsetY),
        })

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
}
