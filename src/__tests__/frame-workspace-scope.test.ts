/**
 * A node and its frame are in the same workspace.
 *
 * The frame store holds every workspace's frames, and workspaces share canvas
 * coordinates. Dropping a node chose among all of them, so a node released
 * where another workspace's frame lies, unseen, joined that frame; moving or
 * fitting that frame then reached into a workspace the user was not looking at
 * (PRODUCT_DESIGN.md > What belongs to a frame).
 */
import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { ref } from 'vue'
import type { Frame, Node } from '../types'
import { useNodeDragging } from '../canvas/composables/nodes/useNodeDragging'

vi.mock('../lib/tauri', async importOriginal => ({
  ...(await importOriginal<typeof import('../lib/tauri')>()),
  invoke: vi.fn(async () => []),
  refreshWorkspace: vi.fn().mockResolvedValue(0),
  syncAllWikilinks: vi.fn().mockResolvedValue(0),
}))

import { useImport, type ImportDeps } from '../composables/useImport'

function makeNode(workspaceId: string | null): Node {
  return {
    id: 'n1',
    title: 'n1',
    file_path: null,
    markdown_content: null,
    node_type: 'note',
    canvas_x: 0,
    canvas_y: 0,
    width: 200,
    height: 120,
    frame_id: null,
    workspace_id: workspaceId,
    created_at: 0,
    updated_at: 0,
  } as Node
}

function makeFrame(id: string, workspaceId: string | null): Frame {
  // Large enough that the dropped node lies entirely inside it
  return {
    id,
    title: id,
    canvas_x: 0,
    canvas_y: 0,
    width: 1000,
    height: 1000,
    workspace_id: workspaceId,
    folder_path: null,
  } as Frame
}

/** Drag node n1 by a small offset and release it; returns the assign spy. */
function dropOnto(node: Node, frames: Frame[]) {
  const assignNodesToFrame = vi.fn((ids: string[], frameId: string | null) => {
    if (ids.includes(node.id)) node.frame_id = frameId
  })
  const dragging = useNodeDragging({
    store: {
      getNode: (id: string) => (id === node.id ? node : undefined),
      updateNodePosition: (_id: string, x: number, y: number) => {
        node.canvas_x = x
        node.canvas_y = y
      },
      persistNodePosition: vi.fn(),
      triggerLayoutUpdate: vi.fn(),
      selectNode: vi.fn(),
      selectedNodeIds: [] as string[],
      filteredNodes: [node],
      filteredEdges: [],
      frames,
      assignNodesToFrame,
      refreshNodeFromFile: vi.fn(),
      nodeLayoutVersion: 0,
    },
    scale: ref(1),
    offset: ref({ x: 0, y: 0 }),
    canvasRef: ref(null),
    gridLockEnabled: ref(false),
    snapToGrid: (v: number) => v,
    neighborhoodMode: ref(false),
    focusNodeId: ref(null),
    isLODMode: ref(false),
    isSemanticZoomCollapsed: ref(false),
    editingNodeId: ref(null),
    editingTitleId: ref(null),
    selectedEdge: ref(null),
    isCreatingEdge: ref(false),
    edgeStartNode: ref(null),
    edgePreviewEnd: ref({ x: 0, y: 0 }),
    layoutNeighborhood: vi.fn(),
    pushOverlappingNodesAway: vi.fn(),
    pushUndo: vi.fn(),
    pushFrameAssignmentUndo: vi.fn(),
    screenToCanvas: (x: number, y: number) => ({ x, y }),
    zoomToNode: vi.fn(),
    onEdgePreviewMove: vi.fn(),
    setLastDragEndTime: vi.fn(),
  } as never)

  dragging.onNodePointerDown(new PointerEvent('pointerdown', { clientX: 0, clientY: 0, button: 0 }), node.id)
  document.dispatchEvent(new PointerEvent('pointermove', { clientX: 80, clientY: 60, buttons: 1 }))
  document.dispatchEvent(new PointerEvent('pointerup', { clientX: 80, clientY: 60 }))
  return assignNodesToFrame
}

