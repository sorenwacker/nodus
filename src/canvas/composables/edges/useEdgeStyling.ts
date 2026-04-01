/**
 * Edge styling composable
 *
 * Handles edge colors, styles, and theme-aware highlighting
 */

import { ref, computed, watch, onMounted, onUnmounted, type Ref, type ComputedRef } from 'vue'
import { canvasStorage } from '../../../lib/storage'

export type EdgeStyleType = 'orthogonal' | 'diagonal' | 'curved' | 'hyperbolic' | 'straight' | 'direct'

export interface EdgeStyleOption {
  value: EdgeStyleType
  label: string
}

export interface EdgeColorOption {
  value: string
}

export interface UseEdgeStylingContext {
  store: {
    updateEdgeLinkType: (edgeId: string, linkType: string) => void
    updateEdgeColor: (edgeId: string, color: string | null) => Promise<void>
  }
  selectedEdgeId: Ref<string | null>
  currentTheme: Ref<string>
  scale: Ref<number>
  workspaceId: Ref<string | null>
}

export interface UseEdgeStylingReturn {
  // Style options
  edgeStyles: EdgeStyleOption[]
  edgeStyleMap: Ref<Record<string, string>>
  globalEdgeStyle: Ref<EdgeStyleType>

  // Stroke width
  edgeStrokeWidth: ComputedRef<number>
  highlightedStrokeMultiplier: number

  // Color palettes
  edgeColorPalette: ComputedRef<EdgeColorOption[]>
  defaultEdgeColor: ComputedRef<string>
  highlightColor: ComputedRef<string>
  selectedColor: ComputedRef<string>
  nodeColors: ComputedRef<Array<{ value: string | null; display: string | null }>>
  allMarkerColors: ComputedRef<Array<{ value: string }>>
  frameColors: Array<{ value: string | null }>

  // Functions
  cycleEdgeStyle: () => void
  getEdgeStyle: (edgeId: string) => string
  setEdgeStyle: (style: string) => void
  getEdgeColor: (edge: { link_type: string; color?: string | null }) => string
  getEdgeHighlightColor: (nodeColor: string | null) => string
  getArrowMarkerId: (color: string) => string
  changeEdgeColor: (color: string) => void
}

// Color palettes - neon colors for dark themes (8 distinct colors)
const cyberEdgeColors: EdgeColorOption[] = [
  { value: '#00ffcc' }, // cyan (default)
  { value: '#3b82f6' }, // blue (more distinct from cyan)
  { value: '#22c55e' }, // green (emerald, distinct from cyan)
  { value: '#eab308' }, // yellow (golden)
  { value: '#ef4444' }, // red
  { value: '#a855f7' }, // purple (violet)
  { value: '#ec4899' }, // pink/magenta
  { value: '#94a3b8' }, // gray
]

// Light mode edge colors - high contrast, professional tones (8 colors, matching order)
const lightEdgeColors: EdgeColorOption[] = [
  { value: '#0891b2' }, // cyan (darker, visible)
  { value: '#1d4ed8' }, // blue (royal blue)
  { value: '#15803d' }, // green (forest)
  { value: '#a16207' }, // amber/gold (darker yellow)
  { value: '#b91c1c' }, // red (crimson)
  { value: '#7c3aed' }, // purple (violet)
  { value: '#be185d' }, // pink/magenta
  { value: '#475569' }, // gray (slate)
]

// Node colors for the color picker (transparent tints layered over solid bg)
const defaultNodeColors = [
  { value: null, display: null },
  { value: 'rgba(239, 68, 68, 0.18)', display: '#fecaca' }, // red
  { value: 'rgba(249, 115, 22, 0.18)', display: '#fed7aa' }, // orange
  { value: 'rgba(234, 179, 8, 0.18)', display: '#fef08a' }, // yellow
  { value: 'rgba(34, 197, 94, 0.18)', display: '#bbf7d0' }, // green
  { value: 'rgba(59, 130, 246, 0.18)', display: '#bfdbfe' }, // blue
  { value: 'rgba(168, 85, 247, 0.18)', display: '#e9d5ff' }, // purple
  { value: 'rgba(236, 72, 153, 0.18)', display: '#fbcfe8' }, // pink
]

