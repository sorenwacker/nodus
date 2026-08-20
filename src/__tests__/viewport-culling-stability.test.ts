/**
 * Culling results must keep their identity while the visible set is unchanged.
 *
 * Panning changes scale/offset on every frame. Everything downstream of the
 * culling result - edge styling, node lists - recomputes whenever that result
 * is a fresh object, even when the same nodes are still on screen. Returning
 * the previous value keeps a pan frame cheap.
 */
import { describe, it, expect } from 'vitest'
import { ref, computed, effectScope } from 'vue'
import { useViewportCulling } from '../canvas/composables/rendering/useViewportCulling'
import type { Node } from '../types'

function makeNodes(count: number, spacing = 300): Node[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `n${i}`,
    title: `Node ${i}`,
    canvas_x: (i % 40) * spacing,
    canvas_y: Math.floor(i / 40) * spacing,
    width: 200,
    height: 100,
  })) as unknown as Node[]
}

function setup(nodeCount: number) {
  const scale = ref(1)
  const offsetX = ref(0)
  const offsetY = ref(0)
  const nodes = ref(makeNodes(nodeCount))
  const scope = effectScope()
  const culling = scope.run(() =>
    useViewportCulling({
      scale,
      offsetX,
      offsetY,
      displayNodes: computed(() => nodes.value),
      selectedNodeIds: ref([]),
    })
  )!
  return { scale, offsetX, offsetY, nodes, culling, scope }
}

describe('viewport culling stability', () => {
  for (const size of [50, 400]) {
    const label = size < 200 ? 'linear scan' : 'spatial index'

    it(`keeps the id set identical across a small pan (${label})`, () => {
      const { offsetX, culling } = setup(size)
      const before = culling.visibleNodeIds.value

      // A few pixels of panning does not change which nodes are on screen
      offsetX.value -= 3
      expect(culling.visibleNodeIds.value).toBe(before)

      offsetX.value -= 4
      expect(culling.visibleNodeIds.value).toBe(before)
    })

    it(`keeps the node list identical across a small pan (${label})`, () => {
      const { offsetX, culling } = setup(size)
      const before = culling.visibleNodes.value

      offsetX.value -= 3
      expect(culling.visibleNodes.value).toBe(before)
    })

    it(`returns a new set once the visible nodes actually change (${label})`, () => {
      const { offsetX, culling } = setup(size)
      const before = culling.visibleNodeIds.value

      // Pan far enough that the visible set must differ
      offsetX.value -= 20000
      const after = culling.visibleNodeIds.value
      expect(after).not.toBe(before)
      expect([...after]).not.toEqual([...before])
    })
  }

  it('reflects a node added to the graph', () => {
    const { nodes, culling } = setup(50)
    const before = culling.visibleNodeIds.value
    expect(before.has('extra')).toBe(false)

    nodes.value = [
      ...nodes.value,
      { id: 'extra', title: 'Extra', canvas_x: 0, canvas_y: 0, width: 200, height: 100 } as unknown as Node,
    ]

    const after = culling.visibleNodeIds.value
    expect(after).not.toBe(before)
    expect(after.has('extra')).toBe(true)
  })
})
