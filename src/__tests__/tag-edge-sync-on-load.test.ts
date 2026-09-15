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

function node(id: string, tags: string[] | null, type = 'note', workspaceId: string | null = null): Node {
  return {
    id,
    title: id,
    node_type: type,
    tags: tags ? JSON.stringify(tags) : null,
    workspace_id: workspaceId,
  } as unknown as Node
}

describe('syncAllTagNodes', () => {
  it('connects nodes through the tags they share', async () => {
    const createTagEdges = vi.fn(async () => {})
    await syncAllTagNodes(
      [node('a', ['shared', 'solo']), node('b', ['shared'])],
      { createTagEdges },
      null
    )

    // 'solo' belongs to one note, so it labels rather than links and earns no node
    expect(createTagEdges).toHaveBeenCalledTimes(2)
    expect(createTagEdges).toHaveBeenCalledWith('a', ['shared'])
    expect(createTagEdges).toHaveBeenCalledWith('b', ['shared'])
  })

  it('leaves a tag only one note carries', async () => {
    const createTagEdges = vi.fn(async () => {})
    await syncAllTagNodes([node('a', ['lonely'])], { createTagEdges }, null)
    expect(createTagEdges).not.toHaveBeenCalled()
  })

  it('skips tag nodes, untagged nodes and empty tag lists', async () => {
    const createTagEdges = vi.fn(async () => {})
    await syncAllTagNodes(
      [node('t', ['x'], 'tag'), node('a', null), node('b', [])],
      { createTagEdges },
      null
    )
    expect(createTagEdges).not.toHaveBeenCalled()
  })

  it('survives a node whose tags field is malformed', async () => {
    const createTagEdges = vi.fn(async () => {})
    const broken = { id: 'b', title: 'b', node_type: 'note', tags: '{oops' } as unknown as Node
    const shared = [node('a', ['x']), node('c', ['x'])]
    await expect(
      syncAllTagNodes([broken, ...shared], { createTagEdges }, null)
    ).resolves.toBeUndefined()
    expect(createTagEdges).toHaveBeenCalledWith('a', ['x'])
  })
})

describe('the workspace the pass walks', () => {
  // The guard against connecting a pair twice checks the edges the application
  // holds, and those are loaded for one workspace. Walking every node in the
  // database meant a note elsewhere looked unconnected, so the pass asked for
  // an edge that already existed and the database refused it - once per note,
  // on every load (PRODUCT_DESIGN.md > Connecting tags on load).
  it('leaves the notes of another workspace alone', async () => {
    const createTagEdges = vi.fn(async (_id: string, _tags: string[]) => {})

    await syncAllTagNodes(
      [
        node('here-a', ['shared'], 'note', 'ws-open'),
        node('here-b', ['shared'], 'note', 'ws-open'),
        node('elsewhere-a', ['shared'], 'note', 'ws-other'),
        node('elsewhere-b', ['shared'], 'note', 'ws-other'),
      ],
      { createTagEdges },
      'ws-open'
    )

    const touched = createTagEdges.mock.calls.map(call => call[0])
    expect(touched, 'a note whose edges are not loaded was connected anyway').toEqual([
      'here-a',
      'here-b',
    ])
  })

  it('treats the unnamed workspace as its own', async () => {
    const createTagEdges = vi.fn(async (_id: string, _tags: string[]) => {})

    await syncAllTagNodes(
      [
        node('default-a', ['shared'], 'note', null),
        node('default-b', ['shared'], 'note', null),
        node('named', ['shared'], 'note', 'ws-other'),
      ],
      { createTagEdges },
      null
    )

    expect(createTagEdges.mock.calls.map(call => call[0])).toEqual(['default-a', 'default-b'])
  })

  it('counts what is shared within the workspace, not across all of them', async () => {
    const createTagEdges = vi.fn(async () => {})

    // One note here carries it, one elsewhere: within this workspace it labels
    // rather than links, so it earns no node
    await syncAllTagNodes(
      [
        node('here', ['solo'], 'note', 'ws-open'),
        node('elsewhere', ['solo'], 'note', 'ws-other'),
      ],
      { createTagEdges },
      'ws-open'
    )

    expect(createTagEdges).not.toHaveBeenCalled()
  })
})
