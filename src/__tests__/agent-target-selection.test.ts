/**
 * The agent acts on what was selected when you asked, not when it got there.
 *
 * Selection-aware tools read the live selection at the moment the tool runs. A
 * run started with node A selected, and the user clicking node B while the
 * model was still thinking, wrote A's new text into B - overwriting a node the
 * user never asked to change (PRODUCT_DESIGN.md > What the agent acts on).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref } from 'vue'

describe('the target of an agent run', () => {
  let liveSelection: string[]

  beforeEach(() => {
    liveSelection = ['a']
  })

  function fakeStore() {
    return {
      get selectedNodeIds() {
        return liveSelection
      },
      get filteredNodes() {
        return []
      },
      get filteredEdges() {
        return []
      },
      filteredFrames: [],
      filteredStorylines: [],
      currentWorkspaceId: null,
      createNode: vi.fn(),
      deleteNode: vi.fn(),
      deleteEdge: vi.fn(),
      updateNodeContent: vi.fn(),
      updateNodeTitle: vi.fn(),
      updateNodePosition: vi.fn(),
      updateNodeColor: vi.fn(),
      updateEdgeColor: vi.fn(),
      updateEdgeLabel: vi.fn(),
      createEdge: vi.fn(),
      createFrame: vi.fn(),
      assignNodesToFrame: vi.fn(),
      createStoryline: vi.fn(),
      addNodeToStoryline: vi.fn(),
    } as never
  }

  it('is fixed for the duration of the run', async () => {
    const { agentToolStoreAdapter } = await import(
      '../canvas/composables/agent/agentToolStoreAdapter'
    )
    const runSelection = ref<string[] | null>(null)
    const adapter = agentToolStoreAdapter(fakeStore(), () => runSelection.value)

    // The run begins with A selected
    runSelection.value = [...liveSelection]
    expect(adapter.selectedNodeIds).toEqual(['a'])

    // The user clicks B while the model is still working
    liveSelection = ['b']

    expect(
      adapter.selectedNodeIds,
      'the run must still target what was selected when it started'
    ).toEqual(['a'])
  })

  it('follows the live selection when no run is in progress', async () => {
    const { agentToolStoreAdapter } = await import(
      '../canvas/composables/agent/agentToolStoreAdapter'
    )
    const runSelection = ref<string[] | null>(null)
    const adapter = agentToolStoreAdapter(fakeStore(), () => runSelection.value)

    liveSelection = ['b']

    expect(adapter.selectedNodeIds).toEqual(['b'])
  })

  it('captures at the start and releases when the run truly ends', async () => {
    // A capture never released would make a later run target a stale set; one
    // released too early would expose the resumed half of an approved plan.
    const { useAgentPrompt } = await import('../canvas/composables/agent/useAgentPrompt')
    const prompt = ref('do the thing')
    const isLoading = ref(false)
    let status = 'done'

    const { sendPrompt, runSelection } = useAgentPrompt({
      prompt,
      isLoading,
      getSelectedNodeIds: () => ['a'],
      savePromptToHistory: vi.fn(),
      run: async () => ({ status }),
      reportError: vi.fn(),
    })

    await sendPrompt()
    expect(runSelection.value, 'a finished run releases its capture').toBeNull()

    // A run paused for approval is not finished
    status = 'paused'
    prompt.value = 'do the thing'
    await sendPrompt()
    expect(runSelection.value, 'a paused run keeps its capture').toEqual(['a'])
  })

  it('does not start a second run while one is in flight', async () => {
    const { useAgentPrompt } = await import('../canvas/composables/agent/useAgentPrompt')
    const run = vi.fn(async () => ({ status: 'done' }))
    const { sendPrompt } = useAgentPrompt({
      prompt: ref('something'),
      isLoading: ref(true),
      getSelectedNodeIds: () => [],
      savePromptToHistory: vi.fn(),
      run,
      reportError: vi.fn(),
    })

    await sendPrompt()

    expect(run).not.toHaveBeenCalled()
  })
})
