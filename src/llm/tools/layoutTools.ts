/**
 * Layout tool registrations
 *
 * Handles: auto_layout
 */

import { defineTool } from '../registry'
import { applyForceLayout } from '../../layout'

export function registerLayoutTools(): void {
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
}
