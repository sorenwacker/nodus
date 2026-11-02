/**
 * Tags are not read from code
 * (PRODUCT_DESIGN.md > Tags are not read from code).
 *
 * The scan read the whole body, so the colour codes of a Mermaid diagram became
 * tags, tag nodes and edges between every note with a diagram.
 */
import { describe, it, expect, vi } from 'vitest'
import { extractHashtags } from '../lib/contentParser'
import { planCodeTagWithdrawal, withdrawCodeTags } from '../lib/tagSync'

const DIAGRAM = ['about #crops', '', '```mermaid', 'graph TD', '  classDef process fill:#f3e5f5', '```', '', 'and #models'].join(
  '\n'
)

describe('extractHashtags and code', () => {
  it('skips a fenced code block', () => {
    expect(extractHashtags(DIAGRAM)).toEqual(['crops', 'models'])
  })

  it('skips a block fenced with tildes and one left unclosed', () => {
    expect(extractHashtags('a #kept\n~~~\n#dropped\n~~~\n#also')).toEqual(['kept', 'also'])
    expect(extractHashtags('a #kept\n```\n#dropped\nstill code #gone')).toEqual(['kept'])
  })

  it('does not close a block on a shorter or different fence', () => {
    expect(extractHashtags('````\n```\n#inside\n~~~\n````\n#outside')).toEqual(['outside'])
  })

  it('skips an inline code span', () => {
    expect(extractHashtags('use `#fff` for white, tagged #design')).toEqual(['design'])
    expect(extractHashtags('a ``code with ` and #x`` then #y')).toEqual(['y'])
  })

  it('reads on after a stray backtick', () => {
    expect(extractHashtags("the ` key and #real\n\nlater `#code` and #other")).toEqual(['real', 'other'])
  })
})

function note(id: string, content: string, tags: string[], type = 'note') {
  return { id, node_type: type, markdown_content: content, tags: JSON.stringify(tags) }
}

describe('planCodeTagWithdrawal', () => {
  it('withdraws a recorded tag the text holds only inside code', () => {
    const plan = planCodeTagWithdrawal([note('a', DIAGRAM, ['crops', 'f3e5f5', 'models'])])
    expect(plan).toEqual([{ id: 'a', tags: ['crops', 'models'], removed: ['f3e5f5'] }])
  })

  it('keeps a tag the text also holds outside code', () => {
    expect(planCodeTagWithdrawal([note('a', 'tagged #x and `#x` in code', ['x'])])).toEqual([])
  })

  it('keeps a tag the text does not mention at all', () => {
    expect(planCodeTagWithdrawal([note('a', DIAGRAM, ['crops', 'by-hand'])])).toEqual([])
  })

  it('finds colour codes beyond the fiftieth hash in the text', () => {
    const many = Array.from({ length: 60 }, (_, i) => `#t${i}`).join(' ')
    const plan = planCodeTagWithdrawal([note('a', `${many}\n\`\`\`\nfill:#abcdef\n\`\`\``, ['abcdef'])])
    expect(plan[0].removed).toEqual(['abcdef'])
  })

  it('skips tag nodes, empty notes and a malformed tags field', () => {
    const broken = { id: 'b', node_type: 'note', markdown_content: DIAGRAM, tags: '{oops' }
    expect(
      planCodeTagWithdrawal([note('t', '`#x`', ['x'], 'tag'), { id: 'e', node_type: 'note', markdown_content: null, tags: null }, broken])
    ).toEqual([])
  })
})

describe('withdrawCodeTags', () => {
  it('writes the remaining tags, then withdraws the edges, and reports the count', async () => {
    const order: string[] = []
    const persist = vi.fn(async (id: string) => void order.push(`tags:${id}`))
    const removeEdges = vi.fn(async (id: string) => void order.push(`edges:${id}`))

    const count = await withdrawCodeTags(
      [note('a', DIAGRAM, ['crops', 'f3e5f5']), note('b', 'plain #x', ['x'])],
      persist,
      removeEdges
    )

    expect(count).toBe(1)
    expect(persist).toHaveBeenCalledWith('a', ['crops'])
    expect(removeEdges).toHaveBeenCalledWith('a', ['f3e5f5'])
    expect(order).toEqual(['tags:a', 'edges:a'])
  })

  it('writes nothing for a workspace already current', async () => {
    const persist = vi.fn()
    expect(await withdrawCodeTags([note('a', DIAGRAM, ['crops'])], persist, vi.fn())).toBe(0)
    expect(persist).not.toHaveBeenCalled()
  })

  it('carries on past a note that cannot be written', async () => {
    const persist = vi.fn(async (id: string) => {
      if (id === 'a') throw new Error('locked')
    })
    const removeEdges = vi.fn(async () => {})

    const count = await withdrawCodeTags(
      [note('a', '`#x`', ['x']), note('b', '`#y`', ['y'])],
      persist,
      removeEdges
    )

    expect(count).toBe(1)
    expect(removeEdges).toHaveBeenCalledTimes(1)
    expect(removeEdges).toHaveBeenCalledWith('b', ['y'])
  })
})
