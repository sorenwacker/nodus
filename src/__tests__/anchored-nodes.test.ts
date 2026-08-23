/**
 * Anchored nodes (PRODUCT_DESIGN.md > Anchored nodes).
 *
 * A note about a passage belongs at that passage. The anchor is the wikilink
 * in the text, so it survives editing anywhere else in the document.
 */
import { describe, it, expect } from 'vitest'
import { renderMarkdown } from '../services/MarkdownRenderService'
import { commentAnchorTitle, anchorCommentInText } from '../lib/anchoredNodes'

const nodes: Record<string, { id: string; title: string; markdown: string }> = {
  'check lumi quota': {
    id: 'n1',
    title: 'Check LUMI quota',
    markdown: 'The quota is **not** confirmed yet. See [[Snellius]].',
  },
  snellius: { id: 'n2', title: 'Snellius', markdown: 'The national supercomputer.' },
}

const anchoredNode = (target: string) => nodes[target.toLowerCase()] ?? null
const wikilinkExists = (target: string) => anchoredNode(target) !== null

describe('anchored node expansion', () => {
  it('expands a wikilink into a callout where the link sits', () => {
    const html = renderMarkdown('Local clusters are shared. [[Check LUMI quota]]\n', {
      wikilinkExists,
      anchoredNode,
    })

    expect(html).toContain('anchored-node')
    expect(html).toContain('Check LUMI quota')
    expect(html).toContain('quota is')
    // The surrounding sentence is untouched, so the note stays where it belongs
    expect(html).toContain('Local clusters are shared.')
  })

  it('leaves links inline when no expansion is requested', () => {
    const html = renderMarkdown('See [[Snellius]].', { wikilinkExists })

    expect(html).toContain('wikilink')
    expect(html).not.toContain('anchored-node')
  })

  it('expands one level only', () => {
    // Two nodes referencing each other would otherwise expand forever
    const html = renderMarkdown('[[Check LUMI quota]]', { wikilinkExists, anchoredNode })

    // The inner link stays a link: its content must not appear at all
    expect(html).not.toContain('The national supercomputer.')
    expect(html).toContain('data-target="Snellius"')
    expect(html.match(/anchored-node/g)?.length).toBe(1)
  })

  it('leaves a missing target as a missing inline link', () => {
    const html = renderMarkdown('[[Nowhere]]', { wikilinkExists, anchoredNode })

    expect(html).toContain('missing')
    expect(html).not.toContain('anchored-node')
  })

  it('keeps the callout usable inside a paragraph', () => {
    // A block element inside <p> is closed by the parser and loses its styling
    const html = renderMarkdown('Text before [[Snellius]] text after.', {
      wikilinkExists,
      anchoredNode,
    })

    expect(html).not.toMatch(/<p>[^<]*<div class="anchored-node/)
  })

  it('carries the node id so the callout can be opened', () => {
    const html = renderMarkdown('[[Snellius]]', { wikilinkExists, anchoredNode })

    expect(html).toContain('n2')
  })
})

describe('anchoring a comment', () => {
  it('names the comment so a wikilink can reach it', () => {
    const title = commentAnchorTitle('The quota is not confirmed yet', [])
    expect(title).toContain('quota')
  })

  it('keeps the name unique, since a wikilink resolves by title', () => {
    const taken = ['Comment: the quota is not confirmed']
    const title = commentAnchorTitle('The quota is not confirmed', taken)

    expect(taken).not.toContain(title)
  })

  it('writes the link into the text it comments on', () => {
    const anchored = anchorCommentInText('Some prose about clusters.', 'Comment: quota')

    expect(anchored).toContain('Some prose about clusters.')
    expect(anchored).toContain('[[Comment: quota]]')
  })

  it('leaves an existing link alone rather than duplicating it', () => {
    const once = anchorCommentInText('Text [[Comment: quota]]', 'Comment: quota')

    expect(once.match(/\[\[Comment: quota\]\]/g)?.length).toBe(1)
  })
})
