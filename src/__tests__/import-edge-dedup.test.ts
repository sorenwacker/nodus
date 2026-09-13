/**
 * An import keeps every edge the backend stored
 * (PRODUCT_DESIGN.md > One rule, one place).
 *
 * The import deduplicated the edges it fetched by node pair alone, while the
 * edges store keys them by pair and link type. Two notes connected by a
 * wikilink and by a citation therefore lost one of those edges from the view
 * after an import, until the next load.
 */
import { describe, it, expect, vi } from 'vitest'
import type { Edge, Node } from '../types'

const imported = { id: 'n1', title: 'Alpha', file_path: '/v/Alpha.md' } as Node

function edge(id: string, linkType: string): Edge {
  return {
    id,
    source_node_id: 'n1',
    target_node_id: 'n2',
    link_type: linkType,
    directed: true,
    created_at: 0,
  } as Edge
}

vi.mock('../lib/tauri', async importOriginal => ({
  ...(await importOriginal<typeof import('../lib/tauri')>()),
  invoke: vi.fn(async (command: string) => {
    if (command === 'import_vault') return { nodes: [imported], skipped: [] }
    if (command === 'get_edges') return [edge('e1', 'wikilink'), edge('e2', 'cites')]
    return []
  }),
  refreshWorkspace: vi.fn().mockResolvedValue(0),
  setWorkspaceSync: vi.fn().mockResolvedValue(undefined),
  syncAllWikilinks: vi.fn().mockResolvedValue(0),
}))

import { useImport, type ImportDeps } from '../composables/useImport'

describe('importing a vault whose notes are connected twice', () => {
  it('keeps both edges, as the edges store does', async () => {
    let stored: Edge[] = []
    const importer = useImport({
      getCurrentWorkspaceId: () => 'w1',
      getNodes: () => [imported],
      setNodes: vi.fn(),
      addNodes: vi.fn(),
      setEdges: (edges: Edge[]) => {
        stored = edges
      },
      reloadFrames: vi.fn().mockResolvedValue(undefined),
      createNode: vi.fn(),
      watchVault: vi.fn().mockResolvedValue(undefined),
      getVaultPath: () => '/v',
      deduplicateEdges: (edges: Edge[]) => edges,
    } as unknown as ImportDeps)

    await importer.importVault('/v')

    expect(stored.map(e => e.link_type).sort()).toEqual(['cites', 'wikilink'])
  })
})
