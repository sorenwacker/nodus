/**
 * Tags are extracted when a node is created and when its content is edited, so
 * content that predates either path carried none: a vault of 12,853 nodes had
 * 1,193 whose body held hashtags the graph did not know about. The load pass
 * closes that gap (PRODUCT_DESIGN.md > Tags).
 */
import { describe, it, expect } from 'vitest'
import { planHashtagBackfill } from '../stores/nodes/hashtagBackfill'
import type { Node } from '../types'

function node(id: string, content: string | null, tags?: string[]): Node {
  return {
    id,
    title: id,
    markdown_content: content,
    tags: tags ? JSON.stringify(tags) : null,
  } as unknown as Node
}

describe('planHashtagBackfill', () => {
  it('finds tags in content that was never scanned', () => {
    const plan = planHashtagBackfill([node('a', 'about #genomics and #FAIR data')])
    expect(plan).toEqual([{ id: 'a', tags: ['genomics', 'FAIR'] }])
  })

  it('leaves a node whose tags are already recorded', () => {
    expect(planHashtagBackfill([node('a', 'about #genomics', ['genomics'])])).toEqual([])
  })

  it('keeps tags that are not in the text', () => {
    // Tags can be set by hand or by frontmatter; a body scan must not drop them
    const plan = planHashtagBackfill([node('a', 'about #genomics', ['manual'])])
    expect(plan[0].tags).toEqual(['manual', 'genomics'])
  })

  it('ignores a node with no content', () => {
    expect(planHashtagBackfill([node('a', null), node('b', '')])).toEqual([])
  })

  it('ignores content that holds no tags', () => {
    expect(planHashtagBackfill([node('a', 'no tags here')])).toEqual([])
  })

  it('survives a malformed tags field', () => {
    const plan = planHashtagBackfill([node('a', 'has #tag', undefined)])
    const broken = { id: 'b', title: 'b', markdown_content: 'has #tag', tags: '{oops' } as unknown as Node
    expect(() => planHashtagBackfill([broken])).not.toThrow()
    expect(plan[0].tags).toEqual(['tag'])
  })

  it('plans nothing on a second run over the same nodes', () => {
    const nodes = [node('a', 'about #genomics')]
    const first = planHashtagBackfill(nodes)
    nodes[0].tags = JSON.stringify(first[0].tags)
    expect(planHashtagBackfill(nodes)).toEqual([])
  })
})
