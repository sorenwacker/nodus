/**
 * Node color utilities
 *
 * Handles legacy color mapping and node background generation
 */

// Map legacy color values to current colors
const legacyColorMap: Record<string, string> = {
  // Old solid pastels
  '#fecaca': 'rgba(239, 68, 68, 0.08)',
  '#fed7aa': 'rgba(249, 115, 22, 0.08)',
  '#fef08a': 'rgba(234, 179, 8, 0.08)',
  '#bbf7d0': 'rgba(34, 197, 94, 0.08)',
  '#bfdbfe': 'rgba(59, 130, 246, 0.08)',
  '#e9d5ff': 'rgba(168, 85, 247, 0.08)',
  '#fbcfe8': 'rgba(236, 72, 153, 0.08)',
  // Old very light pastels
  '#fef2f2': 'rgba(239, 68, 68, 0.08)',
  '#fff7ed': 'rgba(249, 115, 22, 0.08)',
  '#fefce8': 'rgba(234, 179, 8, 0.08)',
  '#f0fdf4': 'rgba(34, 197, 94, 0.08)',
  '#eff6ff': 'rgba(59, 130, 246, 0.08)',
  '#faf5ff': 'rgba(168, 85, 247, 0.08)',
  '#fdf2f8': 'rgba(236, 72, 153, 0.08)',
  // Old rgba values with different alphas
  'rgba(239, 68, 68, 0.15)': 'rgba(239, 68, 68, 0.08)',
  'rgba(249, 115, 22, 0.15)': 'rgba(249, 115, 22, 0.08)',
  'rgba(234, 179, 8, 0.15)': 'rgba(234, 179, 8, 0.08)',
  'rgba(34, 197, 94, 0.15)': 'rgba(34, 197, 94, 0.08)',
  'rgba(59, 130, 246, 0.15)': 'rgba(59, 130, 246, 0.08)',
  'rgba(168, 85, 247, 0.15)': 'rgba(168, 85, 247, 0.08)',
  'rgba(236, 72, 153, 0.15)': 'rgba(236, 72, 153, 0.08)',
}

/**
 * Normalize legacy color values to current format
 */
export function normalizeLegacyColor(color: string): string {
  return legacyColorMap[color] || color
}

/**
 * Check if a theme is dark
 */
export function isDarkTheme(theme: string): boolean {
  return theme === 'dark' || theme === 'pitch-black' || theme === 'cyber'
}

/**
 * Get node background - layers transparent color over solid base
 * Handles legacy color normalization and theme-aware brightness filtering
 */
export function getNodeBackground(colorTheme: string | null, currentTheme: string): string | undefined {
  if (!colorTheme) return undefined

  // Normalize legacy colors to current format
  const normalizedColor = normalizeLegacyColor(colorTheme)

  // Check if color is problematic for current theme
  // In dark mode, don't use very light colors; in light mode, don't use very dark colors
  if (normalizedColor.startsWith('#')) {
    const hex = normalizedColor.replace('#', '')
    const r = parseInt(hex.substr(0, 2), 16)
    const g = parseInt(hex.substr(2, 2), 16)
    const b = parseInt(hex.substr(4, 2), 16)
    const brightness = (r * 299 + g * 587 + b * 114) / 1000

    const isDark = isDarkTheme(currentTheme)

    // If color is too bright for dark mode (>200) or too dark for light mode (<50), skip it
    if ((isDark && brightness > 200) || (!isDark && brightness < 50)) {
      return undefined
    }
  }

  // Use linear-gradient to layer transparent color over solid background
  return `linear-gradient(${normalizedColor}, ${normalizedColor}), var(--bg-surface)`
}
