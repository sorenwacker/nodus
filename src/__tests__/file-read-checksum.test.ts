/**
 * The checksum stored against a node describes the content that node holds.
 *
 * The handler read the file itself and stored the checksum the watcher event
 * carried. Those are two different moments: a write landing between them stored
 * a checksum for content the node does not hold, and the node then looked
 * reconciled while it was not - the next event for that file matched the stored
 * checksum and did nothing
 * (PRODUCT_DESIGN.md > Reading a file and its checksum together).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const invoke = vi.fn()
const readTextFileWithChecksum = vi.fn()

vi.mock('../lib/tauri', () => ({
  invoke: (...args: unknown[]) => invoke(...args),
  listen: vi.fn(),
  readTextFile: vi.fn(),
  readTextFileWithChecksum: (...args: unknown[]) => readTextFileWithChecksum(...args),
  createNodeFromFile: vi.fn(),
  syncNodeWikilinks: vi.fn(async () => 0),
  getWorkspace: vi.fn(async () => ({ sync_enabled: true })),
  isTauri: () => true,
}))

vi.mock('../composables/useNotifications', () => ({
  notifications$: { info: vi.fn(), error: vi.fn(), success: vi.fn(), warning: vi.fn() },
}))

const FILE = '/vault/Note.md'

async function setup() {
  const { useFileSync } = await import('../composables/useFileSync')
  const updateNodeInPlace = vi.fn()
  const nodes = [
    { id: 'n1', title: 'Note', file_path: FILE, markdown_content: 'stale', checksum: 'old' },
  ]
  const sync = useFileSync({
    getNodes: () => nodes,
    updateNodeInPlace,
    addNode: vi.fn(),
    removeNode: vi.fn(),
    getCurrentWorkspaceId: () => 'ws1',
    getEditingNodeId: () => null,
  } as never)
  return { sync, updateNodeInPlace }
}

describe('applying an external change', () => {
  beforeEach(() => {
    invoke.mockReset()
    readTextFileWithChecksum.mockReset()
    invoke.mockResolvedValue(null)
  })

  it('stores the checksum of the content it read, not the one the event carried', async () => {
    const { sync, updateNodeInPlace } = await setup()
    // The file moved on between the event and the read: what is on disk now is
    // this content, and this is its checksum
    readTextFileWithChecksum.mockResolvedValue({ content: 'newest text', checksum: 'newest' })

    await sync.handleFileChange({
      change_type: 'Modified',
      path: FILE,
      new_checksum: 'announced',
    } as never)

    expect(updateNodeInPlace).toHaveBeenCalledWith(
      'n1',
      expect.objectContaining({ markdown_content: 'newest text', checksum: 'newest' })
    )
    const stored = updateNodeInPlace.mock.calls[0][1]
    expect(stored.checksum).not.toBe('announced')
  })

  it('writes that same checksum to the database beside the content', async () => {
    const { sync } = await setup()
    readTextFileWithChecksum.mockResolvedValue({ content: 'newest text', checksum: 'newest' })

    await sync.handleFileChange({
      change_type: 'Modified',
      path: FILE,
      new_checksum: 'announced',
    } as never)

    expect(invoke).toHaveBeenCalledWith('update_node_content_from_file', {
      id: 'n1',
      content: 'newest text',
      checksum: 'newest',
    })
  })

  it('reads once, so content and checksum cannot describe different moments', async () => {
    const { sync } = await setup()
    readTextFileWithChecksum.mockResolvedValue({ content: 'text', checksum: 'sum' })

    await sync.handleFileChange({
      change_type: 'Modified',
      path: FILE,
      new_checksum: 'announced',
    } as never)

    expect(readTextFileWithChecksum).toHaveBeenCalledTimes(1)
  })
})
