/**
 * A colour written by an agent or an importer is recognised as the colour it
 * was meant to be (PRODUCT_DESIGN.md > The colour a node is given).
 *
 * The agent tools offered eight saturated hex values and the ontology importer
 * wrote a ninth onto every class node. None appeared in any palette, so
 * getNodeBackground layered an opaque colour over the surface and the card
 * became a solid slab that ignored the theme.
 */
import { describe, it, expect } from 'vitest'
import { getNodeBackground } from '../canvas/utils/nodeColors'

function layered(tint: string): string {
  return `linear-gradient(${tint}, ${tint}), var(--bg-surface)`
}

describe('a colour an agent or importer wrote', () => {
  const WRITTEN: Array<[string, string]> = [
    ['#ef4444', 'rgba(239, 68, 68, 0.28)'],
    ['#f97316', 'rgba(249, 115, 22, 0.28)'],
    ['#eab308', 'rgba(234, 179, 8, 0.28)'],
    ['#22c55e', 'rgba(34, 197, 94, 0.28)'],
    ['#3b82f6', 'rgba(59, 130, 246, 0.28)'],
    ['#8b5cf6', 'rgba(168, 85, 247, 0.28)'],
    ['#ec4899', 'rgba(236, 72, 153, 0.28)'],
    // The ontology importer's "purple for classes"
    ['#9333ea', 'rgba(168, 85, 247, 0.28)'],
  ]

  it.each(WRITTEN)('renders %s as a tint rather than a slab', (raw, tint) => {
    expect(getNodeBackground(raw, 'light')).toBe(layered(tint))
  })

  it('recognises grey without offering it', () => {
    // Not a palette colour, but a node already carrying it must not be a slab
    expect(getNodeBackground('#6b7280', 'light')).toBe(layered('rgba(107, 114, 128, 0.28)'))
  })

  it('converts a recognised colour for a dark theme', () => {
    expect(getNodeBackground('#3b82f6', 'dark')).toBe(layered('#003d4d'))
  })
})

describe('colours that are already right are left alone', () => {
  it('keeps a cyber palette value as it is', () => {
    expect(getNodeBackground('#4d1f30', 'dark')).toBe(layered('#4d1f30'))
  })

  it('keeps a value no palette knows', () => {
    // Clamping arbitrary hex is a separate question; this pins the scope
    expect(getNodeBackground('#d0d0d0', 'light')).toBe(layered('#d0d0d0'))
  })

  it('returns nothing for a node with no colour', () => {
    expect(getNodeBackground(null, 'light')).toBeUndefined()
  })
})
