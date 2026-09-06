/**
 * A node can gain tags without gaining the edges that show them.
 *
 * Tag edges were only created at the moment content was written, and the
 * whole-vault sync only ran when the setting was toggled. Tags that arrived any
 * other way - the load-time body scan, or an agent writing a node's tags over
 * MCP - left the node tagged and unconnected, and no later run put that right
 * (docs/content/features.md > Tags).
 */
import { describe, it, expect, vi } from 'vitest'
import { syncAllTagNodes } from '../stores/nodes/advanced'
import type { Node } from '../types'

function node(id: string, tags: string[] | null, type = 'note'): Node {
  return { id, title: id, node_type: type, tags: tags ? JSON.stringify(tags) : null } as unknown as Node
}

describe('syncAllTagNodes', () => {
  it('connects nodes through the tags they share', async () => {
    const createTagEdges = vi.fn(async () => {})
    await syncAllTagNodes([node('a', ['shared', 'solo']), node('b', ['shared'])], { createTagEdges })

    // 'solo' belongs to one note, so it labels rather than links and earns no node
    expect(createTagEdges).toHaveBeenCalledTimes(2)
    expect(createTagEdges).toHaveBeenCalledWith('a', ['shared'])
    expect(createTagEdges).toHaveBeenCalledWith('b', ['shared'])
  })

  it('leaves a tag only one note carries', async () => {
    const createTagEdges = vi.fn(async () => {})
    await syncAllTagNodes([node('a', ['lonely'])], { createTagEdges })
    expect(createTagEdges).not.toHaveBeenCalled()
  })

  it('skips tag nodes, untagged nodes and empty tag lists', async () => {
    const createTagEdges = vi.fn(async () => {})
    await syncAllTagNodes(
      [node('t', ['x'], 'tag'), node('a', null), node('b', [])],
      { createTagEdges }
    )
    expect(createTagEdges).not.toHaveBeenCalled()
  })

  it('survives a node whose tags field is malformed', async () => {
    const createTagEdges = vi.fn(async () => {})
    const broken = { id: 'b', title: 'b', node_type: 'note', tags: '{oops' } as unknown as Node
    const shared = [node('a', ['x']), node('c', ['x'])]
    await expect(syncAllTagNodes([broken, ...shared], { createTagEdges })).resolves.toBeUndefined()
    expect(createTagEdges).toHaveBeenCalledWith('a', ['x'])
  })
})