describe('dropping a node on a frame', () => {
  it('joins a frame of its own workspace', () => {
    const node = makeNode('ws-a')
    dropOnto(node, [makeFrame('own', 'ws-a')])
    expect(node.frame_id).toBe('own')
  })

  it('ignores a frame of another workspace at the same place', () => {
    const node = makeNode('ws-a')
    const assign = dropOnto(node, [makeFrame('foreign', 'ws-b')])
    expect(assign).not.toHaveBeenCalled()
    expect(node.frame_id).toBeNull()
  })

  it('chooses its own frame when a foreign one lies over it', () => {
    const node = makeNode('ws-a')
    dropOnto(node, [makeFrame('foreign', 'ws-b'), makeFrame('own', 'ws-a')])
    expect(node.frame_id).toBe('own')
  })

  it('treats null and "default" as the same unnamed workspace', () => {
    const node = makeNode(null)
    dropOnto(node, [makeFrame('foreign', 'ws-b'), makeFrame('own', 'default')])
    expect(node.frame_id).toBe('own')
  })

  it('leaves a frame of another workspace it was wrongly assigned to', () => {
    // Existing data holds such assignments; a drag within the node's own
    // workspace must not keep them just because the coordinates still overlap
    const node = makeNode('ws-a')
    node.frame_id = 'foreign'
    dropOnto(node, [makeFrame('foreign', 'ws-b')])
    expect(node.frame_id).toBeNull()
  })
})

describe('folder frames on file sync', () => {
  it('are looked up among the open workspace frames only', () => {
    // File sync follows the open workspace's vault and matches frames by
    // folder_path; the frame store holds every workspace's frames
    const src = readFileSync(resolve(__dirname, '../stores/nodes.ts'), 'utf-8')
    const start = src.indexOf('useFileSync({')
    const deps = src.slice(start, src.indexOf('\n  })', start))
    expect(deps).toMatch(/getFrames:\s*\(\)\s*=>\s*filteredFrames\.value/)
  })
})

describe('folder frames on refresh and import', () => {
  // A second workspace on the same vault: same folder, its own folder frame
  function node(id: string, workspaceId: string): Node {
    return { ...makeNode(workspaceId), id, file_path: `/v/notes/${id}.md` }
  }

  function wire(nodes: Node[]) {
    const foreignFrame = { id: 'foreign', workspace_id: 'ws-b', folder_path: 'notes', canvas_x: 0, canvas_y: 0, width: 600, height: 800 }
    const assignNodesToFrame = vi.fn()
    const createFrame = vi.fn(() => ({ id: 'own' }))
    const updateFrameSize = vi.fn()
    const deps = {
      getCurrentWorkspaceId: () => 'ws-a',
      getNodes: () => nodes,
      setNodes: vi.fn(),
      addNodes: vi.fn(),
      setEdges: vi.fn(),
      deduplicateEdges: (edges: unknown[]) => edges,
      reloadFrames: vi.fn().mockResolvedValue(undefined),
      createNode: vi.fn(),
      watchVault: vi.fn().mockResolvedValue(undefined),
      createFrame,
      assignNodesToFrame,
      updateNodePosition: vi.fn(),
      updateFrameSize,
      getFrames: () => [foreignFrame],
      getVaultPath: () => '/v',
    } as ImportDeps
    return { importer: useImport(deps), assignNodesToFrame, createFrame, updateFrameSize }
  }

  it('builds folder frames from the target workspace only', async () => {
    const w = wire([node('mine', 'ws-a'), node('theirs', 'ws-b')])
    await w.importer.syncFramesFromFolders()

    // The other workspace's folder frame is neither used nor grown
    const assignedTo = w.assignNodesToFrame.mock.calls.map(c => c[1])
    expect(assignedTo).not.toContain('foreign')
    expect(w.updateFrameSize).not.toHaveBeenCalledWith('foreign', expect.anything(), expect.anything())
    // The workspace gets its own folder frame, holding only its own node
    expect(w.createFrame).toHaveBeenCalledWith(
      expect.any(Number), expect.any(Number), expect.any(Number), expect.any(Number),
      expect.any(String), 'ws-a', 'notes', null
    )
    const assignedIds = w.assignNodesToFrame.mock.calls.flatMap(c => c[0])
    expect(assignedIds).toContain('mine')
    expect(assignedIds).not.toContain('theirs')
  })
})
