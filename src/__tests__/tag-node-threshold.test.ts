/**
 * A tag node earns its place by connecting notes.
 *
 * Materialising one per distinct tag put 606 tag nodes into a workspace holding
 * 360 real ones, and 542 of them - 89% - were reachable from a single note or
 * none. A tag used once connects nothing: it is a label on that note, which the
 * card already shows as a chip. The hubs worth drawing were the handful used
 * many times over: #person by 191 notes, #department by 42
 * (docs/content/features.md > Tags).
 */
import { describe, it, expect } from 'vitest'
import { MIN_NOTES_FOR_TAG_NODE, tagsWorthDrawing, countTagUsage } from '../lib/tagSync'
import type { Node } from '../types'

function note(id: string, tags: string[]): Node {
  return { id, title: id, node_type: 'note', tags: JSON.stringify(tags) } as unknown as Node
}

describe('countTagUsage', () => {
  it('counts the notes carrying each tag', () => {
    const counts = countTagUsage([note('a', ['x', 'y']), note('b', ['x']), note('c', [])])
    expect(counts.get('x')).toBe(2)
    expect(counts.get('y')).toBe(1)
  })

  it('counts a tag once per note, however often it appears', () => {
    expect(countTagUsage([note('a', ['x', 'x'])]).get('x')).toBe(1)
  })

  it('ignores tag nodes themselves and malformed tag fields', () => {
    const tagNode = { id: 't', title: '#x', node_type: 'tag', tags: '["x"]' } as unknown as Node
    const broken = { id: 'b', title: 'b', node_type: 'note', tags: '{oops' } as unknown as Node
    expect(countTagUsage([tagNode, broken, note('a', ['x'])]).get('x')).toBe(1)
  })

  it('folds case and a leading hash, so #Person and person are one tag', () => {
    expect(countTagUsage([note('a', ['#Person']), note('b', ['person'])]).get('person')).toBe(2)
  })
})

describe('tagsWorthDrawing', () => {
  it('keeps a tag that connects at least two notes', () => {
    const worth = tagsWorthDrawing([note('a', ['shared']), note('b', ['shared'])])
    expect(worth.has('shared')).toBe(true)
  })

  it('drops a tag only one note uses', () => {
    expect(tagsWorthDrawing([note('a', ['lonely'])]).has('lonely')).toBe(false)
  })

  it('uses the documented threshold', () => {
    const notes = Array.from({ length: MIN_NOTES_FOR_TAG_NODE }, (_, i) => note(`n${i}`, ['t']))
    expect(tagsWorthDrawing(notes).has('t')).toBe(true)
    expect(tagsWorthDrawing(notes.slice(0, -1)).has('t')).toBe(false)
  })
})
