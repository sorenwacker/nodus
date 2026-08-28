/**
 * Frame and storyline tool registrations for the in-app agent.
 *
 * Frames and storylines are core to the canvas, but only MCP clients could
 * create them: asking the in-app agent to group nodes into a frame, or to
 * thread them into a storyline, had no tool that could do it.
 *
 * Handles: create_frame, assign_node_to_frame, list_frames,
 *          create_storyline, add_node_to_storyline, list_storylines
 */

import { defineTool, findNodeByTitle } from '../registry'

/** Bounding box around a set of nodes, with room for the frame's chrome */
function boundsAround(
  nodes: Array<{ canvas_x: number; canvas_y: number; width?: number; height?: number }>,
  padding = 60
): { x: number; y: number; width: number; height: number } {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const node of nodes) {
    minX = Math.min(minX, node.canvas_x)
    minY = Math.min(minY, node.canvas_y)
    maxX = Math.max(maxX, node.canvas_x + (node.width || 200))
    maxY = Math.max(maxY, node.canvas_y + (node.height || 100))
  }
  return {
    x: minX - padding,
    y: minY - padding,
    width: maxX - minX + padding * 2,
    height: maxY - minY + padding * 2,
  }
}

export function registerGroupingTools(): void {
  defineTool<{ title: string; node_titles?: string[] }>(
    'create_frame',
    'Create a frame (spatial group) on the canvas, optionally sized around the named nodes',
    {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Frame title' },
        node_titles: {
          type: 'array',
          items: { type: 'string' },
          description: 'Titles of nodes to enclose; the frame is sized around them and they join it',
        },
      },
      required: ['title'],
    },
    async (args, ctx) => {
      if (!ctx.store.createFrame) return 'Error: frames are not available in this context'

      const named = (args.node_titles || [])
        .map(t => findNodeByTitle(ctx.store.filteredNodes, t))
        .filter((n): n is NonNullable<typeof n> => Boolean(n))

      const box = named.length > 0
        ? boundsAround(named)
        : (() => {
            const centre = ctx.screenToCanvas(window.innerWidth / 2, window.innerHeight / 2)
            return { x: centre.x, y: centre.y, width: 600, height: 400 }
          })()

      const frame = await ctx.store.createFrame(box.x, box.y, box.width, box.height, args.title)
      if (named.length > 0 && ctx.store.assignNodesToFrame) {
        ctx.store.assignNodesToFrame(named.map(n => n.id), frame.id)
      }

      const missing = (args.node_titles || []).length - named.length
      const note = missing > 0 ? ` (${missing} named node(s) not found)` : ''
      return `Created frame "${args.title}" with ${named.length} node(s)${note}`
    },
    { category: 'crud' }
  )

  defineTool<{ frame_title: string; node_titles: string[] }>(
    'assign_node_to_frame',
    'Put existing nodes into an existing frame, by title',
    {
      type: 'object',
      properties: {
        frame_title: { type: 'string', description: 'Title of the target frame' },
        node_titles: { type: 'array', items: { type: 'string' }, description: 'Titles of the nodes to move into it' },
      },
      required: ['frame_title', 'node_titles'],
    },
    async (args, ctx) => {
      if (!ctx.store.getFrames || !ctx.store.assignNodesToFrame) {
        return 'Error: frames are not available in this context'
      }
      const frame = ctx.store
        .getFrames()
        .find(f => (f.title || '').toLowerCase() === args.frame_title.toLowerCase())
      if (!frame) return `Error: Frame "${args.frame_title}" not found`

      const named = (args.node_titles || [])
        .map(t => findNodeByTitle(ctx.store.filteredNodes, t))
        .filter((n): n is NonNullable<typeof n> => Boolean(n))
      if (named.length === 0) return 'Error: none of the named nodes were found'

      ctx.store.assignNodesToFrame(named.map(n => n.id), frame.id)
      return `Moved ${named.length} node(s) into frame "${frame.title}"`
    },
    { category: 'update' }
  )

  defineTool<Record<string, never>>(
    'list_frames',
    'List the frames on the canvas with the number of nodes in each',
    { type: 'object', properties: {} },
    async (_args, ctx) => {
      if (!ctx.store.getFrames) return 'Error: frames are not available in this context'
      const frames = ctx.store.getFrames()
      if (frames.length === 0) return 'No frames on the canvas'
      return frames
        .map(f => {
          const count = ctx.store.filteredNodes.filter(n => n.frame_id === f.id).length
          return `${f.title || 'Untitled frame'}: ${count} node(s)`
        })
        .join('\n')
    },
    { category: 'query' }
  )

  defineTool<{ title: string; description?: string; node_titles?: string[] }>(
    'create_storyline',
    'Create a storyline and optionally thread the named nodes into it, in the order given',
    {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Storyline title' },
        description: { type: 'string', description: 'What the storyline covers (optional)' },
        node_titles: { type: 'array', items: { type: 'string' }, description: 'Titles of nodes to add, in reading order' },
      },
      required: ['title'],
    },
    async (args, ctx) => {
      if (!ctx.store.createStoryline || !ctx.store.addNodeToStoryline) {
        return 'Error: storylines are not available in this context'
      }
      const storyline = await ctx.store.createStoryline(args.title, args.description)

      let added = 0
      for (const title of args.node_titles || []) {
        const node = findNodeByTitle(ctx.store.filteredNodes, title)
        if (!node) continue
        await ctx.store.addNodeToStoryline(storyline.id, node.id)
        added++
      }
      return `Created storyline "${args.title}" with ${added} node(s)`
    },
    { category: 'crud' }
  )

  defineTool<{ storyline_title: string; node_titles: string[] }>(
    'add_node_to_storyline',
    'Append existing nodes to an existing storyline, by title',
    {
      type: 'object',
      properties: {
        storyline_title: { type: 'string', description: 'Title of the target storyline' },
        node_titles: { type: 'array', items: { type: 'string' }, description: 'Titles of nodes to append, in order' },
      },
      required: ['storyline_title', 'node_titles'],
    },
    async (args, ctx) => {
      if (!ctx.store.getStorylines || !ctx.store.addNodeToStoryline) {
        return 'Error: storylines are not available in this context'
      }
      const storyline = ctx.store
        .getStorylines()
        .find(s => s.title.toLowerCase() === args.storyline_title.toLowerCase())
      if (!storyline) return `Error: Storyline "${args.storyline_title}" not found`

      let added = 0
      for (const title of args.node_titles || []) {
        const node = findNodeByTitle(ctx.store.filteredNodes, title)
        if (!node) continue
        await ctx.store.addNodeToStoryline(storyline.id, node.id)
        added++
      }
      if (added === 0) return 'Error: none of the named nodes were found'
      return `Added ${added} node(s) to storyline "${storyline.title}"`
    },
    { category: 'update' }
  )

  defineTool<Record<string, never>>(
    'list_storylines',
    'List the storylines in this workspace',
    { type: 'object', properties: {} },
    async (_args, ctx) => {
      if (!ctx.store.getStorylines) return 'Error: storylines are not available in this context'
      const storylines = ctx.store.getStorylines()
      if (storylines.length === 0) return 'No storylines in this workspace'
      return storylines.map(s => `${s.title}${s.description ? `: ${s.description}` : ''}`).join('\n')
    },
    { category: 'query' }
  )
}
