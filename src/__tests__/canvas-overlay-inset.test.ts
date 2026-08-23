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

  it('offsets every left-anchored canvas overlay by the agent panel width', () => {
    // Previously this named four selectors, so the status bar - which holds the
    // agent log button - sat underneath the panel unnoticed. The rule is now
    // derived: any screen-anchored canvas overlay offset from the left edge
    // must clear the panel, and anything that legitimately does not is named
    // here with its reason.
    const exempt = new Map([
      // Lives inside the transformed canvas content, not anchored to the screen
      ['.frame-header', 'moves with the viewport, not the window'],
      // The control that unfolds the panel; it belongs at the window corner
      ['.agent-toggle-corner', 'is the panel toggle and must stay put'],
    ])

    const offenders: string[] = []
    for (const file of sourceFiles(SRC)) {
      if (!file.includes('/canvas/')) continue
      const text = readFileSync(file, 'utf8')
      for (const match of text.matchAll(/([.#][\w-]+)\s*\{([^}]*)\}/g)) {
        const [, selector, body] = match
        if (!/position:\s*(absolute|fixed)/.test(body)) continue
        if (!/z-index/.test(body)) continue
        const left = body.match(/(^|\n)\s*left:\s*([^;]+);/)
        if (!left) continue
        const value = left[2].trim()
        // Full-width layers and centred overlays are not anchored to the edge
        if (value === '0' || value.startsWith('50%') || value === 'auto') continue
        if (value.includes('--canvas-chat-inset')) continue
        if (exempt.has(selector)) continue
        offenders.push(`${file}: ${selector} (left: ${value})`)
      }
    }

    expect(offenders, 'left-anchored canvas overlays that sit under the agent panel').toEqual([])
  })

  it('animates every chat-inset consumer with the panel', () => {
    // The panel slides over 0.3s; an overlay that jumps its 380px instantly
    // reads as a glitch, not an animation
    const offenders: string[] = []
    for (const file of sourceFiles(SRC)) {
      const text = readFileSync(file, 'utf8')
      for (const block of text.split('}')) {
        if (!block.includes('var(--canvas-chat-inset')) continue
        if (!/(^|\n)\s*left:/.test(block)) continue
        if (!block.includes('var(--chat-inset-duration')) {
          offenders.push(file)
        }
      }
    }

    expect(offenders, 'left-anchored overlays that teleport when the panel folds').toEqual([])
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

  it('ends the agent panel above the timelines sheet', () => {
    const css = readFileSync(join(SRC, 'canvas/styles/llm-interface.css'), 'utf8')
    const at = css.indexOf('.graph-llm-bar {')
    const block = css.slice(at, css.indexOf('}', at))
    expect(
      /bottom:[^;]*var\(--canvas-bottom-inset/.test(block),
      'the agent panel ignores the timelines sheet and would sit behind it'
    ).toBe(true)
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
