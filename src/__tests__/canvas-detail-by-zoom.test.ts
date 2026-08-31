/**
 * Canvas detail has to drop when a card stops being legible, not only when the
 * graph is big.
 *
 * Every reduction mechanism was gated on graph size, and a graph can be small
 * and still be drawn at a zoom where nothing is readable. Fitting a workspace
 * of 215 nodes whose layout spans 41,000 x 50,000 canvas px puts every node on
 * screen at once at a zoom near the floor: viewport culling culls nothing, and
 * 215 nodes never crosses a 500-node gate at any zoom. Each card is a
 * composited subtree of some sixty elements that the compositor backs whatever
 * its size on screen, so the browser took 6 GB of shared graphics memory to
 * draw cards a few pixels wide and the kernel killed it. Measured: cards
 * saturate memory by 60 of them, and the same view as circles peaks at 476 MB
 * (PERF_NOTES.md, PRODUCT_DESIGN.md > Graph size tiers).
 *
 * These are the two zoom tiers that fix it. They are the whole fix, so they get
 * a gate: a refactor that restores the count-only condition brings back a crash
 * that takes the machine down with it.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { ref, computed, nextTick } from 'vue'
import type { Node, Edge } from '../types'
import { NODE_DEFAULTS } from '../canvas/constants'

function makeNodes(count: number): Node[] {
  return Array.from({ length: count }, (_, i) => ({ id: `n${i}` }) as Node)
}

/** The composable under test, with only the inputs the tiers read. */
async function metricsAt(opts: {
  nodeCount: number
  scale: number
  edgeCount?: number
  neighborhood?: boolean
  gestureActive?: boolean
}) {
  const { useGraphMetrics } = await import(
    '../canvas/composables/rendering/useGraphMetrics'
  )
  const nodes = makeNodes(opts.nodeCount)
  const edges = Array.from(
    { length: opts.edgeCount ?? 0 },
    (_, i) => ({ id: `e${i}`, source_node_id: 'n0', target_node_id: 'n1' }) as Edge
  )
  const scale = ref(opts.scale)
  const gestureActive = ref(opts.gestureActive ?? false)
  const metrics = useGraphMetrics({
    displayNodes: computed(() => nodes),
    visibleNodes: computed(() => nodes),
    filteredNodes: computed(() => nodes),
    filteredEdges: computed(() => edges),
    neighborhoodMode: ref(opts.neighborhood ?? false),
    scale,
    workspaceId: computed(() => null),
    gestureActive,
  })
  return { ...metrics, scale, gestureActive }
}

/** The zoom at which a default-width card renders exactly 30 screen px. */
const CARD_FLOOR_SCALE = 30 / NODE_DEFAULTS.WIDTH

describe('bubble mode from rendered card size', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('turns on for the workspace that ran the machine out of memory', async () => {
    // 215 nodes at the fitted zoom of a 41,000 x 50,000 layout: far below every
    // count gate, and the case that was killed by the kernel.
    const m = await metricsAt({ nodeCount: 215, scale: 0.02 })
    expect(m.isLODMode.value).toBe(true)
  })

  it('stays off while a card is still large enough to read', async () => {
    const m = await metricsAt({ nodeCount: 215, scale: CARD_FLOOR_SCALE + 0.01 })
    expect(m.isLODMode.value).toBe(false)
  })

  it('turns on as soon as a card falls under the legible width', async () => {
    const m = await metricsAt({ nodeCount: 215, scale: CARD_FLOOR_SCALE - 0.01 })
    expect(m.isLODMode.value).toBe(true)
  })

  it('leaves a sparse graph as cards, however far out it is zoomed', async () => {
    // Twenty cards cost nothing to draw properly, and bubbling them would only
    // take detail away for no gain.
    const m = await metricsAt({ nodeCount: 20, scale: 0.01 })
    expect(m.isLODMode.value).toBe(false)
  })

  it('still turns on from node count alone at a readable zoom', async () => {
    const m = await metricsAt({ nodeCount: 600, scale: 1 })
    expect(m.isLODMode.value).toBe(true)
  })
})

describe('holding the renderer during a gesture', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  // The flip swaps the entire renderer and costs seconds; paying it inside a
  // live gesture is the stutter it caused. It settles once, on gesture end.
  it('does not flip while the gesture is live, then settles on its end', async () => {
    const m = await metricsAt({ nodeCount: 215, scale: 1, gestureActive: true })
    expect(m.isLODMode.value).toBe(false)

    m.scale.value = 0.02
    await nextTick()
    expect(m.isLODMode.value).toBe(false)

    m.gestureActive.value = false
    await nextTick()
    expect(m.isLODMode.value).toBe(true)
  })

  it('holds bubbles just as it holds cards', async () => {
    const m = await metricsAt({ nodeCount: 215, scale: 0.02 })
    expect(m.isLODMode.value).toBe(true)

    m.gestureActive.value = true
    m.scale.value = 1
    await nextTick()
    expect(m.isLODMode.value).toBe(true)

    m.gestureActive.value = false
    await nextTick()
    expect(m.isLODMode.value).toBe(false)
  })

  it('settles immediately when no gesture is involved', async () => {
    // The startup fit and zoom-to-node set the scale programmatically
    const m = await metricsAt({ nodeCount: 215, scale: 1 })
    m.scale.value = 0.02
    await nextTick()
    expect(m.isLODMode.value).toBe(true)
  })
})

describe('simple edge form from rendered hit-target size', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('drops the per-edge hit path once it renders thinner than a click target', async () => {
    // The 12px hit stroke at zoom 0.02 is a quarter of a screen pixel: three to
    // four SVG elements per edge, paid every frame, that can never be hit.
    const m = await metricsAt({ nodeCount: 215, edgeCount: 1189, scale: 0.02 })
    expect(m.useSimpleEdges.value).toBe(true)
  })

  it('keeps the full form while an edge is still clickable', async () => {
    const m = await metricsAt({ nodeCount: 215, edgeCount: 1189, scale: 1 })
    expect(m.useSimpleEdges.value).toBe(false)
  })

  it('still simplifies a large graph at a readable zoom', async () => {
    const m = await metricsAt({ nodeCount: 215, edgeCount: 1600, scale: 1 })
    expect(m.useSimpleEdges.value).toBe(true)
  })
})
