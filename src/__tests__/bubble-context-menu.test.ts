/**
 * The context menu opens on a bubble (PRODUCT_DESIGN.md > Context Menu).
 *
 * The bubble canvas sits inside the canvas viewport, so a right-click on it
 * reaches both handlers: the bubble canvas's, which opens the menu for the
 * node under the pointer, and then the viewport's, which closed it again
 * because the click had not landed on a card element.
 */
import { describe, it, expect, vi } from 'vitest'
import { defineComponent, h, ref } from 'vue'
import { mount } from '@vue/test-utils'
import CanvasLODCanvas from '../canvas/components/CanvasLODCanvas.vue'
import { useCanvasEventHandlers, type UseCanvasEventHandlersContext } from '../canvas/composables/util/useCanvasEventHandlers'
import type { Node } from '../types'

function node(id: string, x: number, y: number): Node {
  return { id, title: id, canvas_x: x, canvas_y: y, width: 200, height: 120 } as unknown as Node
}

/** The viewport element with the bubble canvas inside it, wired as GraphCanvas wires them */
function mountViewport() {
  const menu = { open: vi.fn(), close: vi.fn() }
  const selected = ref<string[]>([])
  const handlers = useCanvasEventHandlers({
    contextMenu: menu,
    suppressPreviewPanel: () => {},
    getSelectedNodeIds: () => selected.value,
    selectNode: (id: string) => {
      selected.value = [id]
    },
  } as unknown as UseCanvasEventHandlersContext)

  const Viewport = defineComponent({
    setup: () => () =>
      h('div', { class: 'canvas-viewport', onContextmenu: handlers.onContextMenu }, [
        h('div', { class: 'node-card', 'data-node-id': 'card' }),
        h(CanvasLODCanvas, {
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
          livePositions: null,
          onNodeContextmenu: handlers.onLODNodeContextMenu,
          onCanvasContextmenu: handlers.onLODCanvasContextMenu,
        }),
      ]),
  })
  vi.spyOn(console, 'error').mockImplementation(() => {})
  const wrapper = mount(Viewport)
  const rightClick = (selector: string, x: number, y: number) =>
    wrapper.find(selector).element.dispatchEvent(new MouseEvent('contextmenu', { clientX: x, clientY: y, bubbles: true, cancelable: true }))
  return { menu, selected, rightClick }
}

describe('the context menu in bubble mode', () => {
  it('opens for the bubble under the pointer and stays open', () => {
    const { menu, selected, rightClick } = mountViewport()
    rightClick('canvas', 100, 60) // the centre of a
    expect(menu.open).toHaveBeenCalledTimes(1)
    expect(menu.open.mock.calls[0][1]).toBe('a')
    expect(menu.close).not.toHaveBeenCalled()
    expect(selected.value).toEqual(['a'])
  })

  it('closes on a right-click on empty canvas', () => {
    const { menu, rightClick } = mountViewport()
    rightClick('canvas', 500, 500)
    expect(menu.open).not.toHaveBeenCalled()
    expect(menu.close).toHaveBeenCalledTimes(1)
  })

  it('still opens for a card', () => {
    const { menu, rightClick } = mountViewport()
    rightClick('.node-card', 0, 0)
    expect(menu.open).toHaveBeenCalledTimes(1)
    expect(menu.open.mock.calls[0][1]).toBe('card')
    expect(menu.close).not.toHaveBeenCalled()
  })
})
