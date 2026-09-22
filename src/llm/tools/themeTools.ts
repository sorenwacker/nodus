/**
 * Theme tools: create_theme, update_theme, apply_theme, list_themes.
 *
 * The themes store and the model arrive as context services; nothing here
 * reaches for either.
 */

import { defineTool } from '../registry'
import { cleanYAMLResponse } from '../../lib/parsing'

function formatDisplayName(name: string): string {
  return name
    .split('-')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

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
    async (args, ctx) => {
      const themeName = args.name || 'custom-theme'
      const description = args.description || ''
      ctx.log(`> Creating theme: ${themeName}`)

      try {
        const prompt = `Create a YAML theme configuration based on this description: "${description}"

The theme should have this structure:
name: "${themeName}"
display_name: "${formatDisplayName(themeName)}"
description: "${description}"
is_dark: false (or true if it's a dark theme)
variables:
  bg_canvas: "#hex"
  bg_surface: "#hex"
  bg_surface_alt: "#hex"
  bg_elevated: "#hex"
  text_main: "#hex"
  text_secondary: "#hex"
  text_muted: "#hex"
  border_default: "#hex"
  border_subtle: "#hex"
  primary_color: "#hex"
  danger_color: "#hex"
  danger_bg: "#hex"
  danger_border: "#hex"
  dot_color: "#hex"
  shadow_sm: "rgba(...)"
  shadow_md: "rgba(...)"

Make colors match the description. Be creative! Output ONLY the YAML, no explanations.`

        const yamlContent = await ctx.llm!.generate(prompt)
        if (!yamlContent) return 'Failed to generate theme'

        const newTheme = await ctx.themes!.createTheme({
          name: themeName,
          display_name: formatDisplayName(themeName),
          yaml_content: cleanYAMLResponse(yamlContent),
        })
        ctx.themes!.setTheme(newTheme.name)
        return `Created and applied theme "${themeName}"`
      } catch (e) {
        return `Failed to create theme: ${e}`
      }
    },
    { modes: ['execute'], mutates: true, requires: ['themes', 'llm'] }
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
    async (args, ctx) => {
      const themeName = args.name || ''
      if (!themeName) return 'Theme name required'
      ctx.log(`> Updating theme: ${themeName}`)

      try {
        const theme = ctx.themes!.themes.find(t => t.name === themeName)
        if (!theme) return `Theme "${themeName}" not found`
        if (theme.is_builtin === 1) return 'Cannot modify built-in themes'

        const prompt = `Update this theme YAML based on the instruction: "${args.changes || ''}"

Current theme YAML:
${theme.yaml_content}

Apply the changes and output the complete updated YAML. Output ONLY the YAML, no explanations.`

        const yamlContent = await ctx.llm!.generate(prompt)
        if (!yamlContent) return 'Failed to generate updated theme'

        await ctx.themes!.updateTheme({
          id: theme.id,
          yaml_content: cleanYAMLResponse(yamlContent),
          display_name: theme.display_name,
        })
        return `Updated theme "${themeName}"`
      } catch (e) {
        return `Failed to update theme: ${e}`
      }
    },
    { modes: ['execute'], mutates: true, requires: ['themes', 'llm'] }
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
    async (args, ctx) => {
      const themeName = args.name || ''
      if (!themeName) return 'Theme name required'
      const themes = ctx.themes!
      const theme = themes.themes.find(t => t.name === themeName)
      if (!theme) {
        return `Theme "${themeName}" not found. Available: ${themes.themes.map(t => t.name).join(', ')}`
      }
      themes.setTheme(themeName)
      return `Applied theme "${themeName}"`
    },
    { modes: ['execute'], mutates: true, requires: ['themes'] }
  )

  defineTool<Record<string, never>>(
    'list_themes',
    'List available themes',
    {
      type: 'object',
      properties: {},
      required: [],
    },
    async (_args, ctx) => {
      const themes = ctx.themes!
      const builtin = themes.builtinThemes.map(t => t.name)
      const custom = themes.customThemes.map(t => t.name)
      return `Built-in themes: ${builtin.join(', ')}\nCustom themes: ${custom.length > 0 ? custom.join(', ') : '(none)'}\nCurrent: ${themes.currentThemeName}`
    },
    { modes: ['execute'], mutates: false, requires: ['themes'] }
  )
}
