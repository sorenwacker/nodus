/**
 * What the agent's tools read is read when the tool runs.
 *
 * A value copied at composition freezes at that moment. The workspace
 * identifier was copied, and after the user switched workspace the memory
 * tools went on writing to the workspace that was open when the canvas was
 * composed (PRODUCT_DESIGN.md > Reads that stay live).
 */
import { describe, it, expect, vi } from 'vitest'
import { toolRegistry } from '../llm/registry'
import { registerCoreTools } from '../llm/tools'
import { buildAgentToolContext } from '../canvas/composables/agent/agentToolContext'
import { fakeAgentToolContextDeps, fakeNodesStore } from './fixtures/agentToolContextDeps'

registerCoreTools()

describe('the workspace the memory tools write to', () => {
  it('is the one open now, not the one open at setup', async () => {
    let workspaceId: string | null = 'workspace-a'
    const addMemory = vi.fn()
    const deps = fakeAgentToolContextDeps({
      store: fakeNodesStore({
        get currentWorkspaceId() {
          return workspaceId
        },
      }),
      facts: { getMemories: vi.fn(() => []), addMemory } as never,
    })

    // The user switches workspace; the dependencies were composed long before
    workspaceId = 'workspace-b'

    await toolRegistry.execute('remember', { message: 'a fact' }, buildAgentToolContext(deps))

    expect(addMemory, 'memory tools would write to the workspace open when the canvas loaded')
      .toHaveBeenCalledWith('workspace-b', 'a fact')
  })
})
