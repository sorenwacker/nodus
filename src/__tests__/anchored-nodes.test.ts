/**
 * Anchored nodes (PRODUCT_DESIGN.md > Anchored nodes).
 *
 * A note about a passage belongs at that passage. The anchor is the wikilink
 * in the text, so it survives editing anywhere else in the document.
 */
import { describe, it, expect } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useNodesStore } from '../stores/nodes'
import { useStorylineMarkdownRendering } from '../composables/useStorylineMarkdownRendering'
import { commentAnchorTitle, anchorCommentInText } from '../lib/anchoredNodes'
import type { Node } from '../types'

const all = [
  { id: 'n1', title: 'Check LUMI quota', markdown_content: 'The quota is **not** confirmed yet. See [[Snellius]].' },
  { id: 'n2', title: 'Snellius', markdown_content: 'The national supercomputer.' },
] as Node[]

describe('links in the reader', () => {
  // Expanding links into callouts at full width inserted whole notes
  // mid-sentence: a chapter referenced inside a parenthesis opened there
  it('offers no switch that expands links into callouts', () => {
    setActivePinia(createPinia())
    expect(Object.keys(useStorylineMarkdownRendering())).not.toContain('expandAnchors')
  })

  it('renders a link to an existing node as an inline link', () => {
    setActivePinia(createPinia())
    useNodesStore().nodes = all
    const rendering = useStorylineMarkdownRendering()

    rendering.renderNodeContent({ id: 'x', title: 'X', markdown_content: 'Local clusters are shared (see [[Check LUMI quota]]).' } as Node)
    const html = rendering.getRenderedContent('x')

    expect(html).toContain('<a class="wikilink" data-target="Check LUMI quota">')
    expect(html).not.toContain('The quota is')
    // The sentence stays whole around the link
    expect(html).toContain('(see ')
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