const cyberNodeColors = [
  { value: null, display: null },
  { value: '#4d1f30', display: '#ff3366' }, // neon red (dark bg)
  { value: '#4d3300', display: '#ffaa00' }, // neon orange
  { value: '#4d4d00', display: '#ffff00' }, // neon yellow
  { value: '#004d20', display: '#00ff66' }, // neon green
  { value: '#003d4d', display: '#00ccff' }, // neon blue
  { value: '#2e194d', display: '#9933ff' }, // neon purple
  { value: '#4d004d', display: '#ff00ff' }, // neon magenta
]

// Map pastel node colors to neon equivalents for cyber theme edge highlights
const cyberHighlightColors: Record<string, string> = {
  '#fee2e2': '#ff3366', // red pastel -> neon red
  '#ffedd5': '#ffaa00', // orange pastel -> neon orange
  '#fef9c3': '#ffff00', // yellow pastel -> neon yellow
  '#dcfce7': '#00ff66', // green pastel -> neon green
  '#dbeafe': '#00ccff', // blue pastel -> neon blue
  '#f3e8ff': '#9933ff', // purple pastel -> neon purple
  '#fce7f3': '#ff00ff', // pink pastel -> neon magenta
}

// Frame border colors - neon palette
const frameColors = [
  { value: null },
  { value: '#ff3366' }, // neon red
  { value: '#ffaa00' }, // neon orange
  { value: '#ffff00' }, // neon yellow
  { value: '#00ff66' }, // neon green
  { value: '#00ccff' }, // neon blue
  { value: '#9933ff' }, // neon purple
  { value: '#ff00ff' }, // neon magenta
]

// Stroke width constants
const EDGE_SCREEN_WIDTH = 1.5 // Target screen pixels
const HIGHLIGHTED_STROKE_MULTIPLIER = 1.4

// Link type to color mapping for semantic edges (dark/light variants)
const LINK_TYPE_COLORS_DARK: Record<string, string> = {
  cites: '#3b82f6',       // Blue - citation relationship
  related: '#94a3b8',     // Gray - general relationship
  blocks: '#ef4444',      // Red - blocking relationship
  supports: '#22c55e',    // Green - supporting relationship
  contradicts: '#f97316', // Orange - contradicting relationship
  // Ontology link types
  subClassOf: '#9333ea',  // Purple - class hierarchy (matches Rust transformer)
  'rdf:type': '#06b6d4',  // Cyan - instance-of relationship
  domain: '#8b5cf6',      // Violet - property domain
  range: '#d946ef',       // Fuchsia - property range
}

const LINK_TYPE_COLORS_LIGHT: Record<string, string> = {
  cites: '#1d4ed8',       // Darker blue for light mode
  related: '#64748b',     // Darker gray for light mode
  blocks: '#b91c1c',      // Darker red for light mode
  supports: '#15803d',    // Darker green for light mode
  contradicts: '#c2410c', // Darker orange for light mode
  // Ontology link types
  subClassOf: '#7c3aed',  // Darker purple for light mode
  'rdf:type': '#0891b2',  // Darker cyan for light mode
  domain: '#6d28d9',      // Darker violet for light mode
  range: '#a21caf',       // Darker fuchsia for light mode
}

// Map neon/bright colors (dark themes) to visible equivalents (light themes)
const NEON_TO_LIGHT_COLORS: Record<string, string> = {
  '#00ffcc': '#0891b2', // cyan -> darker cyan
  '#3b82f6': '#1d4ed8', // blue -> royal blue
  '#22c55e': '#15803d', // green -> forest green
  '#eab308': '#a16207', // yellow -> amber
  '#ef4444': '#b91c1c', // red -> crimson
  '#a855f7': '#7c3aed', // purple -> violet
  '#ec4899': '#be185d', // pink -> dark pink
  // Ontology colors (from Rust transformer)
  '#9333ea': '#7c3aed', // ontology purple -> violet
  '#06b6d4': '#0891b2', // ontology cyan -> darker cyan
  '#8b5cf6': '#6d28d9', // ontology violet -> darker violet
  '#d946ef': '#a21caf', // ontology fuchsia -> darker fuchsia
  // Legacy mappings for old neon colors
  '#ff00ff': '#be185d', // magenta -> pink
  '#00ccff': '#1d4ed8', // old blue -> royal blue
  '#ffff00': '#a16207', // bright yellow -> amber
  '#ff3366': '#b91c1c', // old red -> crimson
  '#9933ff': '#7c3aed', // old purple -> violet
  '#00ff66': '#15803d', // old green -> forest green
  '#ffaa00': '#a16207', // orange -> amber
}

