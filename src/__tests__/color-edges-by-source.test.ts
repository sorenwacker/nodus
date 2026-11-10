/**
 * Edges can be coloured by the card they leave (PRODUCT_DESIGN.md >
 * Colouring edges by source card): with the toggle on, every edge without a
 * colour of its own takes its source card's colour, so a bundle of traces
 * can be followed to where it goes.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { ref, computed } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import {
  useEdgeVisibility,
  sourceEdgeColors,
  SOURCE_EDGE_PALETTE,
  SOURCE_COLORED_OPACITY,
} from '../canvas/composables/edges/useEdgeVisibility'
import type { EdgeLine } from '../canvas/composables/edges/useEdgeRouting'

const GREY = '#64748b'
const OWN = '#ff0000'
const THEMED = '#00aa00'

function line(id: string, source: string, target: string, color?: string): EdgeLine {
  return {
    id, source_node_id: source, target_node_id: target, color,
    x1: 0, y1: 0, x2: 1, y2: 1, labelX: 0, labelY: 0, path: 'M0 0 L1 1', style: 'direct', strokeWidth: 1,
  } as unknown as EdgeLine
}

function visibility(bySource: boolean, options: { hovered?: string | null; highlightAll?: boolean } = {}) {
  const edges = [
    line('a1', 'A', 'X'),
    line('a2', 'A', 'Y'),
    line('b1', 'B', 'X'),
    line('own', 'A', 'Z', OWN),
    line('t1', 'T', 'X'),
  ]
  return useEdgeVisibility({
    edgeLines: computed(() => edges),
    totalEdgeCount: computed(() => edges.length),
    visibleNodeIds: computed(() => new Set<string>()),
    hoveredNodeId: ref(options.hovered ?? null),
    selectedNodeIds: ref([]),
    selectedEdge: ref(null),
    highlightedEdgeIds: computed(() => new Set<string>(options.hovered ? ['a1', 'a2', 'own'] : [])),
    highlightAllEdges: ref(options.highlightAll ?? false),
    colorEdgesBySource: ref(bySource),
    edgeHideThreshold: ref(0),
    edgeStrokeWidth: computed(() => 1),
    highlightColor: computed(() => '#111111'),
    selectedColor: computed(() => '#222222'),
    getEdgeColor: e => e.color ?? GREY,
    getEdgeHighlightColor: theme => (theme ? THEMED : '#111111'),
    getNode: id => (id === 'T' ? { color_theme: 'green' } : {}),
  })
}

const byId = (v: ReturnType<typeof visibility>) => new Map(v.visibleEdgeLines.value.map(e => [e.id, e]))

describe('colouring edges by source card', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('leaves every edge grey when off', () => {
    const edges = byId(visibility(false))
    expect(edges.get('a1')!.color).toBe(GREY)
    expect(edges.get('b1')!.color).toBe(GREY)
    expect(edges.get('a1')!.opacity).toBe(0.3)
  })

  it('gives the edges of one card one colour and another card another', () => {
    const edges = byId(visibility(true))
    expect(edges.get('a1')!.color).toBe(edges.get('a2')!.color)
    expect(edges.get('a1')!.color).not.toBe(edges.get('b1')!.color)
    expect(SOURCE_EDGE_PALETTE).toContain(edges.get('a1')!.color)
    expect(SOURCE_EDGE_PALETTE).toContain(edges.get('b1')!.color)
  })

  it('keeps an edge\'s own colour and uses a coloured card\'s colour', () => {
    const edges = byId(visibility(true))
    expect(edges.get('own')!.color).toBe(OWN)
    expect(edges.get('t1')!.color).toBe(THEMED)
  })

  it('shows resting edges with more ink than grey ones, so the hues can be told apart', () => {
    const edges = byId(visibility(true))
    expect(edges.get('a1')!.opacity).toBe(SOURCE_COLORED_OPACITY)
    expect(SOURCE_COLORED_OPACITY).toBeGreaterThan(0.3)
  })

  it('still draws the hovered card\'s edges in the highlight colour at full opacity', () => {
    const edges = byId(visibility(true, { hovered: 'A' }))
    expect(edges.get('a1')!.isHighlighted).toBe(true)
    expect(edges.get('a1')!.opacity).toBe(1)
    expect(edges.get('a1')!.edgeHighlightColor).toBe('#111111')
    // the arrowhead follows the drawn colour
    expect(edges.get('a1')!.arrowMarkerId).toBe('arrow-111111')
  })

  it('gives the cards with the most edges distinct colours first, and the same ones for the same graph', () => {
    const edges = [
      ...Array.from({ length: 9 }, (_, i) => ({ source_node_id: 'hub1', id: `h1-${i}` })),
      ...Array.from({ length: 9 }, (_, i) => ({ source_node_id: 'hub2', id: `h2-${i}` })),
      ...Array.from({ length: 8 }, (_, i) => ({ source_node_id: 'hub3', id: `h3-${i}` })),
      ...Array.from({ length: 30 }, (_, i) => ({ source_node_id: `card-${i}`, id: `c-${i}` })),
    ]
    const colors = sourceEdgeColors(edges)
    expect(new Set([colors.get('hub1'), colors.get('hub2'), colors.get('hub3')]).size).toBe(3)
    expect(colors.get('hub1')).toBe(SOURCE_EDGE_PALETTE[0])
    expect(sourceEdgeColors([...edges].reverse())).toEqual(colors)
    expect(new Set(colors.values()).size).toBe(SOURCE_EDGE_PALETTE.length)
  })
})
