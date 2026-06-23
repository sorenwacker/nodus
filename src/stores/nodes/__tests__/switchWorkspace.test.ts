import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref } from 'vue'

const invokeMock = vi.fn()
const getWorkspaceMock = vi.fn()

vi.mock('../../../lib/tauri', () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
  getWorkspace: (...args: unknown[]) => getWorkspaceMock(...args),
}))

import { switchWorkspace } from '../advanced'

function makeDeps(initialNodes: unknown[]) {
  return {
    state: { nodes: ref(initialNodes), selectedNodeIds: ref([]) },
    edgesStore: { initialize: vi.fn().mockResolvedValue(undefined), edges: [] },
    framesStore: { initialize: vi.fn().mockResolvedValue(undefined) },
    workspaceStore: { switchWorkspace: vi.fn() },
  }
}

const fileSync = {
  stopWatching: vi.fn().mockResolvedValue(undefined),
  watchVault: vi.fn().mockResolvedValue(undefined),
}

describe('switchWorkspace', () => {
  beforeEach(() => {
    invokeMock.mockReset()
    getWorkspaceMock.mockReset()
    getWorkspaceMock.mockResolvedValue(null)
  })

  it('reloads the global node cache so a cleared cache is restored', async () => {
    const reloaded = [{ id: 'n1', workspace_id: 'ws2' }]
    invokeMock.mockResolvedValue(reloaded)
    // Simulates state after clearCanvas() emptied the cache (the bug scenario).
    const deps = makeDeps([])

    await switchWorkspace(deps as never, fileSync as never, 'ws2')

    expect(invokeMock).toHaveBeenCalledWith('get_nodes')
    expect(deps.state.nodes.value).toEqual(reloaded)
    expect(deps.workspaceStore.switchWorkspace).toHaveBeenCalledWith('ws2')
  })

  it('loads nodes before switching the workspace id to avoid an empty flash', async () => {
    const order: string[] = []
    invokeMock.mockImplementation(async () => {
      order.push('get_nodes')
      return []
    })
    const deps = makeDeps([])
    deps.workspaceStore.switchWorkspace = vi.fn(() => {
      order.push('switch')
    })

    await switchWorkspace(deps as never, fileSync as never, 'ws2')

    expect(order).toEqual(['get_nodes', 'switch'])
  })
})
