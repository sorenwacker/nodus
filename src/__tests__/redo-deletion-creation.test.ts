/**
 * Every action that can be undone can be redone.
 *
 * `undo` handled nine snapshot types and `redo` seven: `deletion` and
 * `creation` had no branch. Redo popped the snapshot and discarded it, so
 * undoing a delete and then redoing it did nothing and lost the snapshot
 * (PRODUCT_DESIGN.md > Redoing a delete or a create).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const SOURCE = join(__dirname, '../composables/useUndoRedo.ts')

describe('redo covers every undoable action', () => {
  it('handles the same snapshot types as undo', () => {
    const source = readFileSync(SOURCE, 'utf-8')

    // The two functions are long; compare the branches each one takes
    const undoBody = source.slice(source.indexOf('async function undo('), source.indexOf('async function redo('))
    const redoBody = source.slice(source.indexOf('async function redo('))

    const types = (body: string) =>
      new Set([...body.matchAll(/snapshot\.type === '([a-z-]+)'/g)].map(m => m[1]))

    const undoTypes = types(undoBody)
    const redoTypes = types(redoBody)
    const missing = [...undoTypes].filter(t => !redoTypes.has(t))

    expect(
      missing,
      `redo has no branch for ${missing.join(', ')}, so those snapshots are ` +
        `popped and discarded`
    ).toEqual([])
  })
})

describe('redoing a delete', () => {
  const deletedNode = { id: 'n1', title: 'Alpha' }
  let store: Record<string, ReturnType<typeof vi.fn>>

  beforeEach(() => {
    store = {
      deleteNode: vi.fn().mockResolvedValue(undefined),
      restoreNode: vi.fn().mockResolvedValue(undefined),
      restoreEdge: vi.fn(),
      createNode: vi.fn().mockResolvedValue(undefined),
      getNode: vi.fn(),
      updateNodePosition: vi.fn(),
      updateNodeContent: vi.fn(),
      updateNodeTitle: vi.fn(),
      updateNodeColor: vi.fn(),
      updateNodeSize: vi.fn(),
      getNodes: vi.fn(() => []),
      getEdges: vi.fn(() => []),
    }
  })

  it('deletes the node again, and leaves it undoable', async () => {
    const { useUndoRedo } = await import('../composables/useUndoRedo')
    const undoRedo = useUndoRedo({
      store: store as never,
      showToast: vi.fn(),
    } as never)

    undoRedo.pushDeletionUndo(deletedNode as never, [])
    await undoRedo.undo()
    expect(store.restoreNode).toHaveBeenCalledWith(deletedNode)

    await undoRedo.redo()

    expect(store.deleteNode).toHaveBeenCalledWith('n1')
    // Redoing must leave the action on the undo stack, or it cannot be undone
    expect(undoRedo.undoStack.value.length).toBeGreaterThan(0)
  })
})
