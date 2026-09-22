/**
 * A selection tool acts on the run's capture.
 *
 * The context is built when the tool runs, which is after any click the user
 * made while the model was thinking. It must carry the selection the run
 * started with, or a user who asked for one node to be rewritten and then
 * clicked another to look at it has the second node rewritten
 * (PRODUCT_DESIGN.md > What the agent acts on).
 */
import { describe, it, expect, vi } from 'vitest'
import { toolRegistry } from '../llm/registry'
import { registerCoreTools } from '../llm/tools'
import { buildAgentToolContext } from '../canvas/composables/agent/agentToolContext'
import { fakeAgentToolContextDeps, fakeNodesStore } from './fixtures/agentToolContextDeps'

registerCoreTools()

describe('the context a selection tool reads its targets from', () => {
  let liveSelection: string[] = ['a']

  function contextForRunOn(captured: string[] | null) {
    const updateNodeContent = vi.fn()
    const ctx = buildAgentToolContext(
      fakeAgentToolContextDeps({
        store: fakeNodesStore({
          get selectedNodeIds() {
            return liveSelection
          },
          updateNodeContent,
        }),
        getRunSelection: () => captured,
      })
    )
    return { ctx, updateNodeContent }
  }

  it('carries the run capture, not the selection the user has now', async () => {
    liveSelection = ['a']
    const captured = [...liveSelection]

    // The user clicks another node while the model is still thinking
    liveSelection = ['b']

    const { ctx, updateNodeContent } = contextForRunOn(captured)
    await toolRegistry.execute('update_selected_content', { content: 'rewritten' }, ctx)

    expect(updateNodeContent).toHaveBeenCalledWith('a', 'rewritten')
    expect(updateNodeContent).not.toHaveBeenCalledWith('b', expect.anything())
  })

  it('falls back to the live selection when no run is in progress', async () => {
    liveSelection = ['b']

    const { ctx, updateNodeContent } = contextForRunOn(null)
    await toolRegistry.execute('update_selected_content', { content: 'rewritten' }, ctx)

    expect(updateNodeContent).toHaveBeenCalledWith('b', 'rewritten')
  })
})
