/**
 * Editing a node on the canvas takes its file lock
 * (PRODUCT_DESIGN.md > File Locking Workflow).
 *
 * The lock composable was reachable from nowhere: the canvas editor opened
 * without taking a lock, so a note open in another application could be
 * forked silently, and the "edited in another application" notice the
 * composable implements could never appear. The reader took locks through its
 * own calls to the backend instead of the same composable.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { useNodeEditor } from '../canvas/composables/nodes/useNodeEditor'
import type { Node } from '../types'

function node(id: string): Node {
  return { id, title: id, markdown_content: 'body', file_path: `/v/${id}.md` } as Node
}

function editorWithLock(lockGranted: boolean) {
  const beginEdit = vi.fn().mockResolvedValue(lockGranted)
  const endEdit = vi.fn().mockResolvedValue(undefined)
  const editor = useNodeEditor({
    store: {
      getNode: (id: string) => node(id),
      updateNodeContent: vi.fn().mockResolvedValue(undefined),
      updateNodeTitle: vi.fn().mockResolvedValue(undefined),
      setEditingNode: vi.fn(),
      beginEdit,
      endEdit,
    } as never,
  })
  return { editor, beginEdit, endEdit }
}

describe('editing a node on the canvas', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.clearAllTimers()
    vi.useRealTimers()
  })

  it('takes the node\'s file lock', async () => {
    const { editor, beginEdit } = editorWithLock(true)

    editor.startEditing('n1')
    await vi.runAllTimersAsync()

    expect(beginEdit).toHaveBeenCalledWith('n1')
    expect(editor.editingNodeId.value).toBe('n1')
  })

  it('releases the lock when the edit ends', async () => {
    const { editor, endEdit } = editorWithLock(true)
    editor.startEditing('n1')
    await vi.runAllTimersAsync()

    editor.saveEditing()
    await vi.runAllTimersAsync()

    expect(endEdit).toHaveBeenCalledWith('n1')
  })

  it('does not leave the editor open on a file another application holds', async () => {
    const { editor } = editorWithLock(false)

    editor.startEditing('n1')
    await vi.runAllTimersAsync()

    expect(editor.editingNodeId.value).toBeNull()
  })
})

describe('the reader', () => {
  const source = readFileSync(resolve(process.cwd(), 'src/components/StorylineReader.vue'), 'utf8')

  it('locks through the same composable as the canvas, not its own calls', () => {
    expect(source).not.toContain('acquireEditLock')
    expect(source).not.toContain('releaseEditLock')
  })
})
