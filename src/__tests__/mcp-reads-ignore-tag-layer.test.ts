/**
 * The MCP adapter reads the graph as data, not as drawn.
 *
 * It mapped node reads onto the canvas filter, which hides tag nodes while the
 * tag layer is off, so an unscoped connection saw a graph without a tag type
 * whenever the user had the layer hidden
 * (PRODUCT_DESIGN.md > MCP reads are independent of the canvas layers).
 */
import { describe, it, expect } from 'vitest'
import { appMcpStore, type AppMcpStoreDeps } from '../mcp/appStore'

describe('appMcpStore reads the data views of the graph', () => {
  const drawn = [{ id: 'note' }]
  const data = [{ id: 'note' }, { id: 'tag' }]
  const graphEdges = [{ id: 't1' }]
  const store = {
    filteredNodes: drawn,
    graphNodes: data,
    filteredEdges: [],
    graphEdges,
    nodes: data,
    workspaces: [],
    currentWorkspaceId: null,
  }
  const mcp = appMcpStore({
    store,
    edgesStore: {},
    storylinesStore: {},
    invoke: async () => undefined,
  } as unknown as AppMcpStoreDeps)

  it('lists nodes from graphNodes, not from the canvas filter', () => {
    expect(mcp.getFilteredNodes()).toBe(data)
  })

  it('lists edges from graphEdges', () => {
    expect(mcp.getFilteredEdges()).toBe(graphEdges)
  })
})
