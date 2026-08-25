/**
 * Frontmatter is recognised the same way everywhere.
 *
 * A file written with CRLF line endings begins `---\r\n`. contentParser tested
 * for `---\n` and treated the whole document as body, while extraction.ts used
 * a regex that tolerates the carriage return - so the same file had its
 * metadata parsed AND its YAML block rendered as visible text.
 */
import { describe, it, expect } from 'vitest'
import { splitFrontmatter, stripFrontmatter, upsertFrontmatterField } from '../lib/contentParser'
import { extractFrontmatterTitle } from '../lib/extraction'

const CRLF = '---\r\ntitle: Snellius\r\ntype: Note\r\n---\r\n\r\nBody text with [[links]].\r\n'
const LF = '---\ntitle: Snellius\ntype: Note\n---\n\nBody text with [[links]].\n'

describe('CRLF frontmatter', () => {
  it('is split out of the body, as LF frontmatter is', () => {
    const { frontmatter, body } = splitFrontmatter(CRLF)

    expect(frontmatter).toBeTruthy()
    expect(body).toContain('Body text')
    expect(body).not.toContain('title: Snellius')
  })

  it('is not rendered as visible text', () => {
    expect(stripFrontmatter(CRLF)).not.toContain('title: Snellius')
  })

  it('agrees with the extractor that reads the same block', () => {
    // One file, two readers: they must not disagree about whether it has
    // frontmatter
    expect(extractFrontmatterTitle(CRLF)).toBe('Snellius')
    expect(splitFrontmatter(CRLF).frontmatter).toBeTruthy()
  })

  it('keeps LF files working exactly as before', () => {
    const { frontmatter, body } = splitFrontmatter(LF)
    expect(frontmatter).toBeTruthy()
    expect(body).toContain('Body text')
  })

  it('updates a field in a CRLF file without duplicating the block', () => {
    const updated = upsertFrontmatterField(CRLF, 'date', '2026-08-25')

    expect(updated.match(/^---/gm)?.length).toBe(2)
    expect(updated).toContain('date: 2026-08-25')
    expect(updated).toContain('Body text')
  })
})
