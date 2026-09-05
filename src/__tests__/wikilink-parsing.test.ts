/**
 * Wikilink syntax has one definition, and every view agrees on it.
 *
 * The pattern existed as five separate literals: the frontmatter parser, the
 * markdown renderer, the file-rename path, the references sidebar and the
 * fullscreen editor. They had already drifted over whether an empty alias
 * counts, so the same text was a clickable link in one view and plain prose in
 * another, and a rename that rewrote the link in one place left it stale in the
 * others (PRODUCT_DESIGN.md > One rule, one place).
 */
import { describe, it, expect } from 'vitest'
import {
  matchWikilinks,
  extractWikilinks,
  wikilinkPattern,
} from '../lib/contentParser'

describe('reading a wikilink', () => {
  it('reads a plain link', () => {
    expect(matchWikilinks('see [[Photosynthesis]] here')).toEqual([
      { target: 'Photosynthesis', alias: null, text: '[[Photosynthesis]]', index: 4 },
    ])
  })

  it('reads a link with display text', () => {
    const [link] = matchWikilinks('see [[Photosynthesis|the light reactions]]')
    expect(link.target).toBe('Photosynthesis')
    expect(link.alias).toBe('the light reactions')
  })

  it('trims the target, so a padded link resolves to the same node', () => {
    expect(matchWikilinks('[[  Photosynthesis  ]]')[0].target).toBe('Photosynthesis')
  })

  it('does not read an empty alias as a link', () => {
    // This is the case the copies disagreed on. Either answer is defensible;
    // what broke was two views giving different ones for the same text.
    expect(matchWikilinks('[[Photosynthesis|]]')).toEqual([])
  })

  it('reads every link in the text, in order', () => {
    const targets = matchWikilinks('[[A]] then [[B|b]] then [[C]]').map((l) => l.target)
    expect(targets).toEqual(['A', 'B', 'C'])
  })

  it('reports an offset and literal the rename path can rewrite from', () => {
    const content = 'intro [[Old Name|shown]] tail'
    const [link] = matchWikilinks(content)
    // The rename path splices by offset and length; if either is wrong it
    // corrupts the surrounding text instead of the link.
    const rewritten =
      content.slice(0, link.index) +
      `[[New Name|${link.alias}]]` +
      content.slice(link.index + link.text.length)
    expect(rewritten).toBe('intro [[New Name|shown]] tail')
  })

  it('lowercases targets for matching against node titles', () => {
    expect(extractWikilinks('[[Photosynthesis]] and [[ATP]]')).toEqual(
      new Set(['photosynthesis', 'atp'])
    )
  })
})

describe('the shared pattern', () => {
  it('gives each caller a matcher that starts from the beginning', () => {
    // A global regex carries lastIndex. Exported as a shared constant, the
    // second caller would resume from wherever the first stopped and silently
    // miss the links before that point - which is why this is a function.
    const content = '[[A]] [[B]]'
    const first = wikilinkPattern()
    expect(first.exec(content)?.[1]).toBe('A')
    expect(wikilinkPattern().exec(content)?.[1]).toBe('A')
  })
})
