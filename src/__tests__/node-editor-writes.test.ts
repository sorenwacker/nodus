/**
 * The node editor writes only what the user changed, and only while it holds
 * the node (PRODUCT_DESIGN.md > File Locking Workflow).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useNodeEditor } from '../canvas/composables/nodes/useNodeEditor'
import type { Node } from '../types'

function setup(beginEdit?: (id: string) => Promise<boolean>) {
  const nodes = new Map<string, Node>([
    ['a', { id: 'a', title: 'Old title', markdown_content: 'body' } as unknown as Node],
  ])
  const titleAtCall: string[] = []
  const store = {
    getNode: (id: string) => nodes.get(id),
    updateNodeContent: vi.fn().mockResolvedValue(undefined),
    updateNodeTitle: vi.fn(async (id: string) => {
      titleAtCall.push(nodes.get(id)!.title)
    }),
    beginEdit,
    endEdit: vi.fn().mockResolvedValue(undefined),
  }
  const editor = useNodeEditor({ store, autosaveDelay: 1000 })
  return { editor, store, titleAtCall }
}

describe('node editor writes', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => {
    vi.clearAllTimers()
    vi.useRealTimers()
  })

  it('does not write the file when the editor is only opened', async () => {
    const { editor, store } = setup(() => Promise.resolve(true))
    editor.startEditing('a')
    await vi.advanceTimersByTimeAsync(3000)
    expect(store.updateNodeContent).not.toHaveBeenCalled()
  })

  it('does not write the file when its lock is refused, even if the user typed first', async () => {
    const refusedLater = () => new Promise<boolean>(r => setTimeout(() => r(false), 500))
    const { editor, store } = setup(refusedLater)
    editor.startEditing('a')
    await vi.advanceTimersByTimeAsync(100)
    editor.editContent.value = 'typed before the answer'
    await vi.advanceTimersByTimeAsync(3000)
    expect(editor.editingNodeId.value).toBeNull()
    expect(store.updateNodeContent).not.toHaveBeenCalled()
  })

  it('does not write the title when the title editor is only opened', async () => {
    const { editor, store } = setup()
    editor.startEditingTitle('a')
    await vi.advanceTimersByTimeAsync(3000)
    expect(store.updateNodeTitle).not.toHaveBeenCalled()
  })

  it('leaves the node title to the store, so the store sees the change and records an undo step', async () => {
    const { editor, store, titleAtCall } = setup()
    editor.startEditingTitle('a')
    await vi.advanceTimersByTimeAsync(20)
    editor.editTitle.value = 'New title'
    editor.saveTitleEditing()
    await vi.advanceTimersByTimeAsync(3000)
    expect(store.updateNodeTitle).toHaveBeenCalledTimes(1)
    expect(store.updateNodeTitle).toHaveBeenCalledWith('a', 'New title')
    expect(titleAtCall).toEqual(['Old title'])
  })

  it('writes nothing when a title edit is cancelled within the autosave delay', async () => {
    const { editor, store } = setup()
    editor.startEditingTitle('a')
    await vi.advanceTimersByTimeAsync(20)
    editor.editTitle.value = 'Typed then cancelled'
    await vi.advanceTimersByTimeAsync(100)
    editor.cancelTitleEditing()
    await vi.advanceTimersByTimeAsync(3000)
    expect(store.updateNodeTitle).not.toHaveBeenCalled()
  })

  it('never writes a blank title', async () => {
    const { editor, store } = setup()
    editor.startEditingTitle('a')
    await vi.advanceTimersByTimeAsync(20)
    editor.editTitle.value = '   '
    await vi.advanceTimersByTimeAsync(100)
    editor.saveTitleEditing()
    await vi.advanceTimersByTimeAsync(3000)
    expect(store.updateNodeTitle).not.toHaveBeenCalled()
  })
})

describe('node editor writes after an autosave', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => {
    vi.clearAllTimers()
    vi.useRealTimers()
  })

  it('saves a revert to the opened text once an edit has been autosaved', async () => {
    const { editor, store } = setup(() => Promise.resolve(true))
    editor.startEditing('a')
    await vi.advanceTimersByTimeAsync(20)
    editor.editContent.value = 'changed'
    await vi.advanceTimersByTimeAsync(1500)
    editor.editContent.value = 'body'
    await vi.advanceTimersByTimeAsync(1500)
    expect(store.updateNodeContent.mock.calls.map(c => c[1])).toEqual(['changed', 'body'])
  })
})
