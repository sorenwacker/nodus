/**
 * The in-app agent can set node metadata, not just text.
 *
 * "Add dates to every node" was impossible from the app: only MCP clients
 * could write date fields, so the agent had no tool that could satisfy it.
 */
import { describe, it, expect, vi } from 'vitest'
import { executeTool } from '../llm'
import type { ToolContext } from '../llm'
import { extractFrontmatterField } from '../lib/timelineDates'

function makeContext(nodes: Array<{ id: string; title: string; markdown_content?: string }>) {
  const updateNodeContent = vi.fn(async () => {})
  const updateNodeTags = vi.fn(async () => {})
  const createNode = vi.fn(async (data: Record<string, unknown>) => ({ id: 'new', ...data }))

  const ctx = {
    store: {
      filteredNodes: nodes,
      filteredEdges: [],
      createNode,
      createEdge: vi.fn(),
      deleteNode: vi.fn(),
      deleteEdge: vi.fn(),
      updateNodePosition: vi.fn(),
      updateNodeContent,
      updateNodeTitle: vi.fn(),
      updateNodeTags,
    },
    log: vi.fn(),
    screenToCanvas: () => ({ x: 0, y: 0 }),
    snapToGrid: (v: number) => v,
  } as unknown as ToolContext

  return { ctx, updateNodeContent, updateNodeTags, createNode }
}

describe('agent update_node metadata', () => {
  it('adds a date without erasing the existing content', async () => {
    const { ctx, updateNodeContent } = makeContext([
      { id: 'a', title: 'Alpha', markdown_content: 'The body text stays.' },
    ])

    const result = await executeTool('update_node', { title: 'Alpha', date: '1969-07-20' }, ctx)

    expect(result).toContain('Updated')
    const written = updateNodeContent.mock.calls[0][1] as unknown as string
    expect(extractFrontmatterField(written, 'date')).toBe('1969-07-20')
    expect(written).toContain('The body text stays.')
  })

  it('writes a date range', async () => {
    const { ctx, updateNodeContent } = makeContext([{ id: 'a', title: 'Alpha', markdown_content: 'x' }])

    await executeTool(
      'update_node',
      { title: 'Alpha', date: '2026-02-03', date_end: '2026-02-14' },
      ctx
    )

    const written = updateNodeContent.mock.calls[0][1] as unknown as string
    expect(extractFrontmatterField(written, 'date')).toBe('2026-02-03')
    expect(extractFrontmatterField(written, 'date_end')).toBe('2026-02-14')
  })

  it('clears a date with an empty string', async () => {
    const { ctx, updateNodeContent } = makeContext([
      { id: 'a', title: 'Alpha', markdown_content: '---\ndate: 1999\n---\n\nbody' },
    ])

    await executeTool('update_node', { title: 'Alpha', date: '' }, ctx)

    const written = updateNodeContent.mock.calls[0][1] as unknown as string
    expect(extractFrontmatterField(written, 'date')).toBeNull()
    expect(written).toContain('body')
  })

  it('sets tags', async () => {
    const { ctx, updateNodeTags } = makeContext([{ id: 'a', title: 'Alpha', markdown_content: 'x' }])

    await executeTool('update_node', { title: 'Alpha', tags: ['demo', 'results'] }, ctx)

    expect(updateNodeTags).toHaveBeenCalledWith('a', ['demo', 'results'])
  })

  it('still updates content on its own', async () => {
    const { ctx, updateNodeContent } = makeContext([{ id: 'a', title: 'Alpha', markdown_content: 'old' }])

    await executeTool('update_node', { title: 'Alpha', new_content: 'brand new' }, ctx)

    expect(updateNodeContent.mock.calls[0][1]).toContain('brand new')
  })

  it('says so when there is nothing to change', async () => {
    const { ctx, updateNodeContent } = makeContext([{ id: 'a', title: 'Alpha', markdown_content: 'x' }])

    const result = await executeTool('update_node', { title: 'Alpha' }, ctx)

    expect(result).toContain('Nothing to update')
    expect(updateNodeContent).not.toHaveBeenCalled()
  })

  it('reports an unknown node instead of silently doing nothing', async () => {
    const { ctx } = makeContext([{ id: 'a', title: 'Alpha' }])
    const result = await executeTool('update_node', { title: 'Missing', date: '2020' }, ctx)
    expect(result).toContain('not found')
  })
})

describe('agent create_node metadata', () => {
  it('creates a dated, tagged node in one call', async () => {
    const { ctx, createNode } = makeContext([])

    await executeTool(
      'create_node',
      { title: 'Kickoff', content: 'Start of the project', date: '2026-01-12', tags: ['demo'] },
      ctx
    )

    const data = createNode.mock.calls[0][0] as Record<string, unknown>
    expect(extractFrontmatterField(data.markdown_content as string, 'date')).toBe('2026-01-12')
    expect(data.tags).toEqual(['demo'])
  })
})
