/**
 * Edge styling composable
 *
 * Handles edge colors, styles, and theme-aware highlighting
 */

import { ref, computed, type Ref, type ComputedRef } from 'vue'
import { canvasStorage } from '../../../lib/storage'

export type EdgeStyleType = 'orthogonal' | 'diagonal' | 'curved' | 'hyperbolic' | 'straight'

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
  }
  selectedEdgeId: Ref<string | null>
  currentTheme: Ref<string>
  scale: Ref<number>
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

// Color palettes
const defaultEdgeColors: EdgeColorOption[] = [
  { value: '#94a3b8' }, // gray (default)
  { value: '#3b82f6' }, // blue
  { value: '#22c55e' }, // green
  { value: '#f97316' }, // orange
  { value: '#ef4444' }, // red
  { value: '#8b5cf6' }, // purple
  { value: '#ec4899' }, // pink
]

const cyberEdgeColors: EdgeColorOption[] = [
  { value: '#00ffcc' }, // neon cyan (default)
  { value: '#ff00ff' }, // neon magenta
  { value: '#00ccff' }, // neon blue
  { value: '#ffff00' }, // neon yellow
  { value: '#ff3366' }, // neon red
  { value: '#9933ff' }, // neon purple
  { value: '#00ff66' }, // neon green
]

// Node colors for the color picker (transparent tints layered over solid bg)
const defaultNodeColors = [
  { value: null, display: null },
  { value: 'rgba(239, 68, 68, 0.08)', display: '#fecaca' }, // red
  { value: 'rgba(249, 115, 22, 0.08)', display: '#fed7aa' }, // orange
  { value: 'rgba(234, 179, 8, 0.08)', display: '#fef08a' }, // yellow
  { value: 'rgba(34, 197, 94, 0.08)', display: '#bbf7d0' }, // green
  { value: 'rgba(59, 130, 246, 0.08)', display: '#bfdbfe' }, // blue
  { value: 'rgba(168, 85, 247, 0.08)', display: '#e9d5ff' }, // purple
  { value: 'rgba(236, 72, 153, 0.08)', display: '#fbcfe8' }, // pink
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

// Frame border colors (more saturated for visibility)
const frameColors = [
  { value: null },
  { value: '#ef4444' },
  { value: '#f97316' },
  { value: '#eab308' },
  { value: '#22c55e' },
  { value: '#3b82f6' },
  { value: '#8b5cf6' },
  { value: '#ec4899' },
]

// Stroke width constants
const EDGE_SCREEN_WIDTH = 2 // Target screen pixels
const HIGHLIGHTED_STROKE_MULTIPLIER = 1.3

export function useEdgeStyling(ctx: UseEdgeStylingContext): UseEdgeStylingReturn {
  const { store, selectedEdgeId, currentTheme, scale } = ctx

  // Edge stroke width - constant 2px on screen at any zoom level
  const edgeStrokeWidth = computed(() => {
    const canvasWidth = EDGE_SCREEN_WIDTH / scale.value
    return Math.max(1, Math.min(30, canvasWidth))
  })

  // Edge style options
  const edgeStyles: EdgeStyleOption[] = [
    { value: 'orthogonal', label: '\u231F' }, // ⌟
    { value: 'diagonal', label: '\u2220' },   // ∠
    { value: 'curved', label: '\u223F' },     // ∿
    { value: 'hyperbolic', label: '\u223C' }, // ∼
    { value: 'straight', label: '/' },
  ]

  // Store edge styles (edgeId -> style)
  const edgeStyleMap = ref<Record<string, string>>({})
  const globalEdgeStyle = ref<EdgeStyleType>(canvasStorage.getEdgeStyle())

  // Reactive edge color palette based on theme
  const edgeColorPalette = computed(() => {
    return currentTheme.value === 'cyber' ? cyberEdgeColors : defaultEdgeColors
  })

  // Default edge color (first in palette)
  const defaultEdgeColor = computed(() => edgeColorPalette.value[0].value)

  // Highlight color for hover - matches theme accent
  const highlightColor = computed(() => {
    return currentTheme.value === 'cyber' ? '#00ffcc' : '#3b82f6'
  })

  // Selected color - matches selected node border
  const selectedColor = computed(() => {
    return currentTheme.value === 'cyber' ? '#ff00ff' : '#3b82f6'
  })

  const nodeColors = computed(() => {
    return currentTheme.value === 'cyber' ? cyberNodeColors : defaultNodeColors
  })

  // All colors that need arrow markers (edge colors + node colors + highlight + cyber neons)
  const allMarkerColors = computed(() => {
    const colors = new Set<string>()
    // Edge colors
    for (const c of edgeColorPalette.value) {
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
    const styles: EdgeStyleType[] = ['orthogonal', 'diagonal', 'curved', 'hyperbolic', 'straight']
    const idx = styles.indexOf(globalEdgeStyle.value)
    globalEdgeStyle.value = styles[(idx + 1) % styles.length]
    canvasStorage.setEdgeStyle(globalEdgeStyle.value)
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
    // Prefer explicit color field, then check link_type, then default to gray
    if (edge.color && edge.color.startsWith('#')) return edge.color
    if (edge.link_type && edge.link_type.startsWith('#')) return edge.link_type
    return '#94a3b8'
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
      store.updateEdgeLinkType(selectedEdgeId.value, color)
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
