/**
 * Node update tool registrations
 *
 * Handles: update_node, move_node, batch_update
 */

import { defineTool } from '../registry'
import { cleanContent } from '../utils'

export function registerUpdateTools(): void {
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
}
