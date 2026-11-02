/**
 * Renaming a node renames its vault file, and the node in memory follows the
 * file: the backend answers the title command with the file's new path, or
 * with null when nothing moved (features.md > Bi-directional Sync).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useNodesStore } from '../stores/nodes'
import { setUndoSink } from '../stores/nodes/undoRecorder'

const invokeMock = vi.fn()
vi.mock('@tauri-apps/api/core', () => ({ invoke: (...a: unknown[]) => invokeMock(...a) }))
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn().mockResolvedValue(() => {}) }))

async function storeWithSyncedNode() {
  invokeMock.mockRejectedValue(new Error('Mock: No backend'))
  const store = useNodesStore()
  await store.initialize()
  const node = store.nodes[0]
  node.file_path = '/vault/Old.md'
  return { store, node }
}

describe('renaming a node with a vault file', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    invokeMock.mockReset()
  })

  it('takes over the renamed file path the backend returns', async () => {
    const { store, node } = await storeWithSyncedNode()
    invokeMock.mockImplementation((command: string) =>
      command === 'update_node_title' ? Promise.resolve({ filePath: '/vault/New.md', relinked: [] }) : Promise.reject(new Error('Mock'))
    )

    await store.updateNodeTitle(node.id, 'New')

    expect(invokeMock).toHaveBeenCalledWith('update_node_title', { id: node.id, title: 'New' })
    expect(node.title).toBe('New')
    expect(node.file_path).toBe('/vault/New.md')
  })

  it('keeps the file path when the backend moved nothing', async () => {
    const { store, node } = await storeWithSyncedNode()
    invokeMock.mockImplementation((command: string) =>
      command === 'update_node_title' ? Promise.resolve({ filePath: null, relinked: [] }) : Promise.reject(new Error('Mock'))
    )

    await store.updateNodeTitle(node.id, 'New')

    expect(node.file_path).toBe('/vault/Old.md')
  })
})

/**
 * A rename rewrites the links to the node in the notes that link to it, and
 * one undo step covers the title and every rewritten note
 * (features.md > Wikilink Edges).
 */
describe('renaming a node that other notes link to', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    invokeMock.mockReset()
  })

  async function renameWithLinker() {
    const { store, node } = await storeWithSyncedNode()
    const linker = store.nodes.find(n => n.id !== node.id)!
    linker.markdown_content = 'see [[Old]]'
    node.title = 'Old'
    node.markdown_content = 'body'
    invokeMock.mockImplementation((command: string) =>
      command === 'update_node_title'
        ? Promise.resolve({ filePath: null, relinked: [{ id: linker.id, content: 'see [[New]]' }] })
        : Promise.reject(new Error('Mock'))
    )
    return { store, node, linker }
  }

  it('shows the rewritten links in the linking notes', async () => {
    const { store, node, linker } = await renameWithLinker()
    await store.updateNodeTitle(node.id, 'New')
    expect(linker.markdown_content).toBe('see [[New]]')
  })

  it('records the title and the rewritten notes as one undo step', async () => {
    const { store, node, linker } = await renameWithLinker()
    const pushContentsUndo = vi.fn()
    setUndoSink({ pushContentsUndo })
    await store.updateNodeTitle(node.id, 'New')
    setUndoSink(null)
    expect(pushContentsUndo).toHaveBeenCalledTimes(1)
    expect(pushContentsUndo.mock.calls[0][0]).toEqual([
      { nodeId: node.id, content: 'body', title: 'Old' },
      { nodeId: linker.id, content: 'see [[Old]]', title: linker.title },
    ])
  })

  it('records nothing while an undo step is being replayed', async () => {
    const { store, node } = await renameWithLinker()
    const pushContentsUndo = vi.fn()
    setUndoSink({ pushContentsUndo })
    await store.updateNodeTitle(node.id, 'New', { skipUndo: true })
    setUndoSink(null)
    expect(pushContentsUndo).not.toHaveBeenCalled()
  })
})
