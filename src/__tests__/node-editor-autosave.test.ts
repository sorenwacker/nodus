/**
 * Autosave writes to the node it was armed for.
 *
 * The pending timer resolved the editing node id when it fired rather than
 * when it was armed, so a save left over from one node could land in the next
 * node opened - one document's text written into another.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useNodeEditor } from '../canvas/composables/nodes/useNodeEditor'
import type { Node } from '../types'

function fakeStore(aBody = 'alpha', bBody = '') {
  const nodes = new Map<string, Node>([
    ['a', { id: 'a', title: 'A', markdown_content: aBody } as unknown as Node],
    ['b', { id: 'b', title: 'B', markdown_content: bBody } as unknown as Node],
  ])
  return {
    getNode: (id: string) => nodes.get(id),
    setBody: (id: string, body: string) => {
      const n = nodes.get(id)
      if (n) (n as unknown as { markdown_content: string }).markdown_content = body
    },
    updateNodeContent: vi.fn().mockResolvedValue(undefined),
    updateNodeTitle: vi.fn().mockResolvedValue(undefined),
  }
}

describe('content autosave', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('writes the pending edit to the node it was typed into', async () => {
    // The switch must not change editContent, or the watcher fires and
    // supersedes the pending timer. Two nodes whose bodies are identical is
    // the case that leaves the stale timer alive.
    const store = fakeStore('shared text', 'shared text')
    const editor = useNodeEditor({ store, autosaveDelay: 1000 })

    editor.startEditing('a')
    await vi.advanceTimersByTimeAsync(20)
    editor.editContent.value = 'typed into A'
    await vi.advanceTimersByTimeAsync(50)

    // Open B before the autosave fires; B's body equals what A now holds
    store.setBody('b', 'typed into A')
    editor.startEditing('b')
    await vi.advanceTimersByTimeAsync(3000)

    const crossWrites = store.updateNodeContent.mock.calls.filter(
      ([id, content]) => id === 'b' && String(content).includes('typed into A')
    )
    expect(crossWrites, "A's text must never be written into B").toEqual([])
  })

  it('does not leave a timer armed after an explicit save', async () => {
    const store = fakeStore()
    const editor = useNodeEditor({ store, autosaveDelay: 1000 })

    editor.startEditing('a')
    editor.editContent.value = 'one'
    editor.saveEditing()
    const afterSave = store.updateNodeContent.mock.calls.length

    await vi.advanceTimersByTimeAsync(2000)

    // The explicit save is the only write; no stale timer fires afterwards
    expect(store.updateNodeContent.mock.calls.length).toBe(afterSave)
  })

  it('still autosaves while the same node stays open', async () => {
    const store = fakeStore()
    const editor = useNodeEditor({ store, autosaveDelay: 1000 })

    editor.startEditing('a')
    editor.editContent.value = 'typing'
    await vi.advanceTimersByTimeAsync(1500)

    expect(store.updateNodeContent).toHaveBeenCalledWith('a', expect.stringContaining('typing'))
  })
})
