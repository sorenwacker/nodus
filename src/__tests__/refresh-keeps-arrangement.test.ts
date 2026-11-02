/**
 * A refresh brings in what changed on disk and leaves the arrangement alone
 * (PRODUCT_DESIGN.md > Refreshing a workspace from its files); an import
 * places each folder's notes as one cluster (docs/design/remove-frames.md >
 * Imports that created frames).
 *
 * Refresh re-ran the import grid for every folder that already had a frame, so
 * each refresh put every node inside a folder frame back into a three-column
 * grid and discarded where the user had placed it. Folder frames are removed;
 * the folder stays in each node's file path.
 */
import { describe, it, expect, vi } from 'vitest'
import type { Node } from '../types'

let currentNodes: Node[] = []
let importedNodes: Node[] = []

vi.mock('../lib/tauri', async importOriginal => ({
  ...(await importOriginal<typeof import('../lib/tauri')>()),
  invoke: vi.fn(async (command: string) => {
    if (command === 'get_nodes') return currentNodes
    if (command === 'import_vault') return { nodes: importedNodes, skipped: [] }
    return []
  }),
  refreshWorkspace: vi.fn().mockResolvedValue(0),
  syncAllWikilinks: vi.fn().mockResolvedValue(0),
  setWorkspaceSync: vi.fn().mockResolvedValue(undefined),
}))

import { useImport, type ImportDeps } from '../composables/useImport'

function makeNode(id: string, filePath: string, x = 0, y = 0): Node {
  return {
    id,
    title: id,
    file_path: filePath,
    markdown_content: '',
    node_type: 'note',
    canvas_x: x,
    canvas_y: y,
    width: 200,
    height: 120,
    workspace_id: 'w',
  } as Node
}

function wire(nodes: Node[]) {
  currentNodes = nodes
  const updateNodePosition = vi.fn((id: string, x: number, y: number) => {
    const node = nodes.find(n => n.id === id)
    if (node) {
      node.canvas_x = x
      node.canvas_y = y
    }
  })
  const deps = {
    getCurrentWorkspaceId: () => 'w',
    setNodes: vi.fn(),
    addNodes: vi.fn(),
    setEdges: vi.fn(),
    deduplicateEdges: (edges: unknown[]) => edges,
    createNode: vi.fn(),
    watchVault: vi.fn().mockResolvedValue(undefined),
    updateNodePosition,
  } as ImportDeps
  return { importer: useImport(deps), updateNodePosition }
}

/** Bounding box of a set of nodes */
function box(nodes: Node[]) {
  return {
    left: Math.min(...nodes.map(n => n.canvas_x)),
    top: Math.min(...nodes.map(n => n.canvas_y)),
    right: Math.max(...nodes.map(n => n.canvas_x + (n.width || 0))),
    bottom: Math.max(...nodes.map(n => n.canvas_y + (n.height || 0))),
  }
}

describe('refreshing the workspace', () => {
  it('moves no node', async () => {
    const placed = makeNode('placed', '/v/notes/placed.md', 40, 600)
    const newcomer = makeNode('newcomer', '/v/notes/newcomer.md', 0, 0)
    const wired = wire([placed, newcomer])

    await wired.importer.refreshWorkspace()

    expect(wired.updateNodePosition).not.toHaveBeenCalled()
    expect([placed.canvas_x, placed.canvas_y]).toEqual([40, 600])
  })
})

describe('importing a vault', () => {
  it('places each folder as its own cluster', async () => {
    const people = [1, 2, 3, 4].map(i => makeNode(`p${i}`, `/v/people/p${i}.md`))
    const places = [1, 2].map(i => makeNode(`l${i}`, `/v/places/l${i}.md`))
    importedNodes = [...people, ...places]
    const wired = wire(importedNodes)

    await wired.importer.importVault('/v')

    const a = box(people)
    const b = box(places)
    const overlap = a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom
    expect(overlap).toBe(false)
    // Within a cluster no two cards share a position
    expect(new Set(people.map(n => `${n.canvas_x},${n.canvas_y}`)).size).toBe(people.length)
  })

  it('leaves a note at the vault root where the import put it', async () => {
    const root = makeNode('readme', '/v/readme.md', 7, 9)
    importedNodes = [root, makeNode('p1', '/v/people/p1.md')]
    const wired = wire(importedNodes)

    await wired.importer.importVault('/v')

    expect(wired.updateNodePosition).not.toHaveBeenCalledWith('readme', expect.anything(), expect.anything())
  })
})
