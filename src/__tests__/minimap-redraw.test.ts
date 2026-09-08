/**
 * A viewport move redraws the minimap's viewport rectangle and nothing else.
 *
 * The minimap draws one mark per node in the workspace, so its cost scales with
 * the graph while the canvas above it scales with the viewport: panning eight
 * cards used to re-render a mark for every node, with the position function
 * called once each for x, y, width and height - four calls per node per frame
 * (PRODUCT_DESIGN.md > Minimap redraw).
 */
import { describe, it, expect } from 'vitest'
import { ref } from 'vue'
import { mount } from '@vue/test-utils'
import { useMinimap } from '../canvas/composables/viewport/useMinimap'
import CanvasMinimap from '../canvas/components/CanvasMinimap.vue'

// Wall-clock budgets are load-sensitive; the full suite runs this alongside
// everything else (matches the SLACK convention in canvas-performance.test.ts)
const SLACK = 6
const FRAMES = 60

function nodes(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: `n${i}`,
    canvas_x: (i % 40) * 300,
    canvas_y: Math.floor(i / 40) * 200,
    width: 356,
    height: 301,
    color_theme: null,
  }))
}

function setup(count = 500) {
  const scale = ref(1)
  const offsetX = ref(0)
  const offsetY = ref(0)
  const selectedNodeIds = ref<string[]>([])
  const nodeList = ref(nodes(count))
  const minimap = useMinimap({
    nodes: nodeList,
    selectedNodeIds,
    scale,
    offsetX,
    offsetY,
    getViewportSize: () => ({ width: 1600, height: 900 }),
  } as never)
  return { minimap, scale, offsetX, offsetY, selectedNodeIds, nodeList }
}

describe('minimap redraw', () => {
  it('keeps the marks untouched while the viewport moves', () => {
    const { minimap, offsetX, offsetY, scale } = setup()
    const marks = minimap.nodeMarks.value
    expect(marks.length).toBe(500)

    offsetX.value -= 400
    offsetY.value += 250
    scale.value = 0.6

    // Same list by identity: nothing to re-render, whatever the viewport does
    expect(minimap.nodeMarks.value).toBe(marks)
  })

  it('rebuilds the marks when the nodes move', () => {
    const { minimap, nodeList } = setup(10)
    const marks = minimap.nodeMarks.value

    nodeList.value = [...nodeList.value.slice(1)]

    expect(minimap.nodeMarks.value).not.toBe(marks)
    expect(minimap.nodeMarks.value.length).toBe(9)
  })

  it('rebuilds the marks when the selection changes', () => {
    const { minimap, selectedNodeIds } = setup(10)
    const marks = minimap.nodeMarks.value

    selectedNodeIds.value = ['n3']

    const rebuilt = minimap.nodeMarks.value
    expect(rebuilt).not.toBe(marks)
    expect(rebuilt.find(m => m.id === 'n3')!.opacity).toBe(1)
    expect(rebuilt.find(m => m.id === 'n4')!.opacity).toBeLessThan(1)
  })

  it('costs a viewport move almost nothing, whatever the graph holds', async () => {
    const { minimap } = setup(1581)
    const wrapper = mount(CanvasMinimap, {
      props: {
        visible: true,
        marks: minimap.nodeMarks.value,
        minimapSize: 150,
        viewportX: 0,
        viewportY: 0,
        viewportWidth: 50,
        viewportHeight: 40,
      },
    })
    expect(wrapper.findAll('.minimap-mark').length).toBe(1581)

    const start = performance.now()
    for (let frame = 0; frame < FRAMES; frame++) {
      await wrapper.setProps({ viewportX: frame, viewportY: frame })
    }
    const perFrame = (performance.now() - start) / FRAMES

    // 4.47ms per frame before the marks were lifted out of the redraw
    expect(perFrame).toBeLessThan(0.15 * SLACK)
  })
})
