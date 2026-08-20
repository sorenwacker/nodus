/**
 * Gate tests for the canvas overlay inset contract (PRODUCT_DESIGN.md >
 * Canvas Features): every overlay offset by --canvas-right-inset must time its
 * transition with --inset-duration, which App sets to 0s while the storyline
 * panel's separator is being dragged. Without that, overlays animate behind
 * the pointer during a manual resize and rubber-band when it stops.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'

const SRC = resolve(__dirname, '..')

function sourceFiles(dir: string): string[] {
  const found: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === '__tests__' || entry.name === 'node_modules') continue
      found.push(...sourceFiles(path))
    } else if (entry.name.endsWith('.css') || entry.name.endsWith('.vue')) {
      found.push(path)
    }
  }
  return found
}

/** CSS rule blocks that position something with the right inset variable */
function insetRuleBlocks(): Array<{ file: string; block: string }> {
  const blocks: Array<{ file: string; block: string }> = []
  for (const file of sourceFiles(SRC)) {
    const text = readFileSync(file, 'utf8')
    for (const block of text.split('}')) {
      if (block.includes('var(--canvas-right-inset')) {
        blocks.push({ file, block })
      }
    }
  }
  return blocks
}

describe('canvas overlay inset contract', () => {
  it('finds the overlays that track the storyline panel width', () => {
    const blocks = insetRuleBlocks()
    expect(blocks.length, 'no rules read --canvas-right-inset').toBeGreaterThanOrEqual(2)
  })

  it('times every inset transition with --inset-duration', () => {
    for (const { file, block } of insetRuleBlocks()) {
      // A rule may position without transitioning at all; only rules that do
      // animate the offset must use the drag-aware duration
      if (!/transition:[^;]*\bright\b/.test(block)) continue
      expect(
        block.includes('var(--inset-duration'),
        `${file}: transitions 'right' with --canvas-right-inset but not via var(--inset-duration), so it will lag behind a panel drag`
      ).toBe(true)
    }
  })

  it('offsets left-anchored overlays by the agent panel width', () => {
    // The agent panel occupies the canvas's left edge, so overlays anchored
    // there must clear it; a missed one sits underneath the panel
    const leftAnchored = [
      '.node-preview-panel',
      '.citation-fetch-progress',
      '.edge-filters',
      '.hover-tooltip',
    ]
    // A selector can be declared in more than one stylesheet; every
    // declaration that actually anchors to the left must carry the inset
    const anchoring = new Map<string, number>()
    for (const file of sourceFiles(SRC)) {
      const text = readFileSync(file, 'utf8')
      for (const selector of leftAnchored) {
        let at = text.indexOf(`${selector} {`)
        while (at !== -1) {
          const block = text.slice(at, text.indexOf('}', at))
          if (/(^|\n)\s*left:/.test(block)) {
            anchoring.set(selector, (anchoring.get(selector) ?? 0) + 1)
            expect(
              block.includes('var(--canvas-chat-inset'),
              `${file}: ${selector} anchors left without clearing the agent panel`
            ).toBe(true)
          }
          at = text.indexOf(`${selector} {`, at + 1)
        }
      }
    }

    for (const selector of leftAnchored) {
      expect(anchoring.get(selector), `${selector} has no left-anchoring rule`).toBeGreaterThan(0)
    }
  })

  it('leaves right-anchored overlays free of the agent panel inset', () => {
    // The panel is on the left; insetting the minimap or zoom controls pushes
    // them away from the edge for no reason
    for (const { file, block } of insetRuleBlocks()) {
      expect(
        block.includes('var(--canvas-chat-inset'),
        `${file}: right-anchored overlay must not use the left panel inset`
      ).toBe(false)
    }
  })

  it('App publishes --inset-duration as 0s while the panel is being resized', () => {
    const app = readFileSync(join(SRC, 'App.vue'), 'utf8')

    // The variable reaches the overlays through the canvas container's style
    expect(app, 'App does not publish --inset-duration to the overlays').toContain(
      "'--inset-duration'"
    )

    // ...and its value collapses to 0s while the separator is dragged
    const definition = app.indexOf('const insetDuration')
    expect(definition, 'no insetDuration computed in App').toBeGreaterThan(-1)
    const body = app.slice(definition, definition + 240)
    expect(body, 'insetDuration ignores the panel resize state').toMatch(/resizing/)
    expect(body, 'insetDuration does not collapse to 0s during a drag').toContain("'0s'")
  })
})
