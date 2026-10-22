/**
 * A batch answers before the server's request timeout, and says what it did.
 *
 * A batch of 19 bodies outran the 30 second timeout: the client was told the
 * request timed out while the app went on writing
 * (PRODUCT_DESIGN.md > A batch that ends before the request times out).
 */
import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { handleBatchUpdateNodes, BATCH_TIME_BUDGET_MS } from '../mcp/handlers'
import type { McpStoreInterface } from '../mcp/messageHandler'
import type { Node } from '../types'

function makeNode(id: string): Node {
  return {
    id,
    title: id,
    file_path: null,
    markdown_content: null,
    node_type: 'note',
    canvas_x: 0,
    canvas_y: 0,
    width: 200,
    height: 120,
    z_index: 0,
    color_theme: null,
    is_collapsed: false,
    tags: null,
    workspace_id: null,
    checksum: null,
    created_at: 0,
    updated_at: 0,
    deleted_at: null,
  }
}

/** A store whose content writes each take `costMs` of a fake clock */
function slowStore(costMs: number) {
  let now = 0
  const updateNodeContent = vi.fn(async () => {
    now += costMs
  })
  const store = {
    getNode: (id: string) => makeNode(id),
    updateNodeContent,
    updateNodeTitle: vi.fn(),
    updateNodePosition: vi.fn(),
  } as unknown as McpStoreInterface
  return { store, updateNodeContent, clock: { now: () => now, budgetMs: 20_000 } }
}

const updates = ['n1', 'n2', 'n3', 'n4', 'n5'].map(id => ({ id, content: `body of ${id}` }))

describe('batch_update_nodes under a time budget', () => {
  it('stops starting items once the budget is spent and lists the rest', async () => {
    const { store, updateNodeContent, clock } = slowStore(8_000)

    const result = await handleBatchUpdateNodes(store, undefined, { updates }, clock)

    // 8 s, 16 s, 24 s: the third item finishes over budget, the fourth never starts
    expect(updateNodeContent).toHaveBeenCalledTimes(3)
    expect(result).toEqual({ success: false, updated: 3, failed: 0, not_attempted: ['n4', 'n5'] })
  })

  it('reports nothing left when the batch fits the budget', async () => {
    const { store, clock } = slowStore(1_000)

    const result = await handleBatchUpdateNodes(store, undefined, { updates }, clock)

    expect(result).toEqual({ success: true, updated: 5, failed: 0 })
  })

  it('keeps the budget below the server request timeout', () => {
    // The server rejects a pending request after this long; the app's budget
    // leaves room for the item in progress and the round trip
    const client = readFileSync(
      resolve(__dirname, '../../packages/nodus-mcp-server/src/websocket-client.ts'),
      'utf-8'
    )
    const match = client.match(/reject\(new Error\('Request timeout'\)\)[\s\S]*?\}, (\d+)\)/)
    expect(match, 'the server request timeout was not found').not.toBeNull()
    const serverTimeoutMs = Number(match![1])

    expect(BATCH_TIME_BUDGET_MS).toBeLessThanOrEqual(serverTimeoutMs - 5_000)
  })
})
