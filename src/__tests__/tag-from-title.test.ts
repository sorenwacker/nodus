/**
 * Turning a group name into a tag (docs/design/remove-frames.md > Existing data).
 *
 * The hashtag rule is `[a-zA-Z0-9][\w-]*`, at most 50 characters, ASCII only.
 * Frame titles and names an agent chooses are free text, so they are
 * converted rather than rejected.
 */
import { describe, it, expect } from 'vitest'
import { toTag, extractHashtags } from '../lib/contentParser'

describe('toTag', () => {
  it.each([
    ['Demo Project', 'demo-project'],
    ['Definitions (Art. 3)', 'definitions-art-3'],
    ['Kapitel 1-30', 'kapitel-1-30'],
    ['Befunde Konsistenzprüfung', 'befunde-konsistenzpruefung'],
    ['Straße der Größe', 'strasse-der-groesse'],
    ['  --Figuren--  ', 'figuren'],
    ['snake_case stays', 'snake_case-stays'],
  ])('converts %j to %j', (title, tag) => {
    expect(toTag(title)).toBe(tag)
  })

  it('cuts to 50 characters without leaving a trailing hyphen', () => {
    const tag = toTag('Befunde Konsistenzprüfung 260901 (H und M behoben 260902)')
    expect(tag.length).toBeLessThanOrEqual(50)
    expect(tag.endsWith('-')).toBe(false)
  })

  it('yields nothing for a name with no usable characters', () => {
    expect(toTag('(( ))')).toBe('')
  })

  it('produces tags the hashtag rule reads back whole', () => {
    for (const title of ['Demo Project', 'Definitions (Art. 3)', 'Kapitel 1-30']) {
      const tag = toTag(title)
      expect(extractHashtags(`#${tag}`)).toEqual([tag])
    }
  })
})