export function useEdgeStyling(ctx: UseEdgeStylingContext): UseEdgeStylingReturn {
  const { store, selectedEdgeId, currentTheme, scale, workspaceId } = ctx

  // Edge stroke width - constant 1px on screen at any zoom level
  const edgeStrokeWidth = computed(() => {
    const canvasWidth = EDGE_SCREEN_WIDTH / scale.value
    return Math.max(0.5, Math.min(30, canvasWidth))
  })

  // Edge style options
  const edgeStyles: EdgeStyleOption[] = [
    { value: 'orthogonal', label: '\u231F' }, // ⌟
    { value: 'diagonal', label: '\u2220' },   // ∠
    { value: 'curved', label: '\u223F' },     // ∿
    { value: 'hyperbolic', label: '\u223C' }, // ∼
    { value: 'straight', label: '\u2215' },   // ∕ (with obstacle avoidance)
    { value: 'direct', label: '\u2014' },     // — (true center-to-center)
  ]

  // Store edge styles (edgeId -> style)
  const edgeStyleMap = ref<Record<string, string>>({})
  const globalEdgeStyle = ref<EdgeStyleType>(canvasStorage.getEdgeStyle(workspaceId.value || undefined))

  // Update edge style when workspace changes
  watch(workspaceId, (newId) => {
    globalEdgeStyle.value = canvasStorage.getEdgeStyle(newId || undefined)
  })

  // Listen for edge style changes from settings panel
  function handleEdgeStyleChange(e: Event) {
    const style = (e as CustomEvent).detail as EdgeStyleType
    if (style) {
      globalEdgeStyle.value = style
    }
  }

  onMounted(() => {
    window.addEventListener('nodus-edge-style-change', handleEdgeStyleChange)
  })

  onUnmounted(() => {
    window.removeEventListener('nodus-edge-style-change', handleEdgeStyleChange)
  })

  // Reactive edge color palette - neon for dark themes, professional for light
  const edgeColorPalette = computed(() => {
    if (currentTheme.value === 'dark' || currentTheme.value === 'pitch-black' || currentTheme.value === 'cyber') {
      return cyberEdgeColors
    }
    return lightEdgeColors
  })

  // Default edge color (first in palette)
  const defaultEdgeColor = computed(() => edgeColorPalette.value[0].value)

  // Highlight color for hover - neon cyan for dark themes, black for light themes
  const highlightColor = computed(() => {
    if (currentTheme.value === 'dark' || currentTheme.value === 'pitch-black' || currentTheme.value === 'cyber') {
      return '#00ffcc' // neon cyan
    }
    return '#1a1a1a' // Black for light themes (visibility)
  })

  // Selected color - neon magenta for dark themes, black for light themes
  const selectedColor = computed(() => {
    if (currentTheme.value === 'dark' || currentTheme.value === 'pitch-black' || currentTheme.value === 'cyber') {
      return '#ff00ff' // neon magenta
    }
    return '#1a1a1a' // Black for light themes (visibility)
  })

  // Node colors - use appropriate colors for theme
  const nodeColors = computed(() => {
    if (currentTheme.value === 'dark' || currentTheme.value === 'pitch-black' || currentTheme.value === 'cyber') {
      return cyberNodeColors
    }
    return defaultNodeColors
  })

  // All colors that need arrow markers (edge colors + node colors + highlight + cyber neons)
  const allMarkerColors = computed(() => {
    const colors = new Set<string>()
    // Default gray colors (fallback)
    colors.add('#94a3b8')
    colors.add('#64748b')
    // Link type semantic colors (both dark and light variants)
    for (const color of Object.values(LINK_TYPE_COLORS_DARK)) {
      colors.add(color)
    }
    for (const color of Object.values(LINK_TYPE_COLORS_LIGHT)) {
      colors.add(color)
    }
    // Edge colors (both palettes)
    for (const c of cyberEdgeColors) {
      if (c.value) colors.add(c.value)
    }
    for (const c of lightEdgeColors) {
      if (c.value) colors.add(c.value)
    }
    // Node colors (both default and cyber for highlighted edges)
    for (const c of defaultNodeColors) {
      if (c.value) colors.add(c.value)
    }
    for (const c of cyberNodeColors) {
      if (c.value) colors.add(c.value)
    }
    // Cyber highlight colors (neon equivalents of pastels)
    for (const neon of Object.values(cyberHighlightColors)) {
      colors.add(neon)
    }
    // Highlight and selected colors
    colors.add(highlightColor.value)
    colors.add(selectedColor.value)
    return Array.from(colors).map(v => ({ value: v }))
  })

  function cycleEdgeStyle() {
    const styles: EdgeStyleType[] = ['orthogonal', 'diagonal', 'curved', 'hyperbolic', 'straight', 'direct']
    const idx = styles.indexOf(globalEdgeStyle.value)
    globalEdgeStyle.value = styles[(idx + 1) % styles.length]
    canvasStorage.setEdgeStyle(globalEdgeStyle.value, workspaceId.value || undefined)
  }

  function getEdgeStyle(edgeId: string): string {
    return edgeStyleMap.value[edgeId] || 'diagonal'
  }

  function setEdgeStyle(style: string) {
    if (selectedEdgeId.value) {
      edgeStyleMap.value[selectedEdgeId.value] = style
    }
  }

  function getEdgeColor(edge: { link_type: string; color?: string | null }): string {
    const isLightMode = currentTheme.value !== 'dark' && currentTheme.value !== 'pitch-black' && currentTheme.value !== 'cyber'

    // Helper to remap neon colors in light mode
    const remapForTheme = (color: string): string => {
      if (isLightMode && NEON_TO_LIGHT_COLORS[color.toLowerCase()]) {
        return NEON_TO_LIGHT_COLORS[color.toLowerCase()]
      }
      return color
    }

    // 1. Prefer explicit color field (user override)
    if (edge.color && edge.color.startsWith('#')) {
      return remapForTheme(edge.color)
    }

    // 2. Check semantic link_type for predefined colors (theme-aware)
    const linkTypeColors = isLightMode ? LINK_TYPE_COLORS_LIGHT : LINK_TYPE_COLORS_DARK
    if (edge.link_type && linkTypeColors[edge.link_type]) {
      return linkTypeColors[edge.link_type]
    }

    // 3. Legacy: link_type used to store hex color directly
    if (edge.link_type && edge.link_type.startsWith('#')) {
      return remapForTheme(edge.link_type)
    }

    // 4. Default: use theme-appropriate default color
    return defaultEdgeColor.value
  }

  /**
   * Get edge highlight color, mapping to cyber neon if needed.
   * Avoids using light colors in light mode (would be invisible)
   */
  function getEdgeHighlightColor(nodeColor: string | null): string {
    if (!nodeColor) return highlightColor.value
    if (currentTheme.value === 'cyber' && cyberHighlightColors[nodeColor]) {
      return cyberHighlightColors[nodeColor]
    }
    // For non-cyber themes, check if the node color is too light for visibility
    // Skip white and very light colors in light mode
    if (currentTheme.value !== 'dark' && currentTheme.value !== 'pitch-black') {
      const hex = nodeColor.replace('#', '')
      const r = parseInt(hex.substr(0, 2), 16)
      const g = parseInt(hex.substr(2, 2), 16)
      const b = parseInt(hex.substr(4, 2), 16)
      const brightness = (r * 299 + g * 587 + b * 114) / 1000
      // If color is too bright (>200), use the default highlight color instead
      if (brightness > 200) {
        return highlightColor.value
      }
    }
    return nodeColor
  }

  function getArrowMarkerId(color: string): string {
    // Create a safe ID from the color
    return `arrow-${color.replace('#', '')}`
  }

  function changeEdgeColor(color: string) {
    if (selectedEdgeId.value) {
      store.updateEdgeColor(selectedEdgeId.value, color)
    }
  }

  return {
    edgeStyles,
    edgeStyleMap,
    globalEdgeStyle,
    edgeStrokeWidth,
    highlightedStrokeMultiplier: HIGHLIGHTED_STROKE_MULTIPLIER,
    edgeColorPalette,
    defaultEdgeColor,
    highlightColor,
    selectedColor,
    nodeColors,
    allMarkerColors,
    frameColors,
    cycleEdgeStyle,
    getEdgeStyle,
    setEdgeStyle,
    getEdgeColor,
    getEdgeHighlightColor,
    getArrowMarkerId,
    changeEdgeColor,
  }
}
