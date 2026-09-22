/**
 * Selection-aware tools.
 *
 * They act on `ctx.selectedNodeIds`, the selection captured when the run
 * started (PRODUCT_DESIGN.md > What the agent acts on), and write through
 * the store like every other tool.
 */

import { defineTool, findNodeByTitle, type ToolContext } from '../registry'

function selection(ctx: ToolContext): string[] {
  return ctx.selectedNodeIds || []
}

/** The selected nodes' text, as `## title` sections, for tools that hand it back to the model */
function selectedSections(ctx: ToolContext): string[] {
  const nodes = ctx.store.filteredNodes
  return selection(ctx)
    .map(id => nodes.find(n => n.id === id))
    .filter((n): n is NonNullable<typeof n> => n !== undefined)
    .map(n => `## ${n.title}\n${n.markdown_content || '(empty)'}`)
}

export function registerSelectionTools(): void {
  defineTool<{ content: string }>(
    'update_selected_content',
    'Replace the content of the selected node(s). Use when user says "update this", "change this to", etc.',
    {
      type: 'object',
      properties: {
        content: { type: 'string', description: 'New markdown content for the selected node(s)' },
      },
      required: ['content'],
    },
    async (args, ctx) => {
      const ids = selection(ctx)
      if (ids.length === 0) return 'Error: No nodes selected. Select a node first.'
      for (const id of ids) {
        await ctx.store.updateNodeContent(id, args.content ?? '')
        ctx.log(`> Updated content for node ${id}`)
      }
      return `Updated content for ${ids.length} node(s)`
    },
    { modes: ['execute'], mutates: true }
  )

  defineTool<{ text: string }>(
    'append_to_selected',
    'Append text to the end of the selected node(s). Use when user says "add to this", "append", etc.',
    {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'Text to append to selected node(s)' },
      },
      required: ['text'],
    },
    async (args, ctx) => {
      const ids = selection(ctx)
      if (ids.length === 0) return 'Error: No nodes selected. Select a node first.'
      let appended = 0
      for (const id of ids) {
        const node = ctx.store.filteredNodes.find(n => n.id === id)
        if (!node) continue
        await ctx.store.updateNodeContent(id, (node.markdown_content || '') + '\n\n' + (args.text ?? ''))
        ctx.log(`> Appended to node ${id}`)
        appended++
      }
      return `Appended text to ${appended} node(s)`
    },
    { modes: ['execute'], mutates: true }
  )

  defineTool<{ title: string }>(
    'rename_selected',
    'Rename the selected node. Only works with single selection.',
    {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'New title for the selected node' },
      },
      required: ['title'],
    },
    async (args, ctx) => {
      const ids = selection(ctx)
      if (ids.length === 0) return 'Error: No nodes selected. Select a node first.'
      if (ids.length > 1) return 'Error: Cannot rename multiple nodes at once. Select a single node.'
      const title = args.title ?? ''
      await ctx.store.updateNodeTitle(ids[0], title)
      ctx.log(`> Renamed node to "${title}"`)
      return `Renamed node to "${title}"`
    },
    { modes: ['execute'], mutates: true }
  )

  defineTool<{ color: string }>(
    'color_selected',
    'Set the color of all selected nodes. Use when user says "color these", "make these red", etc.',
    {
      type: 'object',
      properties: {
        color: {
          type: 'string',
          description: 'Color value (hex like #ff0000, or name like "red", "blue", "green")',
        },
      },
      required: ['color'],
    },
    async (args, ctx) => {
      const ids = selection(ctx)
      if (ids.length === 0) return 'Error: No nodes selected. Select node(s) first.'
      if (!ctx.store.updateNodeColor) return 'Node colouring is not available in this context'
      const color = args.color ?? ''
      for (const id of ids) await ctx.store.updateNodeColor(id, color)
      ctx.log(`> Colored ${ids.length} node(s) ${color}`)
      return `Colored ${ids.length} node(s) ${color}`
    },
    { modes: ['execute'], mutates: true }
  )

  defineTool<Record<string, never>>(
    'delete_selected',
    'Delete all selected nodes. Use when user says "delete these", "remove selected", etc.',
    {
      type: 'object',
      properties: {},
      required: [],
    },
    async (_args, ctx) => {
      const ids = selection(ctx)
      if (ids.length === 0) return 'Error: No nodes selected. Select node(s) first.'
      // NodeService guarantees an undo entry; the store is the fallback
      if (ctx.service) {
        await ctx.service.deleteNodes(ids)
      } else {
        for (const id of ids) await ctx.store.deleteNode(id)
      }
      ctx.log(`> Deleted ${ids.length} node(s)`)
      return `Deleted ${ids.length} node(s)`
    },
    { modes: ['execute'], mutates: true }
  )

  defineTool<{ target_title: string; label?: string }>(
    'connect_selected_to',
    'Connect the selected node(s) to another node by title. Creates edges from all selected to target.',
    {
      type: 'object',
      properties: {
        target_title: { type: 'string', description: 'Title of the target node to connect to' },
        label: { type: 'string', description: 'Optional edge label (e.g., "related to", "causes")' },
      },
      required: ['target_title'],
    },
    async (args, ctx) => {
      const ids = selection(ctx)
      if (ids.length === 0) return 'Error: No nodes selected. Select node(s) first.'

      const targetNode = findNodeByTitle(ctx.store.filteredNodes, args.target_title)
      if (!targetNode) return `Error: Node "${args.target_title}" not found.`

      const results: string[] = []
      for (const sourceId of ids) {
        if (sourceId === targetNode.id) continue // Skip self-connection
        try {
          await ctx.store.createEdge({
            source_node_id: sourceId,
            target_node_id: targetNode.id,
            label: args.label || 'related to',
          })
          results.push(`Connected to "${args.target_title}"`)
        } catch (e) {
          results.push(`Failed to connect: ${e instanceof Error ? e.message : String(e)}`)
        }
      }
      return results.join('; ')
    },
    { modes: ['execute'], mutates: true }
  )

  defineTool<{ instruction?: string }>(
    'summarize_selected',
    'Create a summary of all selected nodes. Generates a new node with the summary.',
    {
      type: 'object',
      properties: {
        instruction: {
          type: 'string',
          description: 'Optional instruction for how to summarize (e.g., "key points only", "as bullet list")',
        },
      },
      required: [],
    },
    async (args, ctx) => {
      if (selection(ctx).length === 0) return 'Error: No nodes selected. Select node(s) first.'
      const sections = selectedSections(ctx)
      if (sections.length === 0) return 'No content to summarize'
      // The content goes back to the model, which writes the summary
      return `SUMMARIZE (${args.instruction || 'Summarize the key points'}):\n${sections.join('\n\n')}`
    },
    { modes: ['execute'], mutates: false }
  )

  defineTool<{ instruction?: string }>(
    'expand_selected',
    'Expand the selected node with more detail. Use when user says "expand this", "add more detail", etc.',
    {
      type: 'object',
      properties: {
        instruction: {
          type: 'string',
          description: 'Optional instruction for how to expand (e.g., "add examples", "explain further")',
        },
      },
      required: [],
    },
    async (args, ctx) => {
      if (selection(ctx).length === 0) return 'Error: No nodes selected. Select a node first.'
      const sections = selectedSections(ctx)
      if (sections.length === 0) return 'No content to expand'
      return `EXPAND (${args.instruction || 'Expand with more detail'}) - Use update_selected_content to apply changes:\n${sections.join('\n\n')}`
    },
    { modes: ['execute'], mutates: false }
  )
}
