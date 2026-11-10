/**
 * A pinned card keeps its position (PRODUCT_DESIGN.md > Pinned cards): the
 * store refuses position writes for it, layouts arrange the other cards,
 * physics holds it, and a drag does not start on it.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ref } from 'vue'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { createI18n } from 'vue-i18n'
import en from '../i18n/locales/en.json'
import { useNodesStore } from '../stores/nodes'
import { executeAutoLayout, type AutoLayoutStore } from '../canvas/composables/layout/useAutoLayout'
import CanvasContextMenu from '../canvas/components/CanvasContextMenu.vue'
import type { Node } from '../types'

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }))
vi.mock('@tauri-apps/api/core', () => ({ invoke: invokeMock }))
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn().mockResolvedValue(() => {}) }))

function makeNode(id: string, extra: Partial<Node> = {}): Node {
  return {
    id, title: id, file_path: null, markdown_content: '', node_type: 'note',
    canvas_x: 100, canvas_y: 100, width: 200, height: 120, z_index: 0, color_theme: null,
    is_collapsed: false, tags: null, workspace_id: null, checksum: null,
    created_at: 0, updated_at: 0, deleted_at: null, ...extra,
  } as Node
}

describe('a pinned card', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    invokeMock.mockReset()
    invokeMock.mockResolvedValue(undefined)
  })

  it('keeps its position when the store is asked to move it', async () => {
    const store = useNodesStore()
    store.nodes.push(makeNode('pinned', { is_pinned: true }), makeNode('free'))

    await store.updateNodePosition('pinned', 500, 600)
    await store.updateNodePosition('free', 500, 600)
    store.setNodePositionsInMemory(new Map([['pinned', { x: 900, y: 900 }], ['free', { x: 900, y: 900 }]]))

    const pinned = store.getNode('pinned')!, free = store.getNode('free')!
    expect([pinned.canvas_x, pinned.canvas_y]).toEqual([100, 100])
    expect([free.canvas_x, free.canvas_y]).toEqual([900, 900])
    expect(invokeMock).not.toHaveBeenCalledWith('update_node_position', expect.objectContaining({ id: 'pinned' }))
  })

  it('is pinned and unpinned through the backend', async () => {
    const store = useNodesStore()
    store.nodes.push(makeNode('a'))

    await store.setNodePinned('a', true)
    expect(store.getNode('a')!.is_pinned).toBe(true)
    expect(invokeMock).toHaveBeenCalledWith('update_node_pinned', { id: 'a', pinned: true })

    await store.setNodePinned('a', false)
    expect(store.getNode('a')!.is_pinned).toBe(false)
    await store.updateNodePosition('a', 5, 6)
    expect([store.getNode('a')!.canvas_x, store.getNode('a')!.canvas_y]).toEqual([5, 6])
  })

  it('is left where it is by the layouts, which arrange the other cards', async () => {
    const nodes = [
      makeNode('pinned', { is_pinned: true, canvas_x: 5000, canvas_y: 5000 }),
      makeNode('a', { canvas_x: 0, canvas_y: 0 }),
      makeNode('b', { canvas_x: 900, canvas_y: 900 }),
      makeNode('c', { canvas_x: 300, canvas_y: 700 }),
    ]
    const moved = new Map<string, { x: number; y: number }>()
    const store: AutoLayoutStore = {
      getNodes: () => nodes,
      getFilteredNodes: () => nodes,
      getFilteredEdges: () => [{ id: 'e', source_node_id: 'a', target_node_id: 'pinned' }] as never,
      getSelectedNodeIds: () => [],
      updateNodePosition: (id, x, y) => moved.set(id, { x, y }),
    }
    for (const layout of ['grid', 'horizontal', 'vertical', 'hierarchical'] as const) {
      moved.clear()
      await executeAutoLayout(layout, { store, animateToPositions: targets => { for (const [id, p] of targets) moved.set(id, p) } })
      expect(moved.has('pinned'), `${layout} moved the pinned card`).toBe(false)
      expect([...moved.keys()].sort(), `${layout} arranged the rest`).toEqual(['a', 'b', 'c'])
    }
  })

  it('can be selected but not dragged', async () => {
    const { useNodeDragging } = await import('../canvas/composables/nodes/useNodeDragging')
    const nodes = [makeNode('pinned', { is_pinned: true }), makeNode('free')]
    const selectNode = vi.fn()
    const updateNodePosition = vi.fn()
    const dragging = useNodeDragging({
      store: {
        getNode: (id: string) => nodes.find(n => n.id === id),
        updateNodePosition, persistNodePosition: vi.fn(), triggerLayoutUpdate: vi.fn(),
        selectNode, selectedNodeIds: [] as string[], filteredNodes: nodes, filteredEdges: [], frames: [],
        assignNodesToFrame: vi.fn(), refreshNodeFromFile: vi.fn(), nodeLayoutVersion: 0,
      },
      scale: ref(1), offset: ref({ x: 0, y: 0 }), canvasRef: ref(null), gridLockEnabled: ref(false),
      snapToGrid: (v: number) => v, neighborhoodMode: ref(false), focusNodeId: ref(null), isLODMode: ref(false),
      isSemanticZoomCollapsed: ref(false), editingNodeId: ref(null), editingTitleId: ref(null), selectedEdge: ref(null),
      isCreatingEdge: ref(false), edgeStartNode: ref(null), edgePreviewEnd: ref({ x: 0, y: 0 }),
      layoutNeighborhood: vi.fn(), pushOverlappingNodesAway: vi.fn(), pushUndo: vi.fn(), pushFrameAssignmentUndo: vi.fn(),
      screenToCanvas: (x: number, y: number) => ({ x, y }), zoomToNode: vi.fn(), onEdgePreviewMove: vi.fn(), setLastDragEndTime: vi.fn(),
    } as never)

    dragging.onNodePointerDown(new PointerEvent('pointerdown', { clientX: 0, clientY: 0, button: 0 }), 'pinned')
    document.dispatchEvent(new PointerEvent('pointermove', { clientX: 80, clientY: 60, buttons: 1 }))
    document.dispatchEvent(new PointerEvent('pointerup', { clientX: 80, clientY: 60 }))

    expect(selectNode).toHaveBeenCalledWith('pinned', false)
    expect(updateNodePosition).not.toHaveBeenCalled()
    expect(dragging.draggingNode.value).toBeNull()
  })

  it('is offered as Pin position, and Unpin once pinned, in the context menu', async () => {
    const i18n = createI18n({ legacy: false, locale: 'en', messages: { en } })
    const mountMenu = (pinned: boolean) => mount(CanvasContextMenu, {
      props: {
        visible: true, position: { x: 0, y: 0 }, nodeId: 'a', nodeCount: 1, pinned,
        storylineSubmenu: false, workspaceSubmenu: false, entitySubmenu: false,
        storylines: [], workspaces: [], entities: [], currentWorkspaceId: null,
      },
      global: { plugins: [i18n] },
      attachTo: document.body,
    })
    const unpinned = mountMenu(false)
    const item = unpinned.findAll('.context-menu-item').find(w => w.text() === 'Pin position')
    expect(item).toBeDefined()
    await item!.trigger('click')
    expect(unpinned.emitted('toggle-pin')).toHaveLength(1)
    unpinned.unmount()

    const pinnedMenu = mountMenu(true)
    expect(pinnedMenu.findAll('.context-menu-item').some(w => w.text() === 'Unpin')).toBe(true)
    pinnedMenu.unmount()
  })
})
