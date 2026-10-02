/**
 * The colour bar sits in the part of the canvas left free
 * (PRODUCT_DESIGN.md > Placing the colour bar).
 *
 * It was centred on the whole canvas, so with the reader open it ran under the
 * reader, and it lay over the minimap. jsdom computes no layout, so these
 * check the rules the placement rests on.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const SRC = join(__dirname, '..')
const component = readFileSync(join(SRC, 'canvas/components/CanvasColorBar.vue'), 'utf8')
const style = component.slice(component.indexOf('<style'))
const overlays = readFileSync(join(SRC, 'canvas/styles/canvas-overlays.css'), 'utf8')
const minimapSource = readFileSync(join(SRC, 'canvas/composables/viewport/useMinimap.ts'), 'utf8')

function declarations(selector: string, css: string): string {
  const start = css.indexOf(`${selector} {`)
  expect(start, `no rule ${selector}`).toBeGreaterThan(-1)
  return css.slice(start, css.indexOf('}', start))
}

function px(text: string, pattern: RegExp): number {
  const match = pattern.exec(text)
  expect(match, `no match for ${pattern}`).not.toBeNull()
  return Number(match![1])
}

describe('the colour bar', () => {
  const bar = declarations('.collapsed-color-bar', style)

  it('is centred between what covers the canvas on the left and on the right', () => {
    expect(bar).toMatch(/--bar-left:[^;]*--canvas-chat-inset[^;]*--bar-preview-inset/)
    expect(bar).toMatch(/--bar-right:[^;]*--canvas-right-inset[^;]*--bar-minimap-inset/)
    expect(bar).toMatch(/left:\s*calc\(var\(--bar-left\) \+ \(100% - var\(--bar-left\) - var\(--bar-right\)\) \/ 2\)/)
    expect(bar).not.toMatch(/left:\s*50%/)
  })

  it('wraps inside that part instead of running under what borders it', () => {
    expect(bar).toMatch(/max-width:\s*calc\(100% - var\(--bar-left\) - var\(--bar-right\)\)/)
    expect(bar).toMatch(/flex-wrap:\s*wrap/)
  })

  it('makes room for the preview panel only while it is shown, by its real width', () => {
    const rule = declarations('.canvas-viewport:has(.node-preview-panel) .collapsed-color-bar', style)
    const panel = declarations('.node-preview-panel', overlays)
    const reserved = px(rule, /--bar-preview-inset:\s*(\d+)px/)
    const occupied = px(panel, /left:\s*calc\((\d+)px/) + px(panel, /width:\s*(\d+)px/)

    expect(reserved).toBeGreaterThanOrEqual(occupied)
    expect(reserved - occupied).toBeLessThanOrEqual(16)
  })

  it('makes room for the minimap only while it is shown, by its real width', () => {
    const rule = declarations('.canvas-viewport:has(.minimap) .collapsed-color-bar', style)
    const reserved = px(rule, /--bar-minimap-inset:\s*(\d+)px/)
    const occupied = px(minimapSource, /const MINIMAP_SIZE = (\d+)/) + px(declarations('.minimap', overlays), /right:\s*calc\((\d+)px/)

    expect(reserved).toBeGreaterThanOrEqual(occupied)
    expect(reserved - occupied).toBeLessThanOrEqual(16)
  })

  it('moves with the reader as it slides', () => {
    expect(bar).toMatch(/transition:[^;]*left[^;]*--inset-duration/)
  })
})
