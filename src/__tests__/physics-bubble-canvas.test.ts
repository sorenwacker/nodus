/**
 * While physics mode runs, the bubble canvas paints and hit-tests from the
 * simulation's position array, and the canvas wires the mode to bubble mode
 * only (PRODUCT_DESIGN.md > Physics Mode).
 */
import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { mount } from '@vue/test-utils'
import CanvasLODCanvas from '../canvas/components/CanvasLODCanvas.vue'
import type { Node } from '../types'

function node(id: string, x: number, y: number): Node {
  return { id, title: id, canvas_x: x, canvas_y: y, width: 200, height: 120 } as unknown as Node
}

function mountCanvas(livePositions: unknown) {
  return mount(CanvasLODCanvas, {
    props: {
      nodes: [node('a', 0, 0), node('b', 1000, 0)],
      edges: [],
      highlightedEdgeIds: new Set<string>(),
      edgeStrokeWidth: 1,
      highlightColor: '#0ff',
      scale: 1,
      offsetX: 0,
      offsetY: 0,
      selectedNodeIds: [],
      highlightedNodeIds: new Set<string>(),
      draggingNodeId: null,
      hoveredNodeId: null,
      getLODRadius: () => 10,
      livePositions: livePositions as never,
    },
  })
}

function press(wrapper: ReturnType<typeof mountCanvas>, x: number, y: number) {
  const event = new MouseEvent('pointerdown', { clientX: x, clientY: y, bubbles: true })
  wrapper.find('canvas').element.dispatchEvent(event)
}

describe('the bubble canvas during physics mode', () => {
  it('finds a node where the simulation has it, not where the store has it', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const live = { index: new Map([['a', 0], ['b', 1]]), xy: Float64Array.from([500, 500, 1100, 60]), frame: 1 }
    const wrapper = mountCanvas(live)

    press(wrapper, 500, 500)
    expect(wrapper.emitted('node-pointerdown')?.[0]?.[1]).toBe('a')

    press(wrapper, 100, 60) // the stored centre of a
    expect(wrapper.emitted('node-pointerdown')).toHaveLength(1)
  })

  it('uses the stored positions when no simulation runs', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const wrapper = mountCanvas(null)
    press(wrapper, 100, 60)
    expect(wrapper.emitted('node-pointerdown')?.[0]?.[1]).toBe('a')
  })
})

describe('hover while a node is held', () => {
  function move(wrapper: ReturnType<typeof mountCanvas>, x: number, y: number) {
    wrapper.find('canvas').element.dispatchEvent(new MouseEvent('pointermove', { clientX: x, clientY: y, bubbles: true }))
  }

  it('keeps the pressed node hovered while the pointer runs ahead of it, until release', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const wrapper = mountCanvas(null)
    move(wrapper, 100, 60)
    press(wrapper, 100, 60)
    move(wrapper, 400, 400) // off the circle, which has not caught up yet
    move(wrapper, 100, 60)
    move(wrapper, 400, 400)
    expect(wrapper.emitted('node-pointerleave')).toBeUndefined()
    expect(wrapper.emitted('node-pointerenter')).toHaveLength(1)

    window.dispatchEvent(new MouseEvent('pointerup'))
    move(wrapper, 400, 400)
    expect(wrapper.emitted('node-pointerleave')).toHaveLength(1)
  })
})

describe('the canvas wiring', () => {
  const source = readFileSync(resolve(process.cwd(), 'src/canvas/GraphCanvas.vue'), 'utf8')

  it('blocks physics outside bubble mode and stops it on leaving bubble mode', () => {
    expect(source).toMatch(/isBlocked: \(\) => neighborhoodMode\.value \|\| !isLODMode\.value/)
    expect(source).toMatch(/watch\(\[neighborhoodMode, isLODMode, \(\) => store\.currentWorkspaceId\], \(\) => physics\.stop\(\)\)/)
  })

  it('paints the bubble canvas from the live positions', () => {
    expect(source).toMatch(/:live-positions="physics\.live\.value"/)
  })

  it('runs the simulation in a worker', () => {
    expect(source).toMatch(/createEngine: createWorkerEngine/)
  })
})
