/**
 * Restoring an earlier version is an ordinary write through the store: content
 * and title come back together, and the step is one undo entry holding the
 * state the restore replaced (PRODUCT_DESIGN.md > Node history).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useNodesStore } from '../stores/nodes'
import { setUndoSink, resetUndoRecorder } from '../stores/nodes/undoRecorder'
import type { Node, NodeVersion } from '../types'

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }))
vi.mock('@tauri-apps/api/core', () => ({ invoke: invokeMock }))
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn().mockResolvedValue(() => {}) }))

function makeNode(id: string, extra: Partial<Node> = {}): Node {
  return {
    id, title: id, file_path: null, markdown_content: '', node_type: 'note',
    canvas_x: 0, canvas_y: 0, width: 200, height: 120, z_index: 0, color_theme: null,
    is_collapsed: false, tags: null, workspace_id: null, checksum: null,
    created_at: 0, updated_at: 0, deleted_at: null, ...extra,
  } as Node
}

const version: NodeVersion = {
  id: 7, node_id: 'a', title: 'Old title', markdown_content: 'old text', source: 'app', saved_at: 1_700_000_000,
}

describe('restoring an earlier version', () => {
  const pushContentsUndo = vi.fn()

  beforeEach(() => {
    setActivePinia(createPinia())
    invokeMock.mockReset()
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === 'update_node_title') return { filePath: null, relinked: [] }
      return undefined
    })
    pushContentsUndo.mockReset()
    resetUndoRecorder()
    setUndoSink({ pushContentsUndo })
  })

  it('writes the version\'s content and title back to the node', async () => {
    const store = useNodesStore()
    store.nodes.push(makeNode('a', { title: 'New title', markdown_content: 'new text' }))

    await store.restoreNodeVersion(version)

    const node = store.getNode('a')!
    expect([node.title, node.markdown_content]).toEqual(['Old title', 'old text'])
    // A restore names itself, so the backend keeps the state it replaces
    expect(invokeMock).toHaveBeenCalledWith('update_node_content', { id: 'a', content: 'old text', source: 'restore' })
    expect(invokeMock).toHaveBeenCalledWith('update_node_title', { id: 'a', title: 'Old title', source: 'restore' })
  })

  it('is one undo step that returns to the state the restore replaced', async () => {
    const store = useNodesStore()
    store.nodes.push(makeNode('a', { title: 'New title', markdown_content: 'new text' }))

    await store.restoreNodeVersion(version)

    expect(pushContentsUndo).toHaveBeenCalledTimes(1)
    expect(pushContentsUndo).toHaveBeenCalledWith([{ nodeId: 'a', content: 'new text', title: 'New title' }])
  })

  it('reads the versions from the backend, newest first as the backend orders them', async () => {
    const store = useNodesStore()
    Object.defineProperty(window, '__TAURI__', { value: {}, configurable: true })
    invokeMock.mockResolvedValueOnce([version])
    try {
      expect(await store.getNodeHistory('a')).toEqual([version])
      expect(invokeMock).toHaveBeenCalledWith('get_node_history', { id: 'a' })
    } finally {
      delete (window as unknown as Record<string, unknown>).__TAURI__
    }
  })
})
