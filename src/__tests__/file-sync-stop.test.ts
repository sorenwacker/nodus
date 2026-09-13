/**
 * Closing a vault ends its pending work
 * (PRODUCT_DESIGN.md > File Watcher Logic).
 *
 * A delete is held for half a second to see whether a create follows, which is
 * how a move is told from a deletion. Stopping the watcher left those timers
 * armed, so a node was removed from a vault nobody was watching any more, and
 * the marks for moves Nodus made itself were left behind for the next vault.
 * The move branch also wrote the new path without guarding the call, so a
 * refusal became an unhandled rejection and the node kept a path that no
 * longer existed.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const invoke = vi.fn()

vi.mock('../lib/tauri', () => ({
  invoke: (...args: unknown[]) => invoke(...args),
  listen: vi.fn(async () => () => {}),
  readTextFile: vi.fn(),
  readTextFileWithChecksum: vi.fn(async () => ({ content: '', checksum: 'c' })),
  createNodeFromFile: vi.fn(),
  syncNodeWikilinks: vi.fn(async () => 0),
  getWorkspace: vi.fn(async () => ({ sync_enabled: true })),
  isTauri: () => true,
}))

const error = vi.fn()
vi.mock('../composables/useNotifications', () => ({
  notifications$: { info: vi.fn(), error, success: vi.fn(), warning: vi.fn() },
}))

const FILE = '/vault/Note.md'

function node() {
  return { id: 'n1', title: 'Note', file_path: FILE, markdown_content: 'text', checksum: 'c' }
}

async function setup() {
  const { useFileSync } = await import('../composables/useFileSync')
  const removeNode = vi.fn()
  const updateNodeInPlace = vi.fn()
  const nodes = [node()]
  const sync = useFileSync({
    getNodes: () => nodes,
    updateNodeInPlace,
    addNode: vi.fn(),
    removeNode,
    getCurrentWorkspaceId: () => 'ws1',
    getEditingNodeId: () => null,
  } as never)
  return { sync, removeNode, updateNodeInPlace }
}

describe('stopping the watcher', () => {
  beforeEach(() => {
    invoke.mockReset()
    error.mockReset()
    invoke.mockResolvedValue(null)
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.clearAllTimers()
    vi.useRealTimers()
  })

  it('drops a deletion that was waiting to see whether it was a move', async () => {
    const { sync, removeNode } = await setup()
    await sync.handleFileChange({ change_type: 'Deleted', path: FILE } as never)

    await sync.stopWatching()
    await vi.advanceTimersByTimeAsync(2000)

    expect(removeNode).not.toHaveBeenCalled()
  })
})

describe('a file moved outside Nodus', () => {
  beforeEach(() => {
    invoke.mockReset()
    error.mockReset()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.clearAllTimers()
    vi.useRealTimers()
  })

  it('reports a path the backend refused to store', async () => {
    const { sync } = await setup()
    invoke.mockImplementation(async (command: string) => {
      if (command === 'update_node_file_path') throw new Error('outside the vault')
      return null
    })
    await sync.handleFileChange({ change_type: 'Deleted', path: FILE } as never)

    await expect(
      sync.handleFileChange({ change_type: 'Created', path: '/vault/sub/Note.md' } as never)
    ).resolves.toBeUndefined()

    expect(error).toHaveBeenCalled()
  })
})
