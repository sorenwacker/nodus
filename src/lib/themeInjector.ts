/**
 * Theme CSS Injector
 * Generates and injects CSS from parsed YAML theme data
 */
import type { ParsedTheme, ThemeVariables, ThemeEffects } from '../types/theme'

const STYLE_ID = 'nodus-dynamic-theme'

/**
 * Convert snake_case to kebab-case for CSS variable names
 */
function toKebabCase(str: string): string {
  return str.replace(/_/g, '-')
}

/**
 * Generate CSS variables from theme variables object
 */
function generateCSSVariables(variables: ThemeVariables): string {
  const lines: string[] = []
  for (const [key, value] of Object.entries(variables)) {
    if (value !== undefined && value !== null) {
      lines.push(`  --${toKebabCase(key)}: ${value};`)
    }
  }
  return lines.join('\n')
}

/**
 * Generate CSS variables from extras object
 */
function generateExtrasVariables(extras: Record<string, string>): string {
  const lines: string[] = []
  for (const [key, value] of Object.entries(extras)) {
    lines.push(`  --${toKebabCase(key)}: ${value};`)
  }
  return lines.join('\n')
}

/**
 * Generate effect CSS rules
 */
function generateEffectsCSS(themeName: string, effects: ThemeEffects): string {
  const rules: string[] = []

  // Node card effects
  if (effects.node_card) {
    const props: string[] = []
    if (effects.node_card.box_shadow)
      props.push(`  box-shadow: ${effects.node_card.box_shadow};`)
    if (effects.node_card.border_color)
      props.push(`  border-color: ${effects.node_card.border_color};`)
    if (effects.node_card.filter)
      props.push(`  filter: ${effects.node_card.filter};`)
    if (effects.node_card.background)
      props.push(`  background: ${effects.node_card.background};`)
    if (props.length > 0) {
      rules.push(`[data-theme='${themeName}'] .node-card {\n${props.join('\n')}\n}`)
    }
  }

  if (effects.node_card_hover) {
    const props: string[] = []
    if (effects.node_card_hover.box_shadow)
      props.push(`  box-shadow: ${effects.node_card_hover.box_shadow};`)
    if (effects.node_card_hover.border_color)
      props.push(`  border-color: ${effects.node_card_hover.border_color};`)
    if (effects.node_card_hover.filter)
      props.push(`  filter: ${effects.node_card_hover.filter};`)
    if (props.length > 0) {
      rules.push(`[data-theme='${themeName}'] .node-card:hover {\n${props.join('\n')}\n}`)
    }
  }

  if (effects.node_card_selected) {
    const props: string[] = []
    if (effects.node_card_selected.box_shadow)
      props.push(`  box-shadow: ${effects.node_card_selected.box_shadow};`)
    if (effects.node_card_selected.border_color)
      props.push(`  border-color: ${effects.node_card_selected.border_color};`)
    if (effects.node_card_selected.filter)
      props.push(`  filter: ${effects.node_card_selected.filter};`)
    if (props.length > 0) {
      rules.push(`[data-theme='${themeName}'] .node-card.selected {\n${props.join('\n')}\n}`)
    }
  }

  // Edge effects
  if (effects.edge_glow) {
    const props: string[] = []
    if (effects.edge_glow.filter) props.push(`  filter: ${effects.edge_glow.filter};`)
    if (props.length > 0) {
      rules.push(
        `[data-theme='${themeName}'] .edge-line-visible,\n[data-theme='${themeName}'] .edge-line-fast {\n${props.join('\n')}\n}`
      )
    }
  }

  if (effects.edge_highlighted) {
    const props: string[] = []
    if (effects.edge_highlighted.filter)
      props.push(`  filter: ${effects.edge_highlighted.filter};`)
    if (props.length > 0) {
      rules.push(`[data-theme='${themeName}'] .edge-highlighted {\n${props.join('\n')}\n}`)
    }
  }

  if (effects.edge_selected) {
    const props: string[] = []
    if (effects.edge_selected.filter)
      props.push(`  filter: ${effects.edge_selected.filter};`)
    if (props.length > 0) {
      rules.push(`[data-theme='${themeName}'] .edge-selected {\n${props.join('\n')}\n}`)
    }
  }

  return rules.join('\n\n')
}

/**
 * Generate complete CSS for a theme
 */
export function generateThemeCSS(theme: ParsedTheme): string {
  const parts: string[] = []

  // Root variables (apply to all when this theme is active)
  const varLines = generateCSSVariables(theme.variables)
  const extrasLines = theme.extras ? generateExtrasVariables(theme.extras) : ''
  const allVars = [varLines, extrasLines].filter(Boolean).join('\n')

  // For the theme selector
  if (theme.name === 'light') {
    // Light theme is the default (applies to :root)
    parts.push(`:root {\n${allVars}\n}`)
  } else {
    parts.push(`[data-theme='${theme.name}'] {\n${allVars}\n}`)
  }

  // Effects
  if (theme.effects) {
    const effectsCSS = generateEffectsCSS(theme.name, theme.effects)
    if (effectsCSS) {
      parts.push(effectsCSS)
    }
  }

  return parts.join('\n\n')
}

/**
 * Inject theme CSS into the document
 */
export function injectTheme(theme: ParsedTheme): void {
  // Remove existing dynamic style if present
  let styleEl = document.getElementById(STYLE_ID) as HTMLStyleElement | null
  if (!styleEl) {
    styleEl = document.createElement('style')
    styleEl.id = STYLE_ID
    document.head.appendChild(styleEl)
  }

  // Generate and inject CSS
  const css = generateThemeCSS(theme)
  styleEl.textContent = css
}

/**
 * Clear injected theme CSS
 */
export function clearInjectedTheme(): void {
  const styleEl = document.getElementById(STYLE_ID)
  if (styleEl) {
    styleEl.remove()
  }
}
