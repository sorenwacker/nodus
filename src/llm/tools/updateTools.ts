/**
 * Node update tool registrations
 *
 * Handles: update_node, move_node, batch_update
 */

import { defineTool, findNodeByTitle } from '../registry'
import { cleanContent } from '../utils'
import { withDateFields } from '../../lib/contentParser'

export function registerUpdateTools(): void {
  defineTool<{
    title: string
    new_content?: string
    date?: string
    date_end?: string
    tags?: string[]
  }>(
    'update_node',
    'Update ONE node: content, date or tags. For multiple nodes use batch_update.',
    {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Title of node to update' },
        new_content: { type: 'string', description: 'Literal content (no templates)' },
        date: {
          type: 'string',
          description: 'Point in time for the timeline, e.g. "1969-07-20", "1500", "20 BC". Empty string clears it',
        },
        date_end: { type: 'string', description: 'End of a date range; empty string clears it' },
        tags: { type: 'array', description: 'Replace the node tags' },
      },
      required: ['title'],
    },
    async (args, ctx) => {
      const node = findNodeByTitle(ctx.store.filteredNodes, args.title)
      if (!node) return `Error: Node "${args.title}" not found`

      const changingContent =
        args.new_content !== undefined || args.date !== undefined || args.date_end !== undefined

      if (changingContent) {
        // Push to undo stack before modifying
        ctx.pushContentUndo?.(node.id, node.markdown_content, node.title)
        // Dates are frontmatter on the existing content, so an update that
        // only sets a date must not erase the body
        const base =
          args.new_content !== undefined
            ? cleanContent(args.new_content)
            : node.markdown_content || ''
        await ctx.store.updateNodeContent(
          node.id,
          withDateFields(base, args.date, args.date_end)
        )
      }

      if (args.tags !== undefined) {
        await ctx.store.updateNodeTags?.(node.id, args.tags)
      }

      if (!changingContent && args.tags === undefined) {
        return `Nothing to update on "${args.title}": pass new_content, date, date_end or tags`
      }
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
      const node = findNodeByTitle(ctx.store.filteredNodes, args.title)
      if (!node) return `Error: Node "${args.title}" not found`
      const x = Number(args.x)
      const y = Number(args.y)
      if (isNaN(x) || isNaN(y)) return `Error: Invalid position (${args.x}, ${args.y})`
      // Use NodeService for guaranteed undo, fall back to store
      if (ctx.service) {
        await ctx.service.moveNode(node.id, x, y)
      } else {
        await ctx.store.updateNodePosition(node.id, x, y)
      }
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

      // Collect position updates for batch undo
      const positionMoves: Array<{ id: string; x: number; y: number }> = []

      const results: string[] = []
      for (const upd of updates) {
        const node = findNodeByTitle(ctx.store.filteredNodes, upd.title)
        if (!node) {
          results.push(`${upd.title}: not found`)
          continue
        }

        if (upd.set_title || upd.set_content !== undefined) {
          // Push to undo stack before modifying content or title
          ctx.pushContentUndo?.(node.id, node.markdown_content, node.title)
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
          positionMoves.push({ id: node.id, x, y })
          results.push(`${upd.title} → (${x},${y})`)
        }
      }

      // Use NodeService for position updates with guaranteed undo
      if (positionMoves.length > 0) {
        if (ctx.service) {
          await ctx.service.moveNodes(positionMoves)
        } else {
          for (const move of positionMoves) {
            await ctx.store.updateNodePosition(move.id, move.x, move.y)
          }
        }
      }

      return `Updated ${results.length} nodes`
    },
    { category: 'update' }
  )
}
