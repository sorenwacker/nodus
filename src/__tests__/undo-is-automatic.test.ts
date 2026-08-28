/**
 * Undo is recorded by the store, not by whoever remembered to ask.
 *
 * Recording used to be opt-in at each call site. Writers kept forgetting - the
 * batch tools, the inline date editor, the agent's own writes - and every
 * omission was found only when a user pressed undo and nothing happened. That
 * is an architectural flaw, not a series of bugs
 * (PRODUCT_DESIGN.md > Recording an undo step).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  setUndoSink,
  recordContentBefore,
  asOneUndoStep,
  resetUndoRecorder,
} from '../stores/nodes/undoRecorder'

const invoke = vi.fn()
vi.mock('../lib/tauri', () => ({ invoke: (...a: unknown[]) => invoke(...a), isTauri: () => true }))
vi.mock('@tauri-apps/api/core', () => ({ invoke: (...a: unknown[]) => invoke(...a) }))

describe('the undo recorder', () => {
  let pushContentsUndo: ReturnType<typeof vi.fn>

  beforeEach(() => {
    setActivePinia(createPinia())
    resetUndoRecorder()
    pushContentsUndo = vi.fn()
    setUndoSink({ pushContentsUndo: pushContentsUndo as never })
    invoke.mockReset()
    invoke.mockResolvedValue(null)
  })

  it('records a single write as one step', () => {
    recordContentBefore({ nodeId: 'a', content: 'before', title: 'Alpha' })

    expect(pushContentsUndo).toHaveBeenCalledWith([
      { nodeId: 'a', content: 'before', title: 'Alpha' },
    ])
  })

  it('records a group of writes as one step', async () => {
    await asOneUndoStep(async () => {
      recordContentBefore({ nodeId: 'a', content: 'a0', title: 'A' })
      recordContentBefore({ nodeId: 'b', content: 'b0', title: 'B' })
      recordContentBefore({ nodeId: 'c', content: 'c0', title: 'C' })
    })

    expect(pushContentsUndo).toHaveBeenCalledOnce()
    expect(pushContentsUndo.mock.calls[0][0]).toHaveLength(3)
  })

  it('keeps a node original state when it is written twice in one group', async () => {
    // Undo must return to where the group started, not to an intermediate value
    await asOneUndoStep(async () => {
      recordContentBefore({ nodeId: 'a', content: 'original', title: 'A' })
      recordContentBefore({ nodeId: 'a', content: 'intermediate', title: 'A' })
    })

    expect(pushContentsUndo.mock.calls[0][0]).toEqual([
      { nodeId: 'a', content: 'original', title: 'A' },
    ])
  })

  it('joins a nested group to the outer one', async () => {
    await asOneUndoStep(async () => {
      recordContentBefore({ nodeId: 'a', content: 'a0', title: 'A' })
      await asOneUndoStep(async () => {
        recordContentBefore({ nodeId: 'b', content: 'b0', title: 'B' })
      })
    })

    expect(pushContentsUndo).toHaveBeenCalledOnce()
    expect(pushContentsUndo.mock.calls[0][0]).toHaveLength(2)
  })

  it('records nothing for a group that wrote nothing', async () => {
    await asOneUndoStep(async () => {})

    expect(pushContentsUndo).not.toHaveBeenCalled()
  })
})

describe('the store records without being asked', () => {
  let pushContentsUndo: ReturnType<typeof vi.fn>

  beforeEach(() => {
    setActivePinia(createPinia())
    resetUndoRecorder()
    pushContentsUndo = vi.fn()
    setUndoSink({ pushContentsUndo: pushContentsUndo as never })
    invoke.mockReset()
    invoke.mockResolvedValue(null)
  })

  it('records the previous content when a node is written', async () => {
    const { useNodesStore } = await import('../stores/nodes')
    const store = useNodesStore()
    store.nodes.push({
      id: 'a',
      title: 'Alpha',
      markdown_content: 'before',
      node_type: 'note',
      canvas_x: 0,
      canvas_y: 0,
      created_at: 0,
      updated_at: 0,
    } as never)

    await store.updateNodeContent('a', 'after')

    expect(pushContentsUndo).toHaveBeenCalledWith([
      { nodeId: 'a', content: 'before', title: 'Alpha' },
    ])
  })

  it('does not record while undo itself is replaying', async () => {
    // Replaying a step must not push a new step, or undo could never finish
    const { useNodesStore } = await import('../stores/nodes')
    const store = useNodesStore()
    store.nodes.push({
      id: 'a',
      title: 'Alpha',
      markdown_content: 'before',
      node_type: 'note',
      canvas_x: 0,
      canvas_y: 0,
      created_at: 0,
      updated_at: 0,
    } as never)

    await store.updateNodeContent('a', 'after', { skipUndo: true })

    expect(pushContentsUndo).not.toHaveBeenCalled()
  })
})

describe('the recorder is connected', () => {
  // An unconnected recorder makes every content change unundoable, silently.
  // The connection lives inside provideUndoHandlers so that wiring the handlers
  // and wiring the recorder cannot be done by halves.
  it('is connected by the same call that provides the handlers', async () => {
    resetUndoRecorder()
    setUndoSink(null)

    const { provideUndoHandlers } = await import('../composables/provideUndoHandlers')
    const pushContentsUndo = vi.fn()
    provideUndoHandlers(() => {}, { pushContentsUndo })

    recordContentBefore({ nodeId: 'a', content: 'before', title: 'Alpha' })

    expect(pushContentsUndo).toHaveBeenCalledOnce()
  })

  it('records nothing rather than crashing when there is no stack', () => {
    resetUndoRecorder()
    setUndoSink(null)

    expect(() =>
      recordContentBefore({ nodeId: 'a', content: 'before', title: 'Alpha' })
    ).not.toThrow()
  })
})

describe('a tool call is one undo step', () => {
  // A tool author does nothing to make their tool undoable. Grouping at the
  // points where tools execute means neither "no undo at all" nor "one entry
  // per node" is reachable (PRODUCT_DESIGN.md > Recording an undo step).
  //
  // The handler map is module-private, so a probe cannot be registered into it.
  // What is asserted is the property: both executors wrap their call.
  it.each([
    ['src/llm/tools/handlers/index.ts', 'executeRegisteredTool'],
    ['src/canvas/composables/agent/useLLMTools.ts', 'executeLLMTool'],
  ])('%s wraps tool execution in a group', (file, fn) => {
    const source = readFileSync(resolve(__dirname, '../..', file), 'utf-8')

    expect(source, `${fn} must group its writes`).toContain('asOneUndoStep')
    // The call must be around the handler, not merely imported
    expect(source).toMatch(/asOneUndoStep\(\(\) =>/)
  })
})
