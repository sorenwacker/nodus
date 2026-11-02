/**
 * Tag and storyline tool registrations for the in-app agent.
 *
 * Grouping names a set of nodes with a shared tag. Frames did this by drawing
 * a box whose stored membership drifted from what it enclosed, and are
 * removed (docs/design/remove-frames.md).
 *
 * Handles: tag_nodes, create_storyline, add_node_to_storyline, list_storylines
 */

import { defineTool, findNodeByTitle } from '../registry'
import { toTag } from '../../lib/contentParser'
import { recordedTagsOf } from '../../lib/tagSync'

export function registerGroupingTools(): void {
  defineTool<{ tag: string; node_titles: string[] }>(
    'tag_nodes',
    'Group nodes by adding the same tag to each, by title. The name is converted to a valid tag (e.g. "Demo Project" becomes demo-project)',
    {
      type: 'object',
      properties: {
        tag: { type: 'string', description: 'Group name or tag' },
        node_titles: { type: 'array', items: { type: 'string' }, description: 'Titles of the nodes to tag' },
      },
      required: ['tag', 'node_titles'],
    },
    async (args, ctx) => {
      if (!ctx.store.updateNodeTags) return 'Error: tags are not available in this context'
      const tag = toTag(args.tag)
      if (!tag) return `Error: "${args.tag}" contains no characters a tag can use`

      const named = (args.node_titles || [])
        .map(t => findNodeByTitle(ctx.store.filteredNodes, t))
        .filter((n): n is NonNullable<typeof n> => Boolean(n))

      for (const node of named) {
        const tags = recordedTagsOf(node)
        if (!tags.includes(tag)) await ctx.store.updateNodeTags(node.id, [...tags, tag])
      }

      const missing = (args.node_titles || []).length - named.length
      const note = missing > 0 ? ` (${missing} named node(s) not found)` : ''
      return `Tagged ${named.length} node(s) with #${tag}${note}`
    },
    { category: 'update' }
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
