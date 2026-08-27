/**
 * A bulk rewrite is one undo step.
 *
 * Three batch tools rewrote node content with no undo entry at all, while
 * `update_node` beside them recorded one - so an agent rewriting 300 nodes left
 * nothing to undo. One entry per node would be as unusable: the user would
 * press undo 300 times. Colour and size already model this as a single entry
 * holding a map (PRODUCT_DESIGN.md > Recording an undo step).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

describe('bulk content undo', () => {
  const nodes = new Map<string, { id: string; title: string; markdown_content: string }>()
  let store: Record<string, ReturnType<typeof vi.fn>>

  beforeEach(() => {
    nodes.clear()
    nodes.set('a', { id: 'a', title: 'Alpha', markdown_content: 'first' })
    nodes.set('b', { id: 'b', title: 'Beta', markdown_content: 'second' })
    store = {
      getNode: vi.fn((id: string) => nodes.get(id)),
      updateNodeContent: vi.fn(async (id: string, content: string) => {
        const node = nodes.get(id)
        if (node) node.markdown_content = content
      }),
      updateNodeTitle: vi.fn(async (id: string, title: string) => {
        const node = nodes.get(id)
        if (node) node.title = title
      }),
      getNodes: vi.fn(() => [...nodes.values()]),
      getEdges: vi.fn(() => []),
      updateNodePosition: vi.fn(),
      deleteNode: vi.fn(),
      restoreNode: vi.fn(),
      restoreEdge: vi.fn(),
      updateNodeColor: vi.fn(),
      updateNodeSize: vi.fn(),
    }
  })

  it('restores every node the batch rewrote, in one step', async () => {
    const { useUndoRedo } = await import('../composables/useUndoRedo')
    const undoRedo = useUndoRedo({ store: store as never, showToast: vi.fn() } as never)

    // What a batch tool records before rewriting
    undoRedo.pushContentsUndo([
      { nodeId: 'a', content: 'first', title: 'Alpha' },
      { nodeId: 'b', content: 'second', title: 'Beta' },
    ])
    await (store.updateNodeContent as (id: string, c: string) => Promise<void>)('a', 'rewritten a')
    await (store.updateNodeContent as (id: string, c: string) => Promise<void>)('b', 'rewritten b')

    await undoRedo.undo()

    expect(nodes.get('a')!.markdown_content).toBe('first')
    expect(nodes.get('b')!.markdown_content).toBe('second')
  })

  it('is a single step, not one per node', async () => {
    const { useUndoRedo } = await import('../composables/useUndoRedo')
    const undoRedo = useUndoRedo({ store: store as never, showToast: vi.fn() } as never)

    undoRedo.pushContentsUndo([
      { nodeId: 'a', content: 'first', title: 'Alpha' },
      { nodeId: 'b', content: 'second', title: 'Beta' },
    ])

    expect(undoRedo.undoStack.value).toHaveLength(1)
  })

  it('redoes the rewrite', async () => {
    const { useUndoRedo } = await import('../composables/useUndoRedo')
    const undoRedo = useUndoRedo({ store: store as never, showToast: vi.fn() } as never)

    undoRedo.pushContentsUndo([{ nodeId: 'a', content: 'first', title: 'Alpha' }])
    await (store.updateNodeContent as (id: string, c: string) => Promise<void>)('a', 'rewritten')
    await undoRedo.undo()
    expect(nodes.get('a')!.markdown_content).toBe('first')

    await undoRedo.redo()

    expect(nodes.get('a')!.markdown_content).toBe('rewritten')
  })

  it('records nothing for an empty batch', async () => {
    const { useUndoRedo } = await import('../composables/useUndoRedo')
    const undoRedo = useUndoRedo({ store: store as never, showToast: vi.fn() } as never)

    undoRedo.pushContentsUndo([])

    expect(undoRedo.undoStack.value).toHaveLength(0)
  })
})
