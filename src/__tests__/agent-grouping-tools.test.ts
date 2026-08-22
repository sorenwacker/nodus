/**
 * The in-app agent can group nodes into frames and thread them into
 * storylines. Both are core canvas features that only MCP clients could
 * reach, so asking the agent to organise a graph had no tool that could.
 */
import { describe, it, expect, vi } from 'vitest'
import { executeTool } from '../llm'
import type { ToolContext } from '../llm'

function makeContext(options: { withGrouping?: boolean } = {}) {
  const { withGrouping = true } = options
  const nodes = [
    { id: 'a', title: 'Kickoff', canvas_x: 0, canvas_y: 0, width: 200, height: 100, frame_id: null },
    { id: 'b', title: 'Findings', canvas_x: 400, canvas_y: 300, width: 200, height: 100, frame_id: null },
  ]
  const frames: Array<{ id: string; title?: string }> = [{ id: 'f-existing', title: 'Demo Project' }]
  const storylines = [{ id: 's-existing', title: 'Project Story', description: null }]

  const createFrame = vi.fn(
    async (_x: number, _y: number, _w: number, _h: number, title: string) => {
      const frame = { id: `f-${frames.length + 1}`, title }
      frames.push(frame)
      return frame
    }
  )
  const assignNodesToFrame = vi.fn((_ids: string[], _frameId: string | null) => {})
  const createStoryline = vi.fn(async (title: string) => {
    const storyline = { id: `s-${storylines.length + 1}`, title, description: null }
    storylines.push(storyline)
    return storyline
  })
  const addNodeToStoryline = vi.fn(async (_storylineId: string, _nodeId: string) => {})

  const grouping = withGrouping
    ? {
        getFrames: () => frames,
        createFrame,
        assignNodesToFrame,
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

  return { ctx, createFrame, assignNodesToFrame, createStoryline, addNodeToStoryline }
}

describe('agent frame tools', () => {
  it('sizes a new frame around the nodes it is given and puts them inside', async () => {
    const { ctx, createFrame, assignNodesToFrame } = makeContext()

    const result = await executeTool(
      'create_frame',
      { title: 'Demo', node_titles: ['Kickoff', 'Findings'] },
      ctx
    )

    expect(result).toContain('2 node(s)')
    const [x, y, width, height] = createFrame.mock.calls[0]
    // Bounds span both nodes (0,0 to 600,400) plus padding on every side
    expect(x).toBeLessThan(0)
    expect(y).toBeLessThan(0)
    expect(width).toBeGreaterThan(600)
    expect(height).toBeGreaterThan(400)
    expect(assignNodesToFrame).toHaveBeenCalledWith(['a', 'b'], 'f-2')
  })

  it('creates an empty frame when no nodes are named', async () => {
    const { ctx, createFrame, assignNodesToFrame } = makeContext()

    await executeTool('create_frame', { title: 'Empty' }, ctx)

    expect(createFrame).toHaveBeenCalled()
    expect(assignNodesToFrame).not.toHaveBeenCalled()
  })

  it('reports nodes it could not find rather than failing silently', async () => {
    const { ctx } = makeContext()
    const result = await executeTool(
      'create_frame',
      { title: 'Partial', node_titles: ['Kickoff', 'Nonexistent'] },
      ctx
    )
    expect(result).toContain('1 node(s)')
    expect(result).toContain('not found')
  })

  it('moves nodes into an existing frame by title', async () => {
    const { ctx, assignNodesToFrame } = makeContext()

    const result = await executeTool(
      'assign_node_to_frame',
      { frame_title: 'demo project', node_titles: ['Findings'] },
      ctx
    )

    expect(assignNodesToFrame).toHaveBeenCalledWith(['b'], 'f-existing')
    expect(result).toContain('Demo Project')
  })

  it('reports an unknown frame', async () => {
    const { ctx } = makeContext()
    const result = await executeTool(
      'assign_node_to_frame',
      { frame_title: 'Missing', node_titles: ['Kickoff'] },
      ctx
    )
    expect(result).toContain('not found')
  })

  it('lists frames with their node counts', async () => {
    const { ctx } = makeContext()
    const result = await executeTool('list_frames', {}, ctx)
    expect(result).toContain('Demo Project')
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
      ['create_frame', { title: 'x' }],
      ['assign_node_to_frame', { frame_title: 'x', node_titles: ['Kickoff'] }],
      ['list_frames', {}],
      ['create_storyline', { title: 'x' }],
      ['add_node_to_storyline', { storyline_title: 'x', node_titles: ['Kickoff'] }],
      ['list_storylines', {}],
    ] as const) {
      const result = await executeTool(tool, args as Record<string, unknown>, ctx)
      expect(result, `${tool} should report unavailability`).toContain('not available')
    }
  })
})
