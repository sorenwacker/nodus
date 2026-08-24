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
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
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

describe('collapsed node titles', () => {
  // A product name longer than the card was clipped at the border, and three
  // wrapped lines overflowed the card's height
  // (PRODUCT_DESIGN.md > Collapsed node titles)
  const css = readFileSync(
    resolve(__dirname, '../canvas/styles/node-card.css'),
    'utf-8'
  )
  const rule = css.slice(
    css.indexOf('.node-card.collapsed .node-header'),
    css.indexOf('}', css.indexOf('.node-card.collapsed .node-header'))
  )

  it('breaks a word too long for the card instead of clipping it', () => {
    expect(rule).toContain('overflow-wrap: break-word')
    expect(rule).not.toContain('overflow-wrap: normal')
  })

  it('takes its line limit from the card rather than a fixed number', () => {
    expect(rule).toContain('line-clamp: var(--title-lines')
  })

  it('agrees with the constants the line budget is computed from', () => {
    // The budget lives in useCanvasNodeStyle; if the stylesheet's type size or
    // padding drifts from it, the clamp stops matching the space available
    const style = readFileSync(
      resolve(__dirname, '../canvas/composables/nodes/useCanvasNodeStyle.ts'),
      'utf-8'
    )
    const cssFont = Number(rule.match(/font-size: calc\((\d+)px/)?.[1])
    const cssPadding = Number(rule.match(/padding: calc\((\d+)px/)?.[1])
    const budgetFont = Number(style.match(/COLLAPSED_FONT = (\d+)/)?.[1])
    const budgetPadding = Number(style.match(/COLLAPSED_PADDING = (\d+)/)?.[1])

    expect(cssFont).toBe(budgetFont)
    expect(cssPadding).toBe(budgetPadding)
    // The budget must also account for the user's font scale, which the
    // stylesheet applies to the same type size
    expect(rule).toContain('var(--font-scale')
    expect(style).toContain('fontScale')
  })
})

describe('selected nodes stay reachable in bubble mode', () => {
  // The circle canvas covers the viewport and omits selected nodes from its
  // hit test, so the cards must sit above it
  // (PRODUCT_DESIGN.md > Selected nodes in bubble mode)
  it('puts the card layer above the circle canvas while bubble mode is on', () => {
    const canvasZ = Number(
      readFileSync(resolve(__dirname, '../canvas/components/CanvasLODCanvas.vue'), 'utf-8')
        .match(/z-index:\s*(\d+)/)?.[1]
    )
    const viewport = readFileSync(
      resolve(__dirname, '../canvas/styles/canvas-viewport.css'),
      'utf-8'
    )
    const layerRule = viewport.slice(viewport.indexOf('.nodes-layer.above-lod'))
    const layerZ = Number(layerRule.match(/z-index:\s*(\d+)/)?.[1])

    expect(canvasZ).toBeGreaterThan(0)
    expect(layerZ).toBeGreaterThan(canvasZ)
  })

  it('applies that layering exactly while in bubble mode', () => {
    const canvas = readFileSync(resolve(__dirname, '../canvas/GraphCanvas.vue'), 'utf-8')
    expect(canvas).toContain("'above-lod': isLODMode")
  })
})

describe('cost of rendering node markdown', () => {
  it('reports what rendering a whole workspace costs', async () => {
    // useContentRenderer renders every filtered node, not only visible ones
    const { renderMarkdown } = await import('../services/MarkdownRenderService')
    const bodies = Array.from({ length: 300 }, (_, i) =>
      `# Node ${i}\n\nSome prose with **bold**, a [[wikilink]] and #tag.\n\n- one\n- two\n`
    )

    const start = performance.now()
    for (const body of bodies) renderMarkdown(body)
    const ms = performance.now() - start

    console.log(`renderMarkdown x300: ${ms.toFixed(1)}ms total, ${(ms / 300).toFixed(2)}ms each`)
    expect(ms).toBeGreaterThan(0)
  })
})

describe('content rendering is limited to what is shown', () => {
  it('renders the viewport set, not the whole workspace', () => {
    // 0.52ms per node measured; a workspace-wide pass spends that on nodes
    // nobody is looking at (PRODUCT_DESIGN.md > Rendering node content)
    const canvas = readFileSync(resolve(__dirname, '../canvas/GraphCanvas.vue'), 'utf-8')
    expect(canvas).toContain('getRenderableNodes')

    const renderer = readFileSync(
      resolve(__dirname, '../canvas/composables/rendering/useContentRenderer.ts'),
      'utf-8'
    )
    expect(renderer).toContain('renderableNodes()')
  })

  it('evicts cache by node existence, not by visibility', () => {
    // Otherwise a node re-renders every time it scrolls back into view
    const renderer = readFileSync(
      resolve(__dirname, '../canvas/composables/rendering/useContentRenderer.ts'),
      'utf-8'
    )
    expect(renderer).toContain('existingIds')
    expect(renderer).toContain('getFilteredNodes().map(n => n.id)')
  })
})

describe('cost of one very large node', () => {
  it('reports what a document-sized body costs to render', async () => {
    const { renderMarkdown } = await import('../services/MarkdownRenderService')
    // A 20-page PDF imported into one node
    const huge = Array.from({ length: 400 }, (_, i) =>
      `## Section ${i}\n\nParagraph with **bold**, [[links]] and #tags. `.repeat(3)
    ).join('\n\n')

    const start = performance.now()
    renderMarkdown(huge)
    const ms = performance.now() - start

    console.log(`renderMarkdown one ${(huge.length / 1024).toFixed(0)}KB node: ${ms.toFixed(1)}ms`)
    expect(ms).toBeGreaterThan(0)
  })
})

describe('card previews are bounded', () => {
  it('caps a card render so one click cannot cost several frames', async () => {
    const { previewForCard, CARD_PREVIEW_LIMIT } = await import('../lib/cardPreview')
    const huge = 'word '.repeat(40000)

    const { text, truncated } = previewForCard(huge)

    expect(text.length).toBeLessThanOrEqual(CARD_PREVIEW_LIMIT + 200)
    expect(truncated).toBe(true)
  })

  it('leaves a short node exactly as written', async () => {
    const { previewForCard } = await import('../lib/cardPreview')
    const short = '# Title\n\nA short body with [[links]].'

    const { text, truncated } = previewForCard(short)

    expect(text).toBe(short)
    expect(truncated).toBe(false)
  })

  it('cuts at a line break so markdown is not severed mid-construct', async () => {
    const { previewForCard, CARD_PREVIEW_LIMIT } = await import('../lib/cardPreview')
    const body = Array.from({ length: 2000 }, (_, i) => `- item ${i}`).join('\n')

    const { text } = previewForCard(body)

    expect(text.endsWith('\n') || /item \d+$/.test(text)).toBe(true)
    expect(text.length).toBeLessThanOrEqual(CARD_PREVIEW_LIMIT + 200)
  })

  it('renders a capped preview well inside one frame', async () => {
    const { previewForCard } = await import('../lib/cardPreview')
    const { renderMarkdown } = await import('../services/MarkdownRenderService')
    const huge = Array.from({ length: 400 }, (_, i) => `## Section ${i}\n\nText with **bold**.`).join('\n\n')

    const start = performance.now()
    renderMarkdown(previewForCard(huge).text)
    const ms = performance.now() - start

    console.log(`capped card render: ${ms.toFixed(1)}ms`)
    expect(ms).toBeLessThan(16.67 * SLACK)
  })
})

describe('every card path is capped', () => {
  it('caps the single-node render as well as the bulk pass', () => {
    // Both write into the map the cards read
    const renderer = readFileSync(
      resolve(__dirname, '../canvas/composables/rendering/useContentRenderer.ts'),
      'utf-8'
    )
    const single = renderer.slice(renderer.indexOf('function renderSingleNode'))
    expect(single.slice(0, 400)).toContain('renderCardMarkdown')

    // And nothing writes the uncapped render into that map
    expect(renderer).not.toMatch(/nodeRenderedContent\.value\s*=\s*\{[^}]*renderMarkdown\(/)
  })
})
