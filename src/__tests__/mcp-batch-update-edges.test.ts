/**
 * Edges can be updated in batches, with a result per edge.
 *
 * Edges could be created and deleted in batches but only updated one at a
 * time, so relabelling 63 edges took 63 calls
 * (PRODUCT_DESIGN.md > Updating edges in batches).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMcpMessageHandler, type McpStoreInterface } from '../mcp/messageHandler'
import type { Edge } from '../types'

function makeEdge(id: string): Edge {
  return {
    id,
    source_node_id: 'a',
    target_node_id: 'b',
    label: null,
    link_type: 'related',
    weight: 1,
    color: null,
    storyline_id: null,
    created_at: 0,
    directed: true,
  }
}

describe('batch_update_edges', () => {
  let updateEdgeLabel: ReturnType<typeof vi.fn>
  let updateEdgeDirected: ReturnType<typeof vi.fn>
  let updateEdgeColor: ReturnType<typeof vi.fn>
  let handler: ReturnType<typeof createMcpMessageHandler>

  beforeEach(() => {
    updateEdgeLabel = vi.fn().mockResolvedValue(undefined)
    updateEdgeDirected = vi.fn().mockResolvedValue(undefined)
    updateEdgeColor = vi.fn().mockResolvedValue(undefined)
    const store = {
      getFilteredNodes: () => [],
      getFilteredEdges: () => [makeEdge('e1'), makeEdge('e2')],
      getNode: () => undefined,
      getWorkspaces: () => [{ id: 'default', name: 'Default', current: true }],
      updateEdgeLabel,
      updateEdgeDirected,
      updateEdgeColor,
    } as unknown as McpStoreInterface
    handler = createMcpMessageHandler(store)
  })

  function call(updates: unknown[]) {
    return handler.handleRequest(
      { jsonrpc: '2.0' as const, id: 1, method: 'batch_update_edges', params: { updates } },
      'conn'
    )
  }

  it('applies each field of each item', async () => {
    const response = await call([
      { id: 'e1', label: 'supports' },
      { id: 'e2', directed: false, color: 'red' },
    ])

    expect(response.result).toEqual({ success: true, updated: 2, failed: 0 })
    expect(updateEdgeLabel).toHaveBeenCalledWith('e1', 'supports')
    expect(updateEdgeDirected).toHaveBeenCalledWith('e2', false)
    expect(updateEdgeColor).toHaveBeenCalledWith('e2', '#ef4444')
  })

  it('clears a label or color given as an empty string', async () => {
    await call([{ id: 'e1', label: '', color: '' }])

    expect(updateEdgeLabel).toHaveBeenCalledWith('e1', null)
    expect(updateEdgeColor).toHaveBeenCalledWith('e1', null)
  })

  it('reports a missing edge by id and still updates the rest', async () => {
    const response = await call([
      { id: 'missing', label: 'x' },
      { id: 'e2', label: 'y' },
    ])

    expect(response.result).toEqual({
      success: false,
      updated: 1,
      failed: 1,
      errors: [{ id: 'missing', error: 'Edge not found: missing' }],
    })
    expect(updateEdgeLabel).toHaveBeenCalledWith('e2', 'y')
  })

  it('reports a store failure for its item and goes on', async () => {
    updateEdgeLabel.mockRejectedValueOnce(new Error('disk full'))
    const response = await call([
      { id: 'e1', label: 'x' },
      { id: 'e2', label: 'y' },
    ])

    expect(response.result).toEqual({
      success: false,
      updated: 1,
      failed: 1,
      errors: [{ id: 'e1', error: 'disk full' }],
    })
  })
})
