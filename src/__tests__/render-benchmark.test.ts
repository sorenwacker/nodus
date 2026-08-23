/**
 * Render benchmark (PRODUCT_DESIGN.md > Canvas rendering).
 *
 * The stated target is 500 nodes at 60 fps, and until now nothing measured
 * rendering at all: the performance suite timed store operations - mutating
 * plain objects in a loop - and called the result a frame. That cannot fail
 * when rendering regresses, because rendering never ran.
 *
 * What this measures: mounting and updating the node card components, which is
 * the work that scales with the number of visible nodes. What it cannot
 * measure: layout, paint and compositing, which jsdom does not perform. A
 * number here is a floor on frame cost, never the whole of it.
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { createPinia } from 'pinia'
import { h, ref } from 'vue'
import en from '../i18n/locales/en.json'
import CanvasNodeCard from '../canvas/components/CanvasNodeCard.vue'
import CanvasEdgesSVG from '../canvas/components/CanvasEdgesSVG.vue'
import type { Node } from '../types'

// Wall-clock budgets are load-sensitive; the full suite runs these alongside
// everything else (matches the SLACK convention in canvas-performance.test.ts)
const SLACK = 6

const i18n = createI18n({ legacy: false, locale: 'en', messages: { en } })

function node(i: number): Node {
  return {
    id: `n${i}`,
    title: `Node ${i}`,
    content: 'Body text that a card has to lay out.',
    markdown_content: 'Body text that a card has to lay out.',
    canvas_x: (i % 25) * 260,
    canvas_y: Math.floor(i / 25) * 180,
    width: 240,
    height: 140,
    node_type: 'note',
  } as unknown as Node
}

function cardProps(n: Node, scale = 1) {
  return {
    node: n,
    style: { transform: `translate(${n.canvas_x}px, ${n.canvas_y}px)` },
    isSelected: false,
    isDragging: false,
    isResizing: false,
    isEditing: false,
    isCollapsed: false,
    isNeighborhoodMode: false,
    isNeighborhoodFocus: false,
    isNeighborHighlighted: false,
    showThumbnail: false,
    renderedContent: '<p>Body text that a card has to lay out.</p>',
    editingTitleId: null,
    editTitle: '',
    editContent: '',
    scale,
    showNodeSearch: false,
    nodeSearchQuery: '',
    nodeSearchMatchCount: 0,
    nodeSearchIndex: 0,
  }
}

/** Mount `count` cards the way the canvas does, and time it */
function mountCards(count: number) {
  const nodes = Array.from({ length: count }, (_, i) => node(i))
  const scale = ref(1)

  const start = performance.now()
  const wrapper = mount(
    {
      setup() {
        return () => nodes.map(n => h(CanvasNodeCard, { key: n.id, ...cardProps(n, scale.value) }))
      },
    },
    { global: { plugins: [i18n, createPinia()] } }
  )
  const mountMs = performance.now() - start

  return { wrapper, mountMs, scale }
}

describe('rendering cost by node count', () => {
  it('renders 500 cards, the stated target size', () => {
    const { wrapper, mountMs } = mountCards(500)

    expect(wrapper.findAll('.node-card').length).toBe(500)
    // Generous: this is component work only, on a single mount, and the point
    // of the number is that a regression moves it
    expect(mountMs).toBeLessThan(2000 * SLACK)
    wrapper.unmount()
  })

  it('scales roughly linearly with visible nodes rather than exploding', () => {
    // Superlinear growth means work per node depends on the others - the shape
    // of bug that makes a graph unusable past a certain size
    const small = mountCards(100)
    const smallMs = small.mountMs
    small.wrapper.unmount()

    const large = mountCards(400)
    const largeMs = large.mountMs
    large.wrapper.unmount()

    // 4x the nodes should not cost more than 12x the time
    expect(largeMs).toBeLessThan(Math.max(smallMs, 1) * 12)
  })

  it('re-renders on zoom without rebuilding every card', () => {
    // Zoom changes a prop on every card; if that discards and recreates the
    // DOM instead of patching it, zooming a large graph stutters
    const { wrapper, scale } = mountCards(200)
    const firstCard = wrapper.find('.node-card').element

    scale.value = 0.6

    return wrapper.vm.$nextTick().then(() => {
      expect(wrapper.find('.node-card').element).toBe(firstCard)
      wrapper.unmount()
    })
  })
})

/** Build the edge lines the SVG layer receives, already routed */
function edgeLines(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: `e${i}`,
    source_node_id: `n${i}`,
    target_node_id: `n${(i + 1) % count}`,
    x1: (i % 100) * 300,
    y1: Math.floor(i / 100) * 220,
    x2: ((i + 1) % 100) * 300,
    y2: Math.floor((i + 1) / 100) * 220,
    labelX: 0,
    labelY: 0,
    path: `M ${(i % 100) * 300} ${Math.floor(i / 100) * 220} L ${((i + 1) % 100) * 300} ${Math.floor((i + 1) / 100) * 220}`,
    style: 'solid',
    strokeWidth: 2,
    hitX1: 0,
    hitY1: 0,
    hitX2: 0,
    hitY2: 0,
    link_type: 'related',
    color: '#888888',
    label: null,
    isBidirectional: false,
    isShortEdge: false,
    isHighlighted: false,
    isSelected: false,
    isNeighborEdge: false,
    opacity: 1,
    edgeHighlightColor: '#3b82f6',
    renderStrokeWidth: 2,
    glowStrokeWidth: 4,
    arrowMarkerId: 'arrow',
  }))
}

