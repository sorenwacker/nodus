/**
 * A tag has one node.
 *
 * The lookup compared the bare tag name against a title stored with its hash,
 * so it never matched and every save of the same hashtag created another tag
 * node, and another edge to it.
 */
import { describe, it, expect, vi } from 'vitest'
import { useTagNodes } from '../composables/useTagNodes'
import type { Node } from '../types'

function harness(existing: Node[] = []) {
  const nodes = [...existing]
  const createNode = vi.fn(async (data: Record<string, unknown>) => {
    const node = { id: `n${nodes.length + 1}`, ...data } as unknown as Node
    nodes.push(node)
    return node
  })
  return {
    nodes,
    createNode,
    tags: useTagNodes({
      getNodes: () => nodes,
      getCurrentWorkspaceId: () => null,
      getEdges: () => [],
      createNode: createNode as never,
      createEdge: vi.fn().mockResolvedValue(undefined) as never,
      deleteNode: vi.fn().mockResolvedValue(undefined) as never,
      deleteEdge: vi.fn().mockResolvedValue(undefined) as never,
    } as never),
  }
}

describe('tag node identity', () => {
  it('reuses the node it created for the same tag', async () => {
    const h = harness()

    const first = await h.tags.getOrCreateTagNode('research')
    const second = await h.tags.getOrCreateTagNode('research')

    expect(second.id).toBe(first.id)
    expect(h.createNode).toHaveBeenCalledTimes(1)
  })

  it('matches regardless of the case written', async () => {
    const h = harness()

    const first = await h.tags.getOrCreateTagNode('Research')
    const second = await h.tags.getOrCreateTagNode('research')

    expect(second.id).toBe(first.id)
  })

  it('still creates separate nodes for different tags', async () => {
    const h = harness()

    const a = await h.tags.getOrCreateTagNode('alpha')
    const b = await h.tags.getOrCreateTagNode('beta')

    expect(b.id).not.toBe(a.id)
  })
})
