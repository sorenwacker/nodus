/**
 * A refresh brings in what changed on disk and leaves the arrangement alone
 * (PRODUCT_DESIGN.md > Refreshing a workspace from its files).
 *
 * Refresh re-ran the import grid for every folder that already had a frame, so
 * each refresh put every node inside a folder frame back into a three-column
 * grid and discarded where the user had placed it.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Node } from '../types'

let currentNodes: Node[] = []

vi.mock('../lib/tauri', async importOriginal => ({
  ...(await importOriginal<typeof import('../lib/tauri')>()),
  invoke: vi.fn(async (command: string) => (command === 'get_nodes' ? currentNodes : [])),
  refreshWorkspace: vi.fn().mockResolvedValue(0),
  syncAllWikilinks: vi.fn().mockResolvedValue(0),
}))

import { useImport, type ImportDeps } from '../composables/useImport'

const FRAME = { id: 'f1', folder_path: 'notes', canvas_x: 0, canvas_y: 0, width: 600, height: 800 }

function makeNode(id: string, frameId: string | null, x: number, y: number): Node {
  return {
    id,
    title: id,
    file_path: `/v/notes/${id}.md`,
    markdown_content: '',
    node_type: 'note',
    canvas_x: x,
    canvas_y: y,
    width: 200,
    height: 120,
    z_index: 0,
    frame_id: frameId,
    color_theme: null,
    is_collapsed: false,
    tags: null,
    workspace_id: 'w',
    checksum: null,
    created_at: 0,
    updated_at: 0,
    deleted_at: null,
  } as Node
}

function wire(nodes: Node[]) {
  currentNodes = nodes
  const frame = { ...FRAME }
  const updateNodePosition = vi.fn((id: string, x: number, y: number) => {
    const node = nodes.find(n => n.id === id)
    if (node) {
      node.canvas_x = x
      node.canvas_y = y
    }
  })
  const assignNodesToFrame = vi.fn()
  const updateFrameSize = vi.fn((_: string, width: number, height: number) => {
    frame.width = width
    frame.height = height
  })
  const deps = {
    getCurrentWorkspaceId: () => 'w',
    getNodes: () => nodes,
    setNodes: vi.fn(),
    addNodes: vi.fn(),
    setEdges: vi.fn(),
    reloadFrames: vi.fn().mockResolvedValue(undefined),
    createNode: vi.fn(),
    watchVault: vi.fn().mockResolvedValue(undefined),
    createFrame: vi.fn(() => ({ id: 'new-frame' })),
    assignNodesToFrame,
    updateNodePosition,
    updateFrameSize,
    getFrames: () => [frame],
    getVaultPath: () => '/v',
  } as ImportDeps
  return { importer: useImport(deps), frame, updateNodePosition, assignNodesToFrame, updateFrameSize }
}

type Wired = ReturnType<typeof wire>
const TRIGGERS: Array<[string, (w: Wired) => Promise<number>]> = [
  ['refreshing the workspace', w => w.importer.refreshWorkspace()],
  ['syncing frames from folders', w => w.importer.syncFramesFromFolders()],
]

describe.each(TRIGGERS)('%s', (_, trigger) => {
  let placed: Node
  let newcomer: Node

  beforeEach(() => {
    // Placed by the user low in the frame; the newcomer is a new file in the folder
    placed = makeNode('placed', 'f1', 40, 600)
    newcomer = makeNode('newcomer', null, 0, 0)
  })

  it('keeps a node already in its folder frame where the user put it', async () => {
    const wired = wire([placed, newcomer])
    await trigger(wired)

    expect(wired.updateNodePosition).not.toHaveBeenCalledWith('placed', expect.anything(), expect.anything())
    expect(placed.canvas_x).toBe(40)
    expect(placed.canvas_y).toBe(600)
  })

  it('places a newcomer below what the frame already holds', async () => {
    const wired = wire([placed, newcomer])
    await trigger(wired)

    expect(wired.updateNodePosition).toHaveBeenCalledWith('newcomer', expect.any(Number), expect.any(Number))
    expect(newcomer.canvas_y).toBeGreaterThanOrEqual(placed.canvas_y + placed.height)
  })

  it('assigns only the newcomer to the frame', async () => {
    const wired = wire([placed, newcomer])
    await trigger(wired)

    expect(wired.assignNodesToFrame).toHaveBeenCalledWith(['newcomer'], 'f1')
    expect(wired.assignNodesToFrame).not.toHaveBeenCalledWith(expect.arrayContaining(['placed']), 'f1')
  })

  it('grows the frame until it contains the newcomer', async () => {
    const wired = wire([placed, newcomer])
    await trigger(wired)

    expect(wired.updateFrameSize).toHaveBeenCalledWith('f1', expect.any(Number), expect.any(Number))
    expect(wired.frame.canvas_x + wired.frame.width).toBeGreaterThanOrEqual(newcomer.canvas_x + newcomer.width)
    expect(wired.frame.canvas_y + wired.frame.height).toBeGreaterThanOrEqual(newcomer.canvas_y + newcomer.height)
  })

  it('changes nothing when every node is already in its frame', async () => {
    const other = makeNode('other', 'f1', 300, 100)
    const wired = wire([placed, other])
    await trigger(wired)

    expect(wired.updateNodePosition).not.toHaveBeenCalled()
    expect(wired.updateFrameSize).not.toHaveBeenCalled()
  })
})
