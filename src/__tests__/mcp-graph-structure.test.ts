/**
 * The adjacency list is keyed by what identifies a node.
 *
 * It was keyed by title, so two nodes sharing one collapsed into a single
 * entry and the first was silently lost: the list came back with fewer nodes
 * than the graph holds, and which survived depended on the order they were
 * walked. The tool's own description already promised ids
 * (PRODUCT_DESIGN.md > A result keyed by what identifies a node).
 */
import { describe, it, expect } from 'vitest'
import { handleGetGraphStructure } from '../mcp/handlers/nodeHandlers'
import type { McpStoreInterface } from '../mcp/messageHandler'
import type { Node, Edge } from '../types'

function makeNode(id: string, title: string): Node {
  return {
    id,
    title,
    file_path: null,
    markdown_content: null,
    node_type: 'note',
    canvas_x: 0,
    canvas_y: 0,
    width: 200,
    height: 120,
    z_index: 0,
    frame_id: null,
    color_theme: null,
    is_collapsed: false,
    tags: null,
    workspace_id: null,
    created_at: 0,
    updated_at: 0,
    deleted_at: null,
  } as unknown as Node
}

function makeEdge(id: string, source: string, target: string): Edge {
  return {
    id,
    source_node_id: source,
    target_node_id: target,
    label: null,
    link_type: 'related',
    weight: 1,
    color: null,
    storyline_id: null,
    created_at: 0,
    directed: true,
  } as unknown as Edge
}

/** Two notes named the same, as a vault of meeting notes readily produces. */
const nodes = [makeNode('n1', 'Meeting notes'), makeNode('n2', 'Meeting notes'), makeNode('n3', 'Agenda')]
const edges = [makeEdge('e1', 'n1', 'n3'), makeEdge('e2', 'n2', 'n3')]

const store = {
  getFilteredNodes: () => nodes,
  getFilteredEdges: () => edges,
  getNode: (id: string) => nodes.find(n => n.id === id),
} as unknown as McpStoreInterface

describe('the graph structure a client receives', () => {
  it('keeps both nodes when two share a title', () => {
    const result = handleGetGraphStructure(store, {})

    expect(Object.keys(result).length, 'a node was lost to a shared title').toBe(3)
  })

  it('is keyed by node id, as its description promises', () => {
    const result = handleGetGraphStructure(store, {})

    expect(Object.keys(result).sort()).toEqual(['n1', 'n2', 'n3'])
    expect(result.n1.title).toBe('Meeting notes')
    expect(result.n2.title).toBe('Meeting notes')
  })
})
