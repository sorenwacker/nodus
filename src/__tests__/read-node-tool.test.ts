/**
 * Reading the note a question is about
 * (PRODUCT_DESIGN.md > Answering a question > Reading the note the question is about).
 *
 * The agent found the note by search and then had no tool to read it, so it
 * read the whole graph in one request and the provider timed out.
 */
import { describe, it, expect } from 'vitest'
import { toolRegistry, type ToolContext } from '../llm/registry'
import { registerCoreTools } from '../llm/tools'
import { getAgentMode } from '../llm/agentModes'
import type { AgentMode } from '../llm/types'
import type { Node } from '../types'

registerCoreTools()

const node = (id: string, title: string, content: string | null): Node =>
  ({ id, title, markdown_content: content, canvas_x: 0, canvas_y: 0 }) as unknown as Node

const notes = [
  node('n1', 'FIP', 'A FAIR Implementation Profile records the choices a community makes for each FAIR principle.'),
  node('n2', 'FIPs and Practice', 'How FIPs are used in practice.'),
  node('n3', 'Tobias Kuhn', null),
  node('n4', 'Bus', 'A vehicle.'),
  node('n5', 'Bubble', 'A sphere of air.'),
]

function contextWith(nodes: Node[]): ToolContext {
  return {
    store: { filteredNodes: nodes, filteredEdges: [] },
    log: () => {},
    ollamaContextLength: 8192,
  } as unknown as ToolContext
}

const call = (name: string, args: Record<string, unknown>, nodes = notes) =>
  toolRegistry.execute(name, args, contextWith(nodes))

describe('read_node', () => {
  it('returns the full content of the named node', async () => {
    const result = await call('read_node', { title: 'FIP' })
    expect(result).toContain('FIP')
    expect(result).toContain(notes[0].markdown_content)
  })

  it('finds the node whatever the case of the title', async () => {
    expect(await call('read_node', { title: 'fips and practice' })).toContain('How FIPs are used')
  })

  it('says when the node has no content', async () => {
    expect(await call('read_node', { title: 'Tobias Kuhn' })).toMatch(/no content/i)
  })

  it('reports a title that names no node', async () => {
    const result = await call('read_node', { title: 'Nothing here' })
    expect(result).toMatch(/no node titled "Nothing here"/i)
    expect(result).toContain('query_nodes')
  })

  it.each<AgentMode>(['explore', 'plan', 'execute'])('is available in %s mode', mode => {
    expect(getAgentMode(mode).toolWhitelist).toContain('read_node')
  })
})

describe('query_nodes', () => {
  it('returns a preview of each hit next to its title', async () => {
    const result = await call('query_nodes', { filter: 'practice' })
    expect(result).toContain('FIPs and Practice')
    expect(result).toContain('How FIPs are used in practice.')
  })

  it('finds the singular when asked for the plural', async () => {
    const result = await call('query_nodes', { filter: 'FIPs' })
    expect(result).toContain('- FIP ')
    expect(result).toContain('FIPs and Practice')
  })

  it('finds the plural when asked for the singular', async () => {
    expect(await call('query_nodes', { filter: 'FIP' })).toContain('FIPs and Practice')
  })

  it('does not widen a short term into its stem', async () => {
    const result = await call('query_nodes', { filter: 'bus' })
    expect(result).toContain('- Bus')
    expect(result).not.toContain('Bubble')
  })

  it('still marks nodes without content', async () => {
    expect(await call('query_nodes', { filter: 'Kuhn' })).toContain('Tobias Kuhn (empty)')
  })
})
