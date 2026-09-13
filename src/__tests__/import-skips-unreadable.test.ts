/**
 * A file the import cannot take does not stop it
 * (PRODUCT_DESIGN.md > Importing a vault).
 *
 * One unreadable file aborted the whole import, so a vault with a single bad
 * file imported nothing and said only that the import failed. The files left
 * behind are named instead.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Node } from '../types'
import { notifications$ } from '../composables/useNotifications'

const imported = { id: 'n1', title: 'Good', file_path: '/v/Good.md' } as Node

vi.mock('../lib/tauri', async importOriginal => ({
  ...(await importOriginal<typeof import('../lib/tauri')>()),
  invoke: vi.fn(async (command: string) =>
    command === 'import_vault'
      ? { nodes: [imported], skipped: [{ path: '/v/Broken.md', reason: 'stream did not contain valid UTF-8' }] }
      : []
  ),
  refreshWorkspace: vi.fn().mockResolvedValue(0),
  setWorkspaceSync: vi.fn().mockResolvedValue(undefined),
  syncAllWikilinks: vi.fn().mockResolvedValue(0),
}))

import { useImport, type ImportDeps } from '../composables/useImport'

function wire() {
  const added: Node[] = []
  const deps = {
    getCurrentWorkspaceId: () => 'w1',
    getNodes: () => added,
    setNodes: vi.fn(),
    addNodes: vi.fn((nodes: Node[]) => added.push(...nodes)),
    setEdges: vi.fn(),
    deduplicateEdges: (edges: unknown[]) => edges,
    reloadFrames: vi.fn().mockResolvedValue(undefined),
    createNode: vi.fn(),
    watchVault: vi.fn().mockResolvedValue(undefined),
    getVaultPath: () => '/v',
  } as unknown as ImportDeps
  return { importer: useImport(deps), added }
}

describe('importing a vault that holds a file the backend cannot take', () => {
  let notify: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    notify = vi.spyOn(notifications$, 'warning')
  })

  it('takes the rest of the vault', async () => {
    const wired = wire()

    const nodes = await wired.importer.importVault('/v')

    expect(nodes.map(n => n.title)).toEqual(['Good'])
    expect(wired.added.map(n => n.title)).toEqual(['Good'])
  })

  it('names the file it left behind', async () => {
    const wired = wire()

    await wired.importer.importVault('/v')

    expect(notify).toHaveBeenCalled()
    const said = notify.mock.calls.flat().join(' ')
    expect(said).toContain('Broken.md')
  })
})
