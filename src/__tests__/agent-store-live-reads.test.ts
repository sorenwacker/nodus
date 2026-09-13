/**
 * What the agent's tools read is read when the tool runs.
 *
 * The canvas builds the adapter once at setup, so a value copied rather than
 * exposed as a getter freezes at that moment. The workspace identifier was
 * copied, and after the user switched workspace the memory tools went on
 * writing to the workspace that was open when the canvas was composed
 * (PRODUCT_DESIGN.md > Reads that stay live).
 */
import { describe, it, expect, vi } from 'vitest'

describe('the store the agent tools read through', () => {
  let workspaceId: string | null = 'workspace-a'

  function fakeStore() {
    return {
      get currentWorkspaceId() {
        return workspaceId
      },
      get selectedNodeIds() {
        return []
      },
      get filteredNodes() {
        return []
      },
      get filteredEdges() {
        return []
      },
      filteredFrames: [],
      filteredStorylines: [],
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

  it('reports the workspace that is open now, not the one open at setup', async () => {
    const { agentToolStoreAdapter } = await import(
      '../canvas/composables/agent/agentToolStoreAdapter'
    )
    workspaceId = 'workspace-a'
    const adapter = agentToolStoreAdapter(fakeStore(), () => null)
    expect(adapter.currentWorkspaceId).toBe('workspace-a')

    // The user switches workspace; the adapter was built long before
    workspaceId = 'workspace-b'

    expect(
      adapter.currentWorkspaceId,
      'memory tools would write to the workspace open when the canvas loaded'
    ).toBe('workspace-b')
  })
})
