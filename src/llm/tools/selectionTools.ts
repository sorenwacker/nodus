/**
 * Selection-aware tool registrations
 *
 * Tools that operate on currently selected nodes. When nodes are selected,
 * they become both context AND targets for AI operations.
 *
 * These tools return markers that are handled by the agent in PixiCanvas.
 */

import { defineTool, type ToolContext } from '../registry'

/**
 * Extended ToolContext with selection state
 */
interface SelectionToolContext extends ToolContext {
  selectedNodeIds?: string[]
  editingNodeId?: string | null
}

export function registerSelectionTools(): void {
  // Update content of selected node(s)
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
      const selCtx = ctx as SelectionToolContext
      const selectedIds = selCtx.selectedNodeIds || []

      if (selectedIds.length === 0) {
        return 'Error: No nodes selected. Select a node first.'
      }

      // Return marker for handler to process
      return `__SELECTION_UPDATE_CONTENT__:${JSON.stringify({
        nodeIds: selectedIds,
        content: args.content,
      })}`
    },
    { category: 'selection' }
  )

  // Append to selected node(s)
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
      const selCtx = ctx as SelectionToolContext
      const selectedIds = selCtx.selectedNodeIds || []

      if (selectedIds.length === 0) {
        return 'Error: No nodes selected. Select a node first.'
      }

      return `__SELECTION_APPEND__:${JSON.stringify({
        nodeIds: selectedIds,
        text: args.text,
      })}`
    },
    { category: 'selection' }
  )

  // Rename selected node
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
      const selCtx = ctx as SelectionToolContext
      const selectedIds = selCtx.selectedNodeIds || []

      if (selectedIds.length === 0) {
        return 'Error: No nodes selected. Select a node first.'
      }
      if (selectedIds.length > 1) {
        return 'Error: Cannot rename multiple nodes at once. Select a single node.'
      }

      return `__SELECTION_RENAME__:${JSON.stringify({
        nodeId: selectedIds[0],
        title: args.title,
      })}`
    },
    { category: 'selection' }
  )

  // Color selected nodes
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
      const selCtx = ctx as SelectionToolContext
      const selectedIds = selCtx.selectedNodeIds || []

      if (selectedIds.length === 0) {
        return 'Error: No nodes selected. Select node(s) first.'
      }

      return `__SELECTION_COLOR__:${JSON.stringify({
        nodeIds: selectedIds,
        color: args.color,
      })}`
    },
    { category: 'selection' }
  )

  // Delete selected nodes
  defineTool<Record<string, never>>(
    'delete_selected',
    'Delete all selected nodes. Use when user says "delete these", "remove selected", etc.',
    {
      type: 'object',
      properties: {},
      required: [],
    },
    async (_args, ctx) => {
      const selCtx = ctx as SelectionToolContext
      const selectedIds = selCtx.selectedNodeIds || []

      if (selectedIds.length === 0) {
        return 'Error: No nodes selected. Select node(s) first.'
      }

      return `__SELECTION_DELETE__:${JSON.stringify({
        nodeIds: selectedIds,
      })}`
    },
    { category: 'selection' }
  )

  // Connect selected to another node
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
      const selCtx = ctx as SelectionToolContext
      const selectedIds = selCtx.selectedNodeIds || []

      if (selectedIds.length === 0) {
        return 'Error: No nodes selected. Select node(s) first.'
      }

      // Find target node by title
      const targetNode = ctx.store.filteredNodes.find(
        n => n.title.toLowerCase() === args.target_title.toLowerCase()
      )

      if (!targetNode) {
        return `Error: Node "${args.target_title}" not found.`
      }

      // Create edges from all selected nodes to target
      const results: string[] = []
      for (const sourceId of selectedIds) {
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
    { category: 'selection' }
  )

  // Summarize selected nodes
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
      const selCtx = ctx as SelectionToolContext
      const selectedIds = selCtx.selectedNodeIds || []

      if (selectedIds.length === 0) {
        return 'Error: No nodes selected. Select node(s) first.'
      }

      return `__SELECTION_SUMMARIZE__:${JSON.stringify({
        nodeIds: selectedIds,
        instruction: args.instruction || 'Summarize the key points',
      })}`
    },
    { category: 'selection' }
  )

  // Expand selected node (add detail)
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
      const selCtx = ctx as SelectionToolContext
      const selectedIds = selCtx.selectedNodeIds || []

      if (selectedIds.length === 0) {
        return 'Error: No nodes selected. Select a node first.'
      }

      return `__SELECTION_EXPAND__:${JSON.stringify({
        nodeIds: selectedIds,
        instruction: args.instruction || 'Expand with more detail',
      })}`
    },
    { category: 'selection' }
  )
}
