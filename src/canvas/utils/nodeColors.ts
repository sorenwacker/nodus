/**
 * Node color utilities
 *
 * Handles legacy color mapping, theme color conversion, and node background generation
 */

// Light theme colors (rgba tints)
const lightColors = [
  'rgba(239, 68, 68, 0.18)',   // red
  'rgba(249, 115, 22, 0.18)',  // orange
  'rgba(234, 179, 8, 0.18)',   // yellow
  'rgba(34, 197, 94, 0.18)',   // green
  'rgba(59, 130, 246, 0.18)',  // blue
  'rgba(168, 85, 247, 0.18)',  // purple
  'rgba(236, 72, 153, 0.18)',  // pink
]

// Dark theme colors (solid dark backgrounds)
const darkColors = [
  '#4d1f30', // red
  '#4d3300', // orange
  '#4d4d00', // yellow
  '#004d20', // green
  '#003d4d', // blue
  '#2e194d', // purple
  '#4d004d', // magenta/pink
]

// Create bidirectional mappings
const lightToDark: Record<string, string> = {}
const darkToLight: Record<string, string> = {}
for (let i = 0; i < lightColors.length; i++) {
  lightToDark[lightColors[i]] = darkColors[i]
  darkToLight[darkColors[i]] = lightColors[i]
}

// Also map old opacity values
const oldLightColors = [
  'rgba(239, 68, 68, 0.08)',
  'rgba(249, 115, 22, 0.08)',
  'rgba(234, 179, 8, 0.08)',
  'rgba(34, 197, 94, 0.08)',
  'rgba(59, 130, 246, 0.08)',
  'rgba(168, 85, 247, 0.08)',
  'rgba(236, 72, 153, 0.08)',
]
for (let i = 0; i < oldLightColors.length; i++) {
  lightToDark[oldLightColors[i]] = darkColors[i]
  darkToLight[darkColors[i]] = lightColors[i] // Map to new opacity
}

// Map legacy color values to current colors
const legacyColorMap: Record<string, string> = {
  // Old solid pastels -> new rgba
  '#fecaca': 'rgba(239, 68, 68, 0.18)',
  '#fed7aa': 'rgba(249, 115, 22, 0.18)',
  '#fef08a': 'rgba(234, 179, 8, 0.18)',
  '#bbf7d0': 'rgba(34, 197, 94, 0.18)',
  '#bfdbfe': 'rgba(59, 130, 246, 0.18)',
  '#e9d5ff': 'rgba(168, 85, 247, 0.18)',
  '#fbcfe8': 'rgba(236, 72, 153, 0.18)',
  // Old very light pastels
  '#fef2f2': 'rgba(239, 68, 68, 0.18)',
  '#fff7ed': 'rgba(249, 115, 22, 0.18)',
  '#fefce8': 'rgba(234, 179, 8, 0.18)',
  '#f0fdf4': 'rgba(34, 197, 94, 0.18)',
  '#eff6ff': 'rgba(59, 130, 246, 0.18)',
  '#faf5ff': 'rgba(168, 85, 247, 0.18)',
  '#fdf2f8': 'rgba(236, 72, 153, 0.18)',
  // Old rgba values with different alphas
  'rgba(239, 68, 68, 0.08)': 'rgba(239, 68, 68, 0.18)',
  'rgba(249, 115, 22, 0.08)': 'rgba(249, 115, 22, 0.18)',
  'rgba(234, 179, 8, 0.08)': 'rgba(234, 179, 8, 0.18)',
  'rgba(34, 197, 94, 0.08)': 'rgba(34, 197, 94, 0.18)',
  'rgba(59, 130, 246, 0.08)': 'rgba(59, 130, 246, 0.18)',
  'rgba(168, 85, 247, 0.08)': 'rgba(168, 85, 247, 0.18)',
  'rgba(236, 72, 153, 0.08)': 'rgba(236, 72, 153, 0.18)',
  'rgba(239, 68, 68, 0.15)': 'rgba(239, 68, 68, 0.18)',
  'rgba(249, 115, 22, 0.15)': 'rgba(249, 115, 22, 0.18)',
  'rgba(234, 179, 8, 0.15)': 'rgba(234, 179, 8, 0.18)',
  'rgba(34, 197, 94, 0.15)': 'rgba(34, 197, 94, 0.18)',
  'rgba(59, 130, 246, 0.15)': 'rgba(59, 130, 246, 0.18)',
  'rgba(168, 85, 247, 0.15)': 'rgba(168, 85, 247, 0.18)',
  'rgba(236, 72, 153, 0.15)': 'rgba(236, 72, 153, 0.18)',
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
 * Convert a color to the appropriate palette for the current theme
 * This ensures colors look consistent when switching themes
 */
export function convertColorForTheme(color: string, currentTheme: string): string {
  const isDark = isDarkTheme(currentTheme)

  // First normalize legacy colors
  const normalized = normalizeLegacyColor(color)

  if (isDark) {
    // In dark mode, convert light colors to dark equivalents
    if (lightToDark[normalized]) {
      return lightToDark[normalized]
    }
    // Check if it's already a dark color
    if (darkColors.includes(normalized)) {
      return normalized
    }
  } else {
    // In light mode, convert dark colors to light equivalents
    if (darkToLight[normalized]) {
      return darkToLight[normalized]
    }
    // Check if it's already a light color
    if (lightColors.includes(normalized)) {
      return normalized
    }
  }

  return normalized
}

/**
 * Get node background - layers transparent color over solid base
 * Handles legacy color normalization and theme-aware color conversion
 */
export function getNodeBackground(colorTheme: string | null, currentTheme: string): string | undefined {
  if (!colorTheme) return undefined

  // Convert color to appropriate palette for current theme
  const themeColor = convertColorForTheme(colorTheme, currentTheme)

  // Use linear-gradient to layer transparent color over solid background
  return `linear-gradient(${themeColor}, ${themeColor}), var(--bg-surface)`
}
