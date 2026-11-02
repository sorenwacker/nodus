/**
 * The in-app agent can group nodes by tagging them and thread them into
 * storylines. Grouping used frames, which are removed
 * (docs/design/remove-frames.md); a tag names a group without claiming a
 * region of the canvas.
 */
import { describe, it, expect, vi } from 'vitest'
import { executeTool } from '../llm'
import type { ToolContext } from '../llm'

function makeContext(options: { withGrouping?: boolean } = {}) {
  const { withGrouping = true } = options
  const nodes = [
    { id: 'a', title: 'Kickoff', canvas_x: 0, canvas_y: 0, width: 200, height: 100, tags: '["draft"]' },
    { id: 'b', title: 'Findings', canvas_x: 400, canvas_y: 300, width: 200, height: 100, tags: null },
  ]
  const storylines = [{ id: 's-existing', title: 'Project Story', description: null }]

  const updateNodeTags = vi.fn(async (_id: string, _tags: string[]) => {})
  const createStoryline = vi.fn(async (title: string) => {
    const storyline = { id: `s-${storylines.length + 1}`, title, description: null }
    storylines.push(storyline)
    return storyline
  })
  const addNodeToStoryline = vi.fn(async (_storylineId: string, _nodeId: string) => {})

  const grouping = withGrouping
    ? {
        updateNodeTags,
        getStorylines: () => storylines,
        createStoryline,
        addNodeToStoryline,
      }
    : {}

  const ctx = {
    store: {
      filteredNodes: nodes,
      filteredEdges: [],
      createNode: vi.fn(),
      createEdge: vi.fn(),
      deleteNode: vi.fn(),
      deleteEdge: vi.fn(),
      updateNodePosition: vi.fn(),
      updateNodeContent: vi.fn(),
      updateNodeTitle: vi.fn(),
      ...grouping,
    },
    log: vi.fn(),
    screenToCanvas: () => ({ x: 50, y: 50 }),
    snapToGrid: (v: number) => v,
  } as unknown as ToolContext

  return { ctx, updateNodeTags, createStoryline, addNodeToStoryline }
}

describe('agent tag grouping', () => {
  it('adds the tag to each named node, keeping the tags it had', async () => {
    const { ctx, updateNodeTags } = makeContext()

    const result = await executeTool('tag_nodes', { tag: 'Demo Project', node_titles: ['Kickoff', 'Findings'] }, ctx)

    expect(result).toContain('2 node(s)')
    expect(updateNodeTags).toHaveBeenCalledWith('a', ['draft', 'demo-project'])
    expect(updateNodeTags).toHaveBeenCalledWith('b', ['demo-project'])
  })

  it('does not add a tag a node already carries', async () => {
    const { ctx, updateNodeTags } = makeContext()

    await executeTool('tag_nodes', { tag: 'draft', node_titles: ['Kickoff'] }, ctx)

    expect(updateNodeTags).not.toHaveBeenCalled()
  })

  it('reports nodes it could not find rather than failing silently', async () => {
    const { ctx } = makeContext()

    const result = await executeTool('tag_nodes', { tag: 'demo', node_titles: ['Kickoff', 'Nowhere'] }, ctx)

    expect(result).toContain('1 named node(s) not found')
  })

  it('refuses a tag with no usable characters', async () => {
    const { ctx, updateNodeTags } = makeContext()

    const result = await executeTool('tag_nodes', { tag: '(( ))', node_titles: ['Kickoff'] }, ctx)

    expect(result).toContain('Error')
    expect(updateNodeTags).not.toHaveBeenCalled()
  })

  it('offers no frame tools', async () => {
    const { ctx } = makeContext()
    for (const tool of ['create_frame', 'assign_node_to_frame', 'list_frames']) {
      expect(await executeTool(tool, {}, ctx)).toBe(`__UNHANDLED__:${tool}`)
    }
  })
})

describe('agent storyline tools', () => {
  it('creates a storyline and threads the named nodes in order', async () => {
    const { ctx, createStoryline, addNodeToStoryline } = makeContext()

    const result = await executeTool(
      'create_storyline',
      { title: 'Research arc', description: 'from kickoff to findings', node_titles: ['Kickoff', 'Findings'] },
      ctx
    )

    expect(createStoryline).toHaveBeenCalledWith('Research arc', 'from kickoff to findings')
    expect(addNodeToStoryline.mock.calls.map(c => c[1])).toEqual(['a', 'b'])
    expect(result).toContain('2 node(s)')
  })

  it('appends to an existing storyline by title', async () => {
    const { ctx, addNodeToStoryline } = makeContext()

    const result = await executeTool(
      'add_node_to_storyline',
      { storyline_title: 'project story', node_titles: ['Findings'] },
      ctx
    )

    expect(addNodeToStoryline).toHaveBeenCalledWith('s-existing', 'b')
    expect(result).toContain('Project Story')
  })

  it('lists storylines', async () => {
    const { ctx } = makeContext()
    expect(await executeTool('list_storylines', {}, ctx)).toContain('Project Story')
  })
})

describe('contexts without grouping support', () => {
  it('says the capability is unavailable instead of throwing', async () => {
    const { ctx } = makeContext({ withGrouping: false })

    for (const [tool, args] of [
      ['tag_nodes', { tag: 'x', node_titles: ['Kickoff'] }],
      ['create_storyline', { title: 'x' }],
      ['add_node_to_storyline', { storyline_title: 'x', node_titles: ['Kickoff'] }],
      ['list_storylines', {}],
    ] as const) {
      const result = await executeTool(tool, args as Record<string, unknown>, ctx)
      expect(result, `${tool} should report unavailability`).toContain('not available')
    }
  })
})
