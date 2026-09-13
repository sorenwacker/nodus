/**
 * A selection tool acts on the run's capture, wherever it reads it from.
 *
 * The capture was handed to the tools adapter, which the selection tools do
 * not read: they take their targets from the context the canvas builds for
 * each call, and that context read the live selection. So a user who asked for
 * one node to be rewritten and then clicked another to look at it had the
 * second node rewritten (PRODUCT_DESIGN.md > What the agent acts on).
 */
import { describe, it, expect, vi } from 'vitest'
import { toolRegistry } from '../llm/registry'
import { registerCoreTools } from '../llm/tools'
import { buildAgentToolContext } from '../canvas/composables/agent/agentToolContext'

describe('the context a selection tool reads its targets from', () => {
  let liveSelection: string[] = ['a']

  function fakeStore() {
    return {
      get selectedNodeIds() {
        return liveSelection
      },
      filteredNodes: [],
      filteredEdges: [],
      filteredFrames: [],
      filteredStorylines: [],
      createNode: vi.fn(),
      createEdge: vi.fn(),
      deleteNode: vi.fn(),
      deleteEdge: vi.fn(),
      updateNodePosition: vi.fn(),
      updateNodeContent: vi.fn(),
      updateNodeTitle: vi.fn(),
      updateNodeTags: vi.fn(),
      updateEdgeLabel: vi.fn(),
      updateEdgeColor: vi.fn(),
      createFrame: vi.fn(),
      assignNodesToFrame: vi.fn(),
      createStoryline: vi.fn(),
      addNodeToStoryline: vi.fn(),
    } as never
  }

  function contextForRunOn(captured: string[] | null) {
    return buildAgentToolContext({
      store: fakeStore(),
      log: () => {},
      screenToCanvas: (x: number, y: number) => ({ x, y }),
      snapToGrid: (v: number) => v,
      getOllamaModel: () => 'test-model',
      getOllamaContextLength: () => 8192,
      pushContentUndo: undefined,
      pushContentsUndo: undefined,
      getRunSelection: () => captured,
      getEditingNodeId: () => null,
    })
  }

  it('carries the run capture, not the selection the user has now', async () => {
    registerCoreTools()
    liveSelection = ['a']
    const captured = [...liveSelection]

    // The user clicks another node while the model is still thinking. The
    // context is built when the tool runs, which is after the click.
    liveSelection = ['b']

    const result = await toolRegistry.execute(
      'update_selected_content',
      { content: 'rewritten' },
      contextForRunOn(captured)
    )

    expect(result).toContain('"nodeIds":["a"]')
  })

  it('falls back to the live selection when no run is in progress', async () => {
    registerCoreTools()
    liveSelection = ['b']

    const result = await toolRegistry.execute(
      'update_selected_content',
      { content: 'rewritten' },
      contextForRunOn(null)
    )

    expect(result).toContain('"nodeIds":["b"]')
  })
})
