/**
 * Theme type definitions for YAML-based theme system
 */

/**
 * Core CSS variable mappings
 */
export interface ThemeVariables {
  bg_canvas: string
  bg_surface: string
  bg_surface_alt: string
  bg_elevated: string
  text_main: string
  text_secondary: string
  text_muted: string
  border_default: string
  border_subtle: string
  primary_color: string
  danger_color?: string
  danger_bg?: string
  danger_border?: string
  dot_color: string
  shadow_sm: string
  shadow_md: string
}

/**
 * Effect definition for specific UI elements
 */
export interface ThemeEffect {
  box_shadow?: string
  border_color?: string
  filter?: string
  background?: string
}

/**
 * Theme effects for various UI states
 */
export interface ThemeEffects {
  node_card?: ThemeEffect
  node_card_hover?: ThemeEffect
  node_card_selected?: ThemeEffect
  edge_glow?: ThemeEffect
  edge_highlighted?: ThemeEffect
  edge_selected?: ThemeEffect
}

/**
 * Parsed theme YAML structure
 */
export interface ParsedTheme {
  name: string
  display_name: string
  description?: string
  is_dark: boolean
  variables: ThemeVariables
  extras?: Record<string, string>
  effects?: ThemeEffects
}

/**
 * Database theme record
 */
export interface DbTheme {
  id: string
  name: string
  display_name: string
  yaml_content: string
  is_builtin: number // 0 or 1 from SQLite
  workspace_id: string | null
  created_at: number
  updated_at: number
}

/**
 * Input for creating a new theme
 */
export interface CreateThemeInput {
  name: string
  display_name: string
  yaml_content: string
  workspace_id?: string
}

/**
 * Input for updating an existing theme
 */
export interface UpdateThemeInput {
  id: string
  yaml_content: string
  display_name: string
}

/**
 * Convert snake_case CSS variable names to kebab-case
 */
export function variableNameToCSS(name: string): string {
  return `--${name.replace(/_/g, '-')}`
}

/**
 * Get all CSS variable names from ThemeVariables
 */
export const THEME_CSS_VARIABLES = [
  'bg-canvas',
  'bg-surface',
  'bg-surface-alt',
  'bg-elevated',
  'text-main',
  'text-secondary',
  'text-muted',
  'border-default',
  'border-subtle',
  'primary-color',
  'danger-color',
  'danger-bg',
  'danger-border',
  'dot-color',
  'shadow-sm',
  'shadow-md',
] as const
