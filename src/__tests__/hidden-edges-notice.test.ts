/**
 * When a threshold hides edges, the canvas says so
 * (PRODUCT_DESIGN.md > Showing edges only around the focus).
 *
 * Above the hover threshold, with nothing hovered or selected, every edge
 * disappeared with no explanation: a workspace that grew past the threshold
 * looked as if its edges had been lost.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { ref, computed } from 'vue'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createI18n } from 'vue-i18n'
import en from '../i18n/locales/en.json'
import { useDisplayStore } from '../stores/display'
import { useEdgeVisibility } from '../canvas/composables/edges/useEdgeVisibility'
import type { EdgeLine } from '../canvas/composables/edges/useEdgeRouting'
import CanvasStatusBar from '../canvas/components/CanvasStatusBar.vue'

function lines(n: number): EdgeLine[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `e${i}`, source_node_id: `a${i}`, target_node_id: `b${i}`,
    x1: 0, y1: 0, x2: 1, y2: 1, labelX: 0, labelY: 0, path: 'M0 0 L1 1', style: 'direct', strokeWidth: 1,
  }) as unknown as EdgeLine)
}

function visibility(count: number, options: { hovered?: string | null; hideAbove?: number } = {}) {
  const edges = lines(count)
  return useEdgeVisibility({
    edgeLines: computed(() => edges),
    totalEdgeCount: computed(() => count),
    visibleNodeIds: computed(() => new Set<string>()),
    hoveredNodeId: ref(options.hovered ?? null),
    selectedNodeIds: ref([]),
    selectedEdge: ref(null),
    highlightedEdgeIds: computed(() => new Set<string>()),
    edgeHideThreshold: ref(options.hideAbove ?? 0),
    edgeStrokeWidth: computed(() => 1),
    highlightColor: computed(() => '#fff'),
    selectedColor: computed(() => '#fff'),
    getEdgeColor: () => '#888',
    getEdgeHighlightColor: () => '#fff',
    getNode: () => undefined,
  })
}

describe('hidden edges', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    useDisplayStore().edgeHoverThreshold = 500
  })

  it('reports edges hidden above the hover threshold with nothing in focus', () => {
    const v = visibility(978)
    expect(v.visibleEdgeLines.value).toHaveLength(0)
    expect(v.hiddenEdges.value).toEqual({ count: 978, threshold: 500, reason: 'hover' })
  })

  it('reports nothing once a note is hovered', () => {
    expect(visibility(978, { hovered: 'a1' }).hiddenEdges.value).toBeNull()
  })

  it('reports nothing below the threshold', () => {
    expect(visibility(300).hiddenEdges.value).toBeNull()
  })

  it('reports edges hidden by the hide-all setting', () => {
    expect(visibility(978, { hideAbove: 900 }).hiddenEdges.value).toEqual({ count: 978, threshold: 900, reason: 'limit' })
  })
})

describe('the status bar', () => {
  it('says how many edges are hidden and how to bring them back', () => {
    const i18n = createI18n({ legacy: false, locale: 'en', messages: { en } })
    const bar = mount(CanvasStatusBar, {
      props: {
        visibleNodeCount: 10, totalNodeCount: 10, visibleEdgeCount: 0, totalEdgeCount: 978,
        isLayouting: false, isLargeGraph: false, isPdfProcessing: false, pdfStatus: '',
        agentLog: [], showAgentLog: false, llmEnabled: false,
        hiddenEdges: { count: 978, threshold: 500, reason: 'hover' },
      },
      global: { plugins: [i18n, createPinia()] },
    })
    const notice = bar.find('.hidden-edges-notice')
    expect(notice.exists()).toBe(true)
    expect(notice.text()).toContain('978')
    expect(notice.text()).toContain('500')
  })
})
