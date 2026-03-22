/**
 * Theme tool registrations
 *
 * Handles: create_theme, update_theme, apply_theme, list_themes
 */

import { defineTool } from '../registry'

export function registerThemeTools(): void {
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
}
