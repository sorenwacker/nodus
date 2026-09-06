/**
 * A live pan or zoom must not repaint the canvas's drop-shadow glow.
 *
 * The per-frame JavaScript is not what costs: culling and styling together
 * measured 0.015ms per frame over a steady pan of a real 360-node workspace,
 * against a 16.7ms budget. Paint is what costs, and `filter: drop-shadow()` is
 * the expensive part - it forces a paint pass per edge over a region larger
 * than the path. `.edge-highlighted` carries one in every theme, and the cyber
 * theme puts one on every visible edge
 * (PRODUCT_DESIGN.md > Painting while the viewport moves).
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const SHEETS = ['src/assets/main.css', 'src/canvas/styles/canvas-viewport.css']
const FILTERED = ['edge-line-visible', 'edge-line-fast', 'edge-highlighted', 'edge-selected']

function specificity(selector: string): number {
  const ids = (selector.match(/#[\w-]+/g) || []).length
  const classes =
    (selector.match(/\.[\w-]+/g) || []).length +
    (selector.match(/\[[^\]]+\]/g) || []).length +
    (selector.match(/:(?!not\b|is\b)(?!:)[\w-]+/g) || []).length
  const elements = (selector.match(/(?:^|[\s>+~])([a-z][\w-]*)/g) || []).length
  return ids * 10000 + classes * 100 + elements
}

interface Rule {
  selector: string
  body: string
  spec: number
  order: number
}

function rules(): Rule[] {
  const out: Rule[] = []
  let order = 0
  for (const file of SHEETS) {
    const css = readFileSync(resolve(process.cwd(), file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
    for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      for (const selector of m[1].split(',')) {
        if (!selector.trim()) continue
        out.push({ selector: selector.trim(), body: m[2], spec: specificity(selector), order: order++ })
      }
    }
  }
  return out
}

describe('paint suppression during a viewport gesture', () => {
  const all = rules().filter(r => /(^|[;\s])filter\s*:/.test(r.body))

  for (const cls of FILTERED) {
    it(`drops the filter on .${cls} while a gesture is live`, () => {
      const matching = all.filter(r => r.selector.includes(`.${cls}`))
      expect(matching.length).toBeGreaterThan(0)

      const winner = matching.reduce((a, b) =>
        b.spec > a.spec || (b.spec === a.spec && b.order > a.order) ? b : a
      )

      expect(
        winner.selector.includes('gesture-active') && /filter\s*:\s*none/.test(winner.body),
        `.${cls} keeps its filter during a gesture: "${winner.selector}" (${winner.spec}) wins. ` +
          `Rules: ${matching.map(r => `${r.selector} (${r.spec})`).join(' | ')}`
      ).toBe(true)
    })
  }
})
