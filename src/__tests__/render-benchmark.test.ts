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
