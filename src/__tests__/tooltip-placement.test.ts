/**
 * Tooltip placement (PRODUCT_DESIGN.md > Tooltip placement).
 *
 * Tooltips used to be placed by a default direction plus one override per
 * edge-anchored container, so every container nobody thought about clipped its
 * labels at the window edge. Placement is now measured, and these tests hold it
 * to the property that made the old approach fail: the tooltip is on screen.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { placeTooltip, TOOLTIP_GAP } from '../lib/tooltipPlacement'

const VIEWPORT = { width: 1280, height: 800 }
const TOOLTIP = { width: 180, height: 32 }

function trigger(x: number, y: number, width = 32, height = 32) {
  return { left: x, top: y, right: x + width, bottom: y + height, width, height }
}

describe('placeTooltip', () => {
  it('prefers below the trigger when there is room', () => {
    const placed = placeTooltip(trigger(600, 300), TOOLTIP, VIEWPORT)

    expect(placed.top).toBeGreaterThan(300)
    expect(placed.side).toBe('bottom')
  })

  it('flips above when the trigger sits at the bottom of the window', () => {
    const placed = placeTooltip(trigger(600, VIEWPORT.height - 40), TOOLTIP, VIEWPORT)

    expect(placed.side).toBe('top')
    expect(placed.top + TOOLTIP.height).toBeLessThanOrEqual(VIEWPORT.height)
  })

  it('stays on screen for a trigger in any corner', () => {
    const corners = [
      trigger(0, 0),
      trigger(VIEWPORT.width - 32, 0),
      trigger(0, VIEWPORT.height - 32),
      trigger(VIEWPORT.width - 32, VIEWPORT.height - 32),
    ]

    for (const rect of corners) {
      const placed = placeTooltip(rect, TOOLTIP, VIEWPORT)
      expect(placed.left).toBeGreaterThanOrEqual(0)
      expect(placed.top).toBeGreaterThanOrEqual(0)
      expect(placed.left + TOOLTIP.width).toBeLessThanOrEqual(VIEWPORT.width)
      expect(placed.top + TOOLTIP.height).toBeLessThanOrEqual(VIEWPORT.height)
    }
  })

  it('stays on screen along every edge, at every offset', () => {
    // The bug this replaces appeared wherever nobody had written a rule, so the
    // property is checked across the whole window rather than at chosen points
    for (let x = 0; x <= VIEWPORT.width - 32; x += 37) {
      for (const y of [0, VIEWPORT.height / 2, VIEWPORT.height - 32]) {
        const placed = placeTooltip(trigger(x, y), TOOLTIP, VIEWPORT)
        expect(placed.left).toBeGreaterThanOrEqual(0)
        expect(placed.left + TOOLTIP.width).toBeLessThanOrEqual(VIEWPORT.width)
        expect(placed.top).toBeGreaterThanOrEqual(0)
        expect(placed.top + TOOLTIP.height).toBeLessThanOrEqual(VIEWPORT.height)
      }
    }
  })

  it('honours a requested side only while it stays on screen', () => {
    const roomy = placeTooltip(trigger(600, 400), TOOLTIP, VIEWPORT, 'left')
    expect(roomy.side).toBe('left')

    // Against the left edge the request cannot be met, so it is overruled
    const cramped = placeTooltip(trigger(4, 400), TOOLTIP, VIEWPORT, 'left')
    expect(cramped.side).not.toBe('left')
    expect(cramped.left).toBeGreaterThanOrEqual(0)
  })

  it('clears the trigger by the gap on the side it uses', () => {
    const below = placeTooltip(trigger(600, 300), TOOLTIP, VIEWPORT)
    expect(below.top).toBe(300 + 32 + TOOLTIP_GAP)
  })

  it('survives a tooltip larger than the window', () => {
    const huge = { width: VIEWPORT.width + 200, height: 40 }
    const placed = placeTooltip(trigger(600, 300), huge, VIEWPORT)

    // Pinned to the near edge instead of drifting off it
    expect(placed.left).toBeGreaterThanOrEqual(0)
    expect(placed.left).toBeLessThanOrEqual(TOOLTIP_GAP)
  })
})

describe('tooltip mechanism', () => {
  const styleFiles: string[] = []
  function collectStyles(dir: string) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) collectStyles(path)
      else if (entry.name.endsWith('.css')) styleFiles.push(path)
    }
  }
  collectStyles(resolve(__dirname, '..'))

  it('has no stylesheet placing a tooltip through a pseudo-element', () => {
    // Per-container placement rules are what produced clipped tooltips: each
    // one is a guess about a container nobody re-measured
    const offenders = styleFiles.filter(file => {
      const css = readFileSync(file, 'utf-8')
      return /\[data-tooltip[^\]]*\][^{]*::(after|before)/.test(css)
    })

    expect(offenders).toEqual([])
  })

  it('is mounted once for the whole application', () => {
    const app = readFileSync(resolve(__dirname, '../App.vue'), 'utf-8')
    expect(app).toContain('TooltipLayer')
  })
})

describe('tooltip text', () => {
  const vueFiles: string[] = []
  function collect(dir: string) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) collect(path)
      else if (entry.name.endsWith('.vue')) vueFiles.push(path)
    }
  }
  collect(resolve(__dirname, '..'))

  it('never hardcodes tooltip text', () => {
    // A literal string cannot be translated
    const offenders: string[] = []
    for (const file of vueFiles) {
      const source = readFileSync(file, 'utf-8')
      for (const match of source.matchAll(/\sdata-tooltip="([^"]+)"/g)) {
        offenders.push(`${file}: ${match[1]}`)
      }
    }

    expect(offenders).toEqual([])
  })
})
