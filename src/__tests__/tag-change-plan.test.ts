/**
 * Deleting a #tag from a note used to leave the tag behind: extraction merged
 * what it found into the recorded tags and never removed anything, so the tag
 * and its edge outlived the text that created them.
 *
 * Tags have two sources - the body, and the chips on a card - and only the body
 * ones may be withdrawn by an edit, which is why the previous body is compared
 * rather than the recorded list (docs/content/features.md > Tags).
 */
import { describe, it, expect } from 'vitest'
import { planTagChange } from '../lib/tagSync'

describe('planTagChange', () => {
  it('adds a tag that appears in the text', () => {
    const plan = planTagChange('plain note', 'now with #genomics', [])
    expect(plan.added).toEqual(['genomics'])
    expect(plan.tags).toEqual(['genomics'])
    expect(plan.removed).toEqual([])
  })

  it('removes a tag deleted from the text', () => {
    const plan = planTagChange('has #genomics here', 'has nothing here', ['genomics'])
    expect(plan.removed).toEqual(['genomics'])
    expect(plan.tags).toEqual([])
  })

  it('keeps a tag added by hand that was never in the text', () => {
    const plan = planTagChange('has #genomics', 'has nothing', ['manual', 'genomics'])
    expect(plan.removed).toEqual(['genomics'])
    expect(plan.tags).toEqual(['manual'])
  })

  it('changes nothing when the text is untouched', () => {
    const plan = planTagChange('about #FAIR', 'about #FAIR', ['FAIR'])
    expect(plan).toEqual({ tags: ['FAIR'], added: [], removed: [] })
  })

  it('handles a node that had no content before', () => {
    const plan = planTagChange(null, 'first draft with #idea', [])
    expect(plan.added).toEqual(['idea'])
  })

  it('swaps one tag for another', () => {
    const plan = planTagChange('#before', '#after', ['before'])
    expect(plan.removed).toEqual(['before'])
    expect(plan.added).toEqual(['after'])
    expect(plan.tags).toEqual(['after'])
  })

  it('does not report a tag as added when it is already recorded', () => {
    const plan = planTagChange('#FAIR', 'still #FAIR and more', ['FAIR'])
    expect(plan.added).toEqual([])
  })
})

describe('planTagEdgeRemoval', () => {
  const tagNode = { id: 't1', title: '#genomics', node_type: 'tag' }
  const edge = (id: string, source: string, target: string) => ({
    id,
    source_node_id: source,
    target_node_id: target,
    link_type: 'tagged',
  })

  it('deletes the edge and the tag node when nothing else uses the tag', async () => {
    const { planTagEdgeRemoval } = await import('../lib/tagSync')
    const plan = planTagEdgeRemoval('n1', ['genomics'], [tagNode], [edge('e1', 'n1', 't1')])
    expect(plan.edgeIds).toEqual(['e1'])
    expect(plan.orphanTagNodeIds).toEqual(['t1'])
  })

  it('keeps the tag node while another note still uses it', async () => {
    const { planTagEdgeRemoval } = await import('../lib/tagSync')
    const plan = planTagEdgeRemoval(
      'n1',
      ['genomics'],
      [tagNode],
      [edge('e1', 'n1', 't1'), edge('e2', 'n2', 't1')]
    )
    expect(plan.edgeIds).toEqual(['e1'])
    expect(plan.orphanTagNodeIds).toEqual([])
  })

  it('matches a tag node however its title is cased or hashed', async () => {
    const { planTagEdgeRemoval } = await import('../lib/tagSync')
    const plan = planTagEdgeRemoval(
      'n1',
      ['Genomics'],
      [{ id: 't1', title: 'genomics', node_type: 'tag' }],
      [edge('e1', 'n1', 't1')]
    )
    expect(plan.edgeIds).toEqual(['e1'])
  })

  it('does nothing when no tag was withdrawn', async () => {
    const { planTagEdgeRemoval } = await import('../lib/tagSync')
    expect(planTagEdgeRemoval('n1', [], [tagNode], [edge('e1', 'n1', 't1')])).toEqual({
      edgeIds: [],
      orphanTagNodeIds: [],
    })
  })
})
