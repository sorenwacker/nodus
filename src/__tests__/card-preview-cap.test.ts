/**
 * A card renders far more text than it can show.
 *
 * The cap was a flat 4000 characters, but a 200x120 card displays about 162 -
 * 27 per line over 6 lines. Measured across 400 real nodes, the flat cap built
 * 38 DOM elements per card against 7 for a cap sized to the card, and the worst
 * node built 275 elements to show six lines. That cost is paid on every card
 * that crosses the viewport while panning
 * (PRODUCT_DESIGN.md > Rendering node content).
 */
import { describe, it, expect } from 'vitest'
import { capForCard, previewForCard, CARD_PREVIEW_LIMIT } from '../lib/cardPreview'
import { NODE_DEFAULTS } from '../canvas/constants'

describe('capForCard', () => {
  it('sizes a default card far below the old flat cap', () => {
    const cap = capForCard(NODE_DEFAULTS.WIDTH, NODE_DEFAULTS.HEIGHT)
    expect(cap).toBeLessThan(CARD_PREVIEW_LIMIT / 4)
  })

  it('gives a larger card a larger cap', () => {
    expect(capForCard(400, 400)).toBeGreaterThan(capForCard(200, 120))
  })

  it('never exceeds the flat cap, however large the card', () => {
    expect(capForCard(20000, 20000)).toBe(CARD_PREVIEW_LIMIT)
  })

  it('keeps a floor so a tiny card still shows something', () => {
    expect(capForCard(10, 10)).toBeGreaterThanOrEqual(200)
  })

  it('scales with the font, because bigger text fits less', () => {
    expect(capForCard(200, 120, 2)).toBeLessThan(capForCard(200, 120, 1))
  })

  it('treats a missing size as the default card', () => {
    expect(capForCard(undefined, undefined)).toBe(capForCard(NODE_DEFAULTS.WIDTH, NODE_DEFAULTS.HEIGHT))
  })
})

describe('previewForCard with a cap', () => {
  const long = Array.from({ length: 200 }, (_, i) => `line ${i} of the document`).join('\n')

  it('cuts to the cap it is given', () => {
    const small = previewForCard(long, 300)
    const large = previewForCard(long, 2000)
    expect(small.text.length).toBeLessThan(large.text.length)
    expect(small.truncated).toBe(true)
  })

  it('still marks that the text continues', () => {
    expect(previewForCard(long, 200).truncated).toBe(true)
  })

  it('does not truncate content that fits', () => {
    expect(previewForCard('short note', 300)).toEqual({ text: 'short note', truncated: false })
  })

  it('falls back to the flat cap when given none', () => {
    expect(previewForCard(long).text.length).toBeLessThanOrEqual(CARD_PREVIEW_LIMIT + 200)
  })
})
