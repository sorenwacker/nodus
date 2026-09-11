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

/**
 * A tag node belongs to a workspace
 * (PRODUCT_DESIGN.md > Tag nodes belong to a workspace).
 *
 * The lookup matched a tag node anywhere, so tagging a note reused a tag node
 * from another workspace and linked the two workspaces where no view shows it.
 */
describe('tag nodes belong to a workspace', () => {
  function tagNode(id: string, workspaceId: string | null): Node {
    return { id, title: '#research', node_type: 'tag', workspace_id: workspaceId } as Node
  }
  function note(id: string, workspaceId: string | null): Node {
    return { id, title: id, node_type: 'note', workspace_id: workspaceId, canvas_x: 0, canvas_y: 0, width: 200 } as Node
  }

  function harnessIn(currentWorkspaceId: string | null, existing: Node[]) {
    const nodes = [...existing]
    const createNode = vi.fn(async (data: Record<string, unknown>) => {
      const node = { id: `new${nodes.length + 1}`, ...data } as unknown as Node
      nodes.push(node)
      return node
    })
    const tags = useTagNodes({
      getNodes: () => nodes,
      getCurrentWorkspaceId: () => currentWorkspaceId,
      getEdges: () => [],
      createNode: createNode as never,
      createEdge: vi.fn().mockResolvedValue(undefined) as never,
    } as never)
    return { tags, createNode }
  }

  it("reuses the tag node of the tagged note's workspace", async () => {
    const h = harnessIn('w2', [tagNode('t1', 'w1'), note('n1', 'w1')])

    const tag = await h.tags.getOrCreateTagNode('research', 'n1')

    expect(tag.id).toBe('t1')
    expect(h.createNode).not.toHaveBeenCalled()
  })

  it('creates a tag node in the tagged note\'s workspace rather than reusing one from another', async () => {
    const h = harnessIn('w1', [tagNode('t1', 'w1'), note('n2', 'w2')])

    const tag = await h.tags.getOrCreateTagNode('research', 'n2')

    expect(tag.id).not.toBe('t1')
    expect(h.createNode).toHaveBeenCalledWith(expect.objectContaining({ workspace_id: 'w2' }))
  })

  it('without a tagged note, looks in the open workspace, where "default" is the unnamed one', async () => {
    const reuse = harnessIn('default', [tagNode('t0', null)])
    expect((await reuse.tags.getOrCreateTagNode('research')).id).toBe('t0')

    const create = harnessIn('default', [tagNode('t1', 'w1')])
    expect((await create.tags.getOrCreateTagNode('research')).id).not.toBe('t1')
  })
})
