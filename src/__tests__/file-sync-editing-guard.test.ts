/**
 * An external change never overwrites the node the user is editing.
 *
 * The `Modified` handler read the file and pushed it into the store and the
 * database unconditionally, so a stale file - one the database had already
 * moved past - replaced newer text with older. That is how a save appears to
 * come back old
 * (PRODUCT_DESIGN.md > Reconciling a file with the node open in the editor).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const invoke = vi.fn()
const readFile = vi.fn()

vi.mock('../lib/tauri', () => ({
  invoke: (...args: unknown[]) => invoke(...args),
  listen: vi.fn(),
  readTextFile: vi.fn(),
  readTextFileWithChecksum: (...args: unknown[]) => readFile(...args),
  createNodeFromFile: vi.fn(),
  syncNodeWikilinks: vi.fn(async () => 0),
  getWorkspace: vi.fn(async () => ({ sync_enabled: true })),
  isTauri: () => true,
}))

const info = vi.fn()
vi.mock('../composables/useNotifications', () => ({
  notifications$: { info, error: vi.fn(), success: vi.fn(), warning: vi.fn() },
}))

const FILE = '/vault/Note.md'

function node() {
  return {
    id: 'n1',
    title: 'Note',
    file_path: FILE,
    markdown_content: 'the text the user is typing',
    checksum: 'old',
  }
}

async function setup(editingNodeId: string | null) {
  const { useFileSync } = await import('../composables/useFileSync')
  const updateNodeInPlace = vi.fn()
  const nodes = [node()]
  const sync = useFileSync({
    getNodes: () => nodes,
    updateNodeInPlace,
    addNode: vi.fn(),
    removeNode: vi.fn(),
    getCurrentWorkspaceId: () => 'ws1',
    getEditingNodeId: () => editingNodeId,
  } as never)
  return { sync, updateNodeInPlace }
}

describe('an external change while a node is open in the editor', () => {
  beforeEach(() => {
    invoke.mockReset()
    readFile.mockReset()
    info.mockReset()
    readFile.mockResolvedValue({ content: 'the older text still on disk', checksum: 'new' })
    invoke.mockResolvedValue(null)
  })

  it('leaves the node alone and reports it', async () => {
    const { sync, updateNodeInPlace } = await setup('n1')

    await sync.handleFileChange({ change_type: 'Modified', path: FILE, new_checksum: 'new' } as never)

    expect(updateNodeInPlace).not.toHaveBeenCalled()
    expect(readFile).not.toHaveBeenCalled()
    expect(invoke).not.toHaveBeenCalledWith('update_node_content_from_file', expect.anything())
    expect(info).toHaveBeenCalled()
  })

  it('keeps the checksum, so the difference is not forgotten', async () => {
    const { sync, updateNodeInPlace } = await setup('n1')

    await sync.handleFileChange({ change_type: 'Modified', path: FILE, new_checksum: 'new' } as never)

    // Recording the new checksum would make the node look reconciled and the
    // next event would see nothing to do
    expect(updateNodeInPlace).not.toHaveBeenCalledWith('n1', expect.objectContaining({ checksum: 'new' }))
  })

  it('still applies the change when a different node is being edited', async () => {
    const { sync, updateNodeInPlace } = await setup('n2')

    await sync.handleFileChange({ change_type: 'Modified', path: FILE, new_checksum: 'new' } as never)

    expect(updateNodeInPlace).toHaveBeenCalledWith(
      'n1',
      expect.objectContaining({ markdown_content: 'the older text still on disk' })
    )
  })

  it('still applies the change when nothing is being edited', async () => {
    const { sync, updateNodeInPlace } = await setup(null)

    await sync.handleFileChange({ change_type: 'Modified', path: FILE, new_checksum: 'new' } as never)

    expect(updateNodeInPlace).toHaveBeenCalledWith(
      'n1',
      expect.objectContaining({ markdown_content: 'the older text still on disk' })
    )
  })
})
