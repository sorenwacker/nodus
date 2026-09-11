/**
 * A save that did not reach the vault is reported.
 *
 * The backend writes the file only when the node has one, it exists, and a
 * syncing workspace covers it; otherwise it updates the database alone and
 * returns no checksum. Read as an ordinary save, that let a node take edits
 * that never went near disk, and a write that threw was caught into a log line
 * while the node kept the new text in memory - so the edit looked saved
 * (PRODUCT_DESIGN.md > A save that does not reach the vault).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const invoke = vi.fn()
vi.mock('../lib/tauri', () => ({
  invoke: (...args: unknown[]) => invoke(...args),
  isTauri: () => true,
}))

const error = vi.fn()
vi.mock('../composables/useNotifications', () => ({
  notifications$: { error, info: vi.fn(), success: vi.fn(), warning: vi.fn() },
}))

vi.mock('../stores/nodes/wikilinkSync', () => ({ syncWikilinks: vi.fn(async () => {}) }))

const FILE = '/vault/Note.md'

function deps(options: { filePath: string | null; syncEnabled: boolean }) {
  const node = {
    id: 'n1',
    title: 'Note',
    file_path: options.filePath,
    markdown_content: 'before',
    checksum: 'old',
    updated_at: 1,
  }
  return {
    node,
    deps: {
      state: { nodes: { value: [node] } },
      edgesStore: { loadEdges: vi.fn() },
      workspaceStore: {
        currentWorkspaceId: 'ws1',
        currentWorkspace: { id: 'ws1', sync_enabled: options.syncEnabled, vault_path: '/vault' },
      },
    },
  }
}

describe('the flag the warning depends on', () => {
  it('survives the mapping from the database into the workspace store', async () => {
    // Read from the database and dropped here, nothing in the frontend could
    // tell a workspace that syncs from one that does not, and the warning above
    // could never fire (PRODUCT_DESIGN.md > A save that does not reach the vault)
    const source = readFileSync(resolve(process.cwd(), 'src/stores/workspaces.ts'), 'utf8')
    const mapping = source.slice(
      source.indexOf('function toWorkspace('),
      source.indexOf('export const useWorkspaceStore')
    )
    expect(mapping).toContain('sync_enabled')
    // Loading goes through that mapping rather than a copy of it
    expect(source).toContain('dbWorkspaces.map(toWorkspace)')
  })
})

describe('a save that did not reach the vault', () => {
  beforeEach(() => {
    invoke.mockReset()
    error.mockReset()
  })

  it('reports a file-backed node whose file the backend did not write', async () => {
    const { updateNodeContent } = await import('../stores/nodes/crud')
    const { node, deps: d } = deps({ filePath: FILE, syncEnabled: true })
    invoke.mockResolvedValue(null) // wrote the database, not the file

    await updateNodeContent(d as never, 'n1', 'after')

    expect(node.markdown_content).toBe('after')
    expect(error).toHaveBeenCalled()
    expect(String(error.mock.calls[0])).toContain('Note')
  })

  it('reports a write that failed outright', async () => {
    const { updateNodeContent } = await import('../stores/nodes/crud')
    const { deps: d } = deps({ filePath: FILE, syncEnabled: true })
    invoke.mockRejectedValue(new Error('permission denied'))

    await updateNodeContent(d as never, 'n1', 'after')

    expect(error).toHaveBeenCalled()
  })

  it('says nothing when the node has no file to write', async () => {
    const { updateNodeContent } = await import('../stores/nodes/crud')
    const { deps: d } = deps({ filePath: null, syncEnabled: true })
    invoke.mockResolvedValue(null)

    await updateNodeContent(d as never, 'n1', 'after')

    expect(error).not.toHaveBeenCalled()
  })

  it('says nothing when the workspace does not sync to a vault', async () => {
    const { updateNodeContent } = await import('../stores/nodes/crud')
    const { deps: d } = deps({ filePath: FILE, syncEnabled: false })
    invoke.mockResolvedValue(null)

    await updateNodeContent(d as never, 'n1', 'after')

    expect(error).not.toHaveBeenCalled()
  })

  it('says nothing when the file was written', async () => {
    const { updateNodeContent } = await import('../stores/nodes/crud')
    const { node, deps: d } = deps({ filePath: FILE, syncEnabled: true })
    invoke.mockResolvedValue('fresh-checksum')

    await updateNodeContent(d as never, 'n1', 'after')

    expect(node.checksum).toBe('fresh-checksum')
    expect(error).not.toHaveBeenCalled()
  })
})
