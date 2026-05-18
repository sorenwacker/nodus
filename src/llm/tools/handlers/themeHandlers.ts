/**
 * Theme Tool Handlers
 *
 * Handles theme creation, updates, and management via LLM.
 */

import type { ToolHandler, ToolContext } from './types'
import { parseToolArgs, getStringArg, cleanYAMLResponse } from '../../../lib/parsing'

/**
 * Create a new theme based on description
 */
export const createThemeHandler: ToolHandler = async (
  args: Record<string, unknown>,
  ctx: ToolContext
): Promise<string> => {
  const parsed = parseToolArgs(args)
  const themeName = getStringArg(parsed, 'name', 'custom-theme')
  const description = getStringArg(parsed, 'description', '')

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

    const yamlContent = await ctx.llmQueue.generate(prompt)
    if (!yamlContent) return 'Failed to generate theme'

    const cleanYaml = cleanYAMLResponse(yamlContent)

    const newTheme = await ctx.themesStore.createTheme({
      name: themeName,
      display_name: formatDisplayName(themeName),
      yaml_content: cleanYaml,
    })

    ctx.themesStore.setTheme(newTheme.name)
    return `Created and applied theme "${themeName}"`
  } catch (e) {
    console.error('[ThemeHandler] Error creating theme:', e)
    return `Failed to create theme: ${e}`
  }
}

/**
 * Update an existing theme
 */
export const updateThemeHandler: ToolHandler = async (
  args: Record<string, unknown>,
  ctx: ToolContext
): Promise<string> => {
  const parsed = parseToolArgs(args)
  const themeName = getStringArg(parsed, 'name', '')
  const changes = getStringArg(parsed, 'changes', '')

  if (!themeName) return 'Theme name required'
  ctx.log(`> Updating theme: ${themeName}`)

  try {
    const theme = ctx.themesStore.themes.find((t) => t.name === themeName)
    if (!theme) return `Theme "${themeName}" not found`
    if (theme.is_builtin === 1) return 'Cannot modify built-in themes'

    const prompt = `Update this theme YAML based on the instruction: "${changes}"

Current theme YAML:
${theme.yaml_content}

Apply the changes and output the complete updated YAML. Output ONLY the YAML, no explanations.`

    const yamlContent = await ctx.llmQueue.generate(prompt)
    if (!yamlContent) return 'Failed to generate updated theme'

    const cleanYaml = cleanYAMLResponse(yamlContent)

    await ctx.themesStore.updateTheme({
      id: theme.id,
      yaml_content: cleanYaml,
      display_name: theme.display_name,
    })

    return `Updated theme "${themeName}"`
  } catch (e) {
    return `Failed to update theme: ${e}`
  }
}

/**
 * Apply an existing theme
 */
export const applyThemeHandler: ToolHandler = async (
  args: Record<string, unknown>,
  ctx: ToolContext
): Promise<string> => {
  const parsed = parseToolArgs(args)
  const themeName = getStringArg(parsed, 'name', '')

  if (!themeName) return 'Theme name required'

  const theme = ctx.themesStore.themes.find((t) => t.name === themeName)
  if (!theme) {
    return `Theme "${themeName}" not found. Available: ${ctx.themesStore.themes.map((t) => t.name).join(', ')}`
  }

  ctx.themesStore.setTheme(themeName)
  return `Applied theme "${themeName}"`
}

/**
 * List available themes
 */
export const listThemesHandler: ToolHandler = async (
  _args: Record<string, unknown>,
  ctx: ToolContext
): Promise<string> => {
  const builtin = ctx.themesStore.builtinThemes.map((t) => t.name)
  const custom = ctx.themesStore.customThemes.map((t) => t.name)
  return `Built-in themes: ${builtin.join(', ')}\nCustom themes: ${custom.length > 0 ? custom.join(', ') : '(none)'}\nCurrent: ${ctx.themesStore.currentThemeName}`
}

/**
 * Format theme name as display name
 */
function formatDisplayName(name: string): string {
  return name
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}
