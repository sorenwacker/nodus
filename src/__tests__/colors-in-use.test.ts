/**
 * The row of colours in use offers only what the presets do not.
 *
 * It collected every stored colour and consulted the palette only to borrow a
 * display value, so a node coloured from the bar reappeared directly above the
 * identical preset - repeating the same choice twice and crowding out the
 * custom colours the row exists for
 * (PRODUCT_DESIGN.md > The colour a node is given).
 */
import { describe, it, expect } from 'vitest'
import { colorsInUseFor, type PaletteColor } from '../canvas/utils/nodeColors'

const palette: PaletteColor[] = [
  { value: null, display: null },
  { value: 'red', display: 'rgba(239, 68, 68, 0.18)' },
  { value: 'blue', display: 'rgba(59, 130, 246, 0.18)' },
]

describe('colorsInUseFor', () => {
  it('leaves out a colour the presets already offer', () => {
    expect(colorsInUseFor(['red'], palette)).toEqual([])
  })

  it('is empty when every colour in use is a preset', () => {
    expect(colorsInUseFor(['red', 'blue', 'red'], palette)).toEqual([])
  })

  it('offers a colour the presets do not carry', () => {
    expect(colorsInUseFor(['#abcdef'], palette)).toEqual([
      { value: '#abcdef', display: '#abcdef' },
    ])
  })

  it('offers a colour this theme does not carry, being unreachable otherwise', () => {
    const cyber: PaletteColor[] = [{ value: 'neon', display: '#ff00ff' }]
    expect(colorsInUseFor(['red'], cyber)).toEqual([{ value: 'red', display: 'red' }])
  })

  it('ignores nodes and frames carrying no colour', () => {
    expect(colorsInUseFor([null, undefined, '', '#abcdef'], palette)).toEqual([
      { value: '#abcdef', display: '#abcdef' },
    ])
  })
})