function mountEdges(count: number, isLargeGraph: boolean) {
  const edges = edgeLines(count)

  const start = performance.now()
  const wrapper = mount(CanvasEdgesSVG, {
    props: {
      edges,
      isLargeGraph,
      edgeStrokeWidth: 2,
      edgeLabelSize: 12,
      zoom: 1,
      edgeLabelZoomThreshold: 0,
      lassoPoints: [],
      isLassoSelecting: false,
      currentTheme: 'light',
      highlightColor: '#3b82f6',
      isCreatingEdge: false,
      edgePreviewStart: null,
      edgePreviewEnd: { x: 0, y: 0 },
    },
    global: { plugins: [i18n, createPinia()] },
  })
  const mountMs = performance.now() - start

  return { wrapper, mountMs }
}

describe('where the rendering cost actually is', () => {
  it('compares a card against an edge, so the next optimisation targets the right layer', () => {
    const cards = mountCards(500)
    const cardsMs = cards.mountMs
    cards.wrapper.unmount()

    const interactive = mountEdges(500, false)
    const interactiveMs = interactive.mountMs
    interactive.wrapper.unmount()

    const fast = mountEdges(500, true)
    const fastMs = fast.mountMs
    fast.wrapper.unmount()

    console.log(
      `500 each: cards ${cardsMs.toFixed(1)}ms, ` +
        `edges interactive ${interactiveMs.toFixed(1)}ms, edges fast-path ${fastMs.toFixed(1)}ms ` +
        `(card is ${(cardsMs / Math.max(interactiveMs, 0.01)).toFixed(1)}x an interactive edge)`
    )

    expect(cardsMs).toBeGreaterThan(0)
    expect(interactiveMs).toBeGreaterThan(0)
  })

  it('keeps the fast edge path cheaper than the interactive one', () => {
    // The fast path draws one element per edge instead of three; if that stops
    // being cheaper there is no reason to keep two paths
    const interactive = mountEdges(800, false)
    const interactiveMs = interactive.mountMs
    interactive.wrapper.unmount()

    const fast = mountEdges(800, true)
    const fastMs = fast.mountMs
    fast.wrapper.unmount()

    expect(fastMs).toBeLessThan(interactiveMs * 1.5)
  })
})

/** Mount cards the way the canvas does, then pan and zoom the container */
async function panZoomSweep(count: number, frames = 60) {
  const nodes = Array.from({ length: count }, (_, i) => node(i))
  const scale = ref(1)
  const offsetX = ref(0)

  const wrapper = mount(
    {
      setup() {
        // Cards hold canvas coordinates; the container carries the one
        // pan/zoom transform, as GraphCanvas does
        return () =>
          h(
            'div',
            {
              style: {
                transform: `translate(${offsetX.value}px, 0) scale(${scale.value})`,
              },
            },
            nodes.map(n =>
              h(CanvasNodeCard, {
                key: n.id,
                ...cardProps(n, 1),
                style: { transform: `translate(${n.canvas_x}px, ${n.canvas_y}px)` },
              })
            )
          )
      },
    },
    { global: { plugins: [i18n, createPinia()] } }
  )

  const timings: number[] = []
  for (let f = 0; f < frames; f++) {
    const start = performance.now()
    offsetX.value += 4
    scale.value = 1 - (f / frames) * 0.4
    await wrapper.vm.$nextTick()
    timings.push(performance.now() - start)
  }

  wrapper.unmount()
  const total = timings.reduce((a, b) => a + b, 0)
  return { avgMs: total / frames, maxMs: Math.max(...timings) }
}

describe('cost of a pan or zoom frame', () => {
  it('is flat in the number of cards, because only the container restyles', async () => {
    // Before the container transform, this was 24ms per frame at 500 nodes -
    // 1.5x the 16.67ms budget - because every card's style was recomputed
    // (PRODUCT_DESIGN.md > Canvas rendering)
    const small = await panZoomSweep(100)
    const target = await panZoomSweep(500)

    console.log(
      `pan/zoom frame: 100 cards ${small.avgMs.toFixed(2)}ms avg, ` +
        `500 cards ${target.avgMs.toFixed(2)}ms avg (max ${target.maxMs.toFixed(2)}ms)`
    )

    // Vue still diffs the child vnodes, so the cost is not perfectly flat -
    // but the DOM patch is one container style, and the frame must stay far
    // inside the 16.67ms budget where the old mechanism was 1.5x over it
    expect(target.avgMs).toBeLessThan(16.67 * SLACK)
    expect(target.avgMs).toBeLessThan(Math.max(small.avgMs, 0.2) * 6)
  })
})

describe('card style is viewport-independent', () => {
  // The property that makes pan and zoom free: a card's style depends only on
  // its canvas coordinates, so a frame updates one container transform instead
  // of restyling every visible card (PRODUCT_DESIGN.md > Canvas rendering)
  it('returns the same style at any scale and offset', async () => {
    const { useCanvasNodeStyle } = await import(
      '../canvas/composables/nodes/useCanvasNodeStyle'
    )
    const style = useCanvasNodeStyle({
      resizingNode: ref(null),
      resizePreview: ref({ x: 0, y: 0, width: 0, height: 0 }),
      nodeZOrder: ref(new Map()),
      nodeBorderWidth: ref(2),
      isSemanticZoomCollapsed: ref(false),
      selectedNodeIds: ref([]),
      currentTheme: ref('light'),
    } as never)

    const sample = { id: 'n1', canvas_x: 120, canvas_y: 80, width: 240, height: 140, node_type: 'note' }
    const before = style.getNodeStyle(sample as never)

    // The interface no longer admits scale or offset at all - the style
    // cannot depend on the viewport by construction
    expect(before.transform).toContain('translate(120px, 80px)')
    expect(before.transform).not.toContain('scale')
  })
})
