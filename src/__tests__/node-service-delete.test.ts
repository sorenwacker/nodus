/**
 * An undo step is recorded for a delete that happened
 * (PRODUCT_DESIGN.md > A write the backend refused).
 *
 * NodeService pushed the deletion onto the undo stack before asking the
 * backend, so a refused delete left an undo entry for a node that was never
 * deleted. App.vue carried its own copy of those steps and called the store
 * without awaiting it, so a refusal there became an unhandled rejection.
 */
import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { NodeService } from '../services/nodeService'
import type { Node, Edge } from '../types'

const node = { id: 'n1', title: 'n1' } as Node
const edge = { id: 'e1', source_node_id: 'n1', target_node_id: 'n2' } as Edge

function makeService(deleteNode: () => Promise<void>) {
  const pushDeletionUndo = vi.fn()
  const service = new NodeService({
    store: { getNode: () => node, deleteNode, deleteNodes: vi.fn(), updateNodePosition: vi.fn() },
    undo: { pushDeletionUndo, pushPositionUndo: vi.fn() },
    getEdges: () => [edge],
  })
  return { service, pushDeletionUndo }
}

describe('deleting a node through the node service', () => {
  it('records the undo step once the delete has happened', async () => {
    const { service, pushDeletionUndo } = makeService(vi.fn().mockResolvedValue(undefined))

    await service.deleteNode('n1')

    expect(pushDeletionUndo).toHaveBeenCalledWith(node, [edge])
  })

  it('records nothing when the backend refused the delete', async () => {
    const { service, pushDeletionUndo } = makeService(vi.fn().mockRejectedValue(new Error('refused')))

    await expect(service.deleteNode('n1')).rejects.toThrow('refused')

    expect(pushDeletionUndo).not.toHaveBeenCalled()
  })
})

describe('the Delete key', () => {
  const source = readFileSync(resolve(process.cwd(), 'src/App.vue'), 'utf8')
  const start = source.indexOf('function handleDelete()')
  const body = source.slice(start, source.indexOf('\n}\n', start))

  it('deletes through the node service instead of a copy of its steps', () => {
    expect(start).toBeGreaterThan(-1)
    expect(body).toContain('nodeService.deleteNode(')
    expect(body).not.toContain('pushDeletionUndo(')
  })
})
