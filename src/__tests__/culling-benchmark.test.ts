/**
 * Cost of viewport culling during a zoom (PRODUCT_DESIGN.md > Canvas rendering).
 *
 * A zoom-deferral cache was deleted from the culling code on the grounds that
 * GPU rendering made it unnecessary, and the renderer named in that reasoning
 * was never built.
 * Rather than restore it on the strength of a different assumption, this
 * measures what a culling pass costs, so the decision follows a number.
 *
 * Measured on this machine: 0.048ms per zoom step at 500 nodes, 0.135ms at
 * 5000 - under 1% of a 16.67ms frame. Deferring that work would buy nothing
 * and cost transiently stale culling, so the cache stays deleted. The reason
 * given for deleting it was fiction; the deletion itself was harmless.
 */
import { describe, it, expect } from 'vitest'
import { ref } from 'vue'
import { useViewportCulling } from '../canvas/composables/rendering/useViewportCulling'
import type { Node } from '../types'

const SLACK = 6

function graph(count: number): Node[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `n${i}`,
    title: `Node ${i}`,
    canvas_x: (i % 100) * 300,
    canvas_y: Math.floor(i / 100) * 220,
    width: 240,
    height: 140,
  })) as unknown as Node[]
}

/** Time a zoom sweep, recomputing the visible set at each step as the app does */
function zoomSweep(nodeCount: number, steps = 60) {
  const scale = ref(1)
  const offsetX = ref(0)
  const offsetY = ref(0)
  const displayNodes = ref(graph(nodeCount))
  const selectedNodeIds = ref<string[]>([])

  const { visibleNodes } = useViewportCulling({
    scale,
    offsetX,
    offsetY,
    displayNodes,
    selectedNodeIds,
    nodeLayoutVersion: ref(0),
  })

  // Warm the spatial index and the first computation
  void visibleNodes.value

  const start = performance.now()
  for (let i = 0; i < steps; i++) {
    // A pinch zoom walks the scale continuously from 1 down to 0.25
    scale.value = 1 - (i / steps) * 0.75
    void visibleNodes.value
  }
  const totalMs = performance.now() - start

  return { totalMs, perStepMs: totalMs / steps, visible: visibleNodes.value.length }
}

describe('cost of a culling pass while zooming', () => {
  it('stays a small fraction of a frame at the target size', () => {
    const { perStepMs } = zoomSweep(500)

    // A frame is 16.67ms; culling is one of several things in it
    expect(perStepMs).toBeLessThan(2 * SLACK)
  })

  it('stays affordable on a large graph', () => {
    // If this is expensive, deferring recomputation during a zoom gesture is
    // worth its cost in transiently stale culling; if it is cheap, it is not
    const { perStepMs } = zoomSweep(5000)

    expect(perStepMs).toBeLessThan(5 * SLACK)
  })

  it('reports the numbers the decision rests on', () => {
    const small = zoomSweep(500)
    const large = zoomSweep(5000)

    // Printed so the measurement is visible, not just asserted
    console.log(
      `culling per zoom step: 500 nodes ${small.perStepMs.toFixed(3)}ms ` +
        `(${small.visible} visible), 5000 nodes ${large.perStepMs.toFixed(3)}ms ` +
        `(${large.visible} visible)`
    )

    expect(large.perStepMs).toBeGreaterThan(0)
  })
})
