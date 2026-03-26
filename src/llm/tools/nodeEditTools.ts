/**
 * Node editing tool registrations
 *
 * Tools for editing individual node content, used by the node agent:
 * - update_content: Replace node content
 * - append_content: Append text to node content
 * - update_title: Change node title
 * - node_done: Signal node editing completion (with content validation)
 *
 * These tools return markers that are handled by useNodeAgent.
 */

import { defineTool } from '../registry'

export function registerNodeEditTools(): void {
  defineTool<{ content: string }>(
    'update_content',
    'Update the note content with new text. THIS SAVES YOUR WORK.',
    {
      type: 'object',
      properties: {
        content: { type: 'string', description: 'New content for the note (markdown)' },
      },
      required: ['content'],
    },
    async (args, _ctx) => {
      return `__UPDATE_CONTENT__:${JSON.stringify({ content: args.content })}`
    },
    { category: 'node-edit' }
  )

  defineTool<{ text: string }>(
    'append_content',
    'Append text to the end of the note.',
    {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'Text to append' },
      },
      required: ['text'],
    },
    async (args, _ctx) => {
      return `__APPEND_CONTENT__:${JSON.stringify({ text: args.text })}`
    },
    { category: 'node-edit' }
  )

  defineTool<{ title: string }>(
    'update_title',
    'Change the note title.',
    {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'New title' },
      },
      required: ['title'],
    },
    async (args, _ctx) => {
      return `__UPDATE_TITLE__:${JSON.stringify({ title: args.title })}`
    },
    { category: 'node-edit' }
  )

  // Node-specific done tool with content validation
  // This is separate from the graph agent's done() which checks for edges
  defineTool<{ summary: string }>(
    'node_done',
    'Signal that the node editing task is complete. You MUST call update_content first.',
    {
      type: 'object',
      properties: {
        summary: { type: 'string', description: 'Brief summary of what was done' },
      },
      required: ['summary'],
    },
    async (args, _ctx) => {
      // Return marker - actual validation happens in useNodeAgent
      return `__NODE_DONE__:${JSON.stringify({ summary: args.summary })}`
    },
    { category: 'node-edit' }
  )
}
