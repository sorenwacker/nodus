/**
 * Chunking always makes progress.
 *
 * The next chunk started at `max(0, breakPoint - overlap)`. With an overlap at
 * least as large as the break point that is 0, so `remaining` never shrank and
 * the loop never terminated - a hang, not a slowdown
 * (PRODUCT_DESIGN.md > Splitting text into chunks).
 */
import { describe, it, expect } from 'vitest'
import { splitIntoChunks } from '../lib/textProcessing'

const PROSE = 'The quick brown fox jumps over the lazy dog. '.repeat(40)

describe('splitIntoChunks', () => {
  it('terminates when the overlap is larger than the chunk', () => {
    // Would never return before the fix, so the assertion is reaching it at all
    const chunks = splitIntoChunks(PROSE, 100, 200)

    expect(chunks.length).toBeGreaterThan(0)
    expect(chunks.join('')).not.toBe('')
  })

  it('terminates when the overlap equals the chunk size', () => {
    const chunks = splitIntoChunks(PROSE, 100, 100)

    expect(chunks.length).toBeGreaterThan(0)
  })

  it('terminates when the overlap is half the chunk size', () => {
    // The break point can be as low as maxSize * 0.5, so this is the boundary
    const chunks = splitIntoChunks(PROSE, 100, 50)

    expect(chunks.length).toBeGreaterThan(0)
  })

  it('covers the whole text', () => {
    const chunks = splitIntoChunks(PROSE, 200, 20)

    expect(chunks.length).toBeGreaterThan(1)
    // Every chunk carries content, and the last of the text is reached
    expect(chunks.every(c => c.length > 0)).toBe(true)
    expect(chunks[chunks.length - 1]).toContain('dog')
  })

  it('returns the text unchanged when it fits', () => {
    expect(splitIntoChunks('short', 100, 20)).toEqual(['short'])
  })
})
