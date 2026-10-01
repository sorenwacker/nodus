/**
 * Renaming a node renames its vault file, and the node in memory follows the
 * file: the backend answers the title command with the file's new path, or
 * with null when nothing moved (features.md > Bi-directional Sync).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useNodesStore } from '../stores/nodes'

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
      command === 'update_node_title' ? Promise.resolve('/vault/New.md') : Promise.reject(new Error('Mock'))
    )

    await store.updateNodeTitle(node.id, 'New')

    expect(invokeMock).toHaveBeenCalledWith('update_node_title', { id: node.id, title: 'New' })
    expect(node.title).toBe('New')
    expect(node.file_path).toBe('/vault/New.md')
  })

  it('keeps the file path when the backend moved nothing', async () => {
    const { store, node } = await storeWithSyncedNode()
    invokeMock.mockImplementation((command: string) =>
      command === 'update_node_title' ? Promise.resolve(null) : Promise.reject(new Error('Mock'))
    )

    await store.updateNodeTitle(node.id, 'New')

    expect(node.file_path).toBe('/vault/Old.md')
  })
})
