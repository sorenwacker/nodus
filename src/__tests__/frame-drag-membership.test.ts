/**
 * A frame carries its members, not whatever is sitting on it.
 *
 * Membership for a frame drag was decided by 50% spatial overlap, so dragging a
 * frame carried unrelated nodes that happened to be on top of it and left
 * behind members that had been moved outside its bounds. Every other
 * frame-aware path uses frame_id, with no spatial fallback, because overlap
 * makes membership depend on where things happen to be
 * (PRODUCT_DESIGN.md > What belongs to a frame).
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const SOURCE = resolve(__dirname, '../canvas/composables/frames/useFrames.ts')

describe('what a frame drag carries', () => {
  const source = readFileSync(SOURCE, 'utf-8')

  it('selects by frame_id', () => {
    expect(source).toContain('node.frame_id === frame.id')
  })

  it('does no overlap-area test to decide membership', () => {
    // The exact shape of the defect: an area comparison against half the node
    expect(source).not.toMatch(/overlapArea\s*>\s*nodeArea\s*\*\s*0\.5/)
  })

  it('matches the rule the other frame-aware paths state', () => {
    // The layout and radial paths already refuse a spatial fallback
    for (const file of [
      '../canvas/composables/layout/useAutoLayout.ts',
      '../canvas/composables/frames/useFrameOperations.ts',
    ]) {
      const other = readFileSync(resolve(__dirname, file), 'utf-8')
      expect(other, `${file} decides membership by frame_id`).toMatch(/frame_id/)
    }
  })
})
