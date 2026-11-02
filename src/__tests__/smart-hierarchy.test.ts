/**
 * Smart layout builds a tree from node kind and connections
 * (features.md > Smart Layout).
 */
import { describe, it, expect, vi } from 'vitest'
import { parentCandidates, layoutForest, type HierarchyNode } from '../canvas/layout/smartHierarchy'
import { orderKinds, chooseParents } from '../llm/hierarchyPlanner'

const node = (id: string, kind: string): HierarchyNode => ({ id, title: id, kind, width: 200, height: 120 })
const edge = (a: string, b: string) => ({ source_node_id: a, target_node_id: b })

describe('parentCandidates', () => {
  const order = ['tag', 'note']

  it('offers only connected neighbours of broader rank', () => {
    const nodes = [node('#t', 'tag'), node('n1', 'note'), node('n2', 'note')]
    const c = parentCandidates(nodes, [edge('n1', '#t'), edge('n1', 'n2')], order)
    expect(c.get('n1')).toEqual(['#t'])
    expect(c.get('#t')).toEqual([])
  })

  it('ranks the better connected node broader within one kind', () => {
    const nodes = [node('hub', 'note'), node('a', 'note'), node('b', 'note')]
    const c = parentCandidates(nodes, [edge('a', 'hub'), edge('b', 'hub')], order)
    expect(c.get('a')).toEqual(['hub'])
    expect(c.get('hub')).toEqual([])
  })

  it('never offers a parent that could close a cycle', () => {
    const nodes = [node('a', 'note'), node('b', 'note')]
    const c = parentCandidates(nodes, [edge('a', 'b')], order)
    expect([...c.values()].flat()).toHaveLength(1)
  })
})

describe('layoutForest', () => {
  it('places a parent above its children', () => {
    const nodes = [node('p', 'tag'), node('c1', 'note'), node('c2', 'note')]
    const pos = layoutForest(nodes, new Map([['c1', 'p'], ['c2', 'p']]), { x: 0, y: 0 })
    expect(pos.get('c1')!.y).toBeGreaterThan(pos.get('p')!.y)
    expect(pos.get('c2')!.y).toBe(pos.get('c1')!.y)
  })

  it('puts unconnected nodes in a row below the trees', () => {
    const nodes = [node('p', 'tag'), node('c', 'note'), node('lone', 'note')]
    const pos = layoutForest(nodes, new Map([['c', 'p']]), { x: 0, y: 0 })
    expect(pos.get('lone')!.y).toBeGreaterThan(pos.get('c')!.y)
  })
})

describe('the model requests', () => {
  it('asks nothing when there is a single kind', async () => {
    const llm = { generate: vi.fn() }
    expect(await orderKinds([{ kind: 'note', examples: ['x'] }], '', llm)).toEqual(['note'])
    expect(llm.generate).not.toHaveBeenCalled()
  })

  it('keeps kinds the model leaves out, after the ones it ordered', async () => {
    const llm = { generate: vi.fn().mockResolvedValue('term, tag') }
    const kinds = [{ kind: 'tag', examples: [] }, { kind: 'term', examples: [] }, { kind: 'citation', examples: [] }]
    expect(await orderKinds(kinds, '', llm)).toEqual(['term', 'tag', 'citation'])
  })

  it('chooses parents for many nodes in one request', async () => {
    const llm = { generate: vi.fn().mockResolvedValue('1: b\n2: a') }
    const parents = await chooseParents(
      [
        { id: 'n1', title: 'Social scoring', candidates: [{ id: '#ai', title: '#ai-act' }, { id: '#p', title: '#prohibited' }] },
        { id: 'n2', title: 'Biometrics', candidates: [{ id: '#h', title: '#high-risk' }, { id: '#ai', title: '#ai-act' }] },
      ],
      '',
      llm
    )
    expect(llm.generate).toHaveBeenCalledTimes(1)
    expect(parents.get('n1')).toBe('#p')
    expect(parents.get('n2')).toBe('#h')
  })

  it('falls back to the first candidate when the answer is unusable', async () => {
    const llm = { generate: vi.fn().mockResolvedValue('no idea') }
    const parents = await chooseParents(
      [{ id: 'n1', title: 'x', candidates: [{ id: 'a', title: 'A' }, { id: 'b', title: 'B' }] }],
      '',
      llm
    )
    expect(parents.get('n1')).toBe('a')
  })
})
