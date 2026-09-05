/**
 * The neighbour highlight must win the cascade.
 *
 * The highlight is a border-color and a box-shadow on .node-card.neighbor-highlighted.
 * The light-mode collapsed-card rules set both properties at a far higher
 * specificity, so a collapsed card kept the class and painted none of it: the
 * selected node still showed its ring (a .collapsed.selected rule restores it)
 * while its neighbours went dark
 * (docs/content/features.md > Neighbor Highlighting).
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const SHEETS = ['src/assets/main.css', 'src/canvas/styles/node-card.css']

/** a-b-c specificity of a single compound selector, as a comparable number. */
function specificity(selector: string): number {
  const s = selector.trim()
  const ids = (s.match(/#[\w-]+/g) || []).length
  // :not(...) contributes its argument, not itself
  const classes =
    (s.match(/\.[\w-]+/g) || []).length +
    (s.match(/\[[^\]]+\]/g) || []).length +
    (s.match(/:(?!not\b)(?!:)[\w-]+/g) || []).length
  const elements = (s.match(/(?:^|[\s>+~])([a-z][\w-]*)/g) || []).length
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

/** Does this selector apply to a light-theme, collapsed, neighbour-highlighted, unselected card? */
function matchesCollapsedNeighborCard(selector: string): boolean {
  const s = selector.trim()
  if (!s.includes('.node-card')) return false
  // A theme-specific rule for a theme we are not in does not apply
  if (/\[data-theme='(dark|pitch-black|cyber)'\]\s/.test(s)) return false
  // Rules requiring a state this card is not in
  if (s.includes('.selected') && !s.includes(":not(.selected)")) return false
  if (s.includes(':hover') || s.includes('.dragging') || s.includes('.editing')) return false
  if (s.includes('.neighborhood-mode') || s.includes('.neighborhood-focus')) return false
  if (s.includes('.tag-node') || s.includes('.ai-working') || s.includes('.hover-highlighted')) return false
  // A rule scoped to a descendant of the card styles something else
  if (/\.node-card[^\s]*\s+\S/.test(s)) return false
  return true
}

describe('neighbour highlight cascade', () => {
  const all = rules().filter(r => matchesCollapsedNeighborCard(r.selector))

  for (const property of ['border-color', 'box-shadow']) {
    it(`lets the neighbour highlight win ${property} on a collapsed light-mode card`, () => {
      const setters = all.filter(r => new RegExp(`(^|[;\\s])${property}\\s*:`).test(r.body))
      expect(setters.length).toBeGreaterThan(0)

      const winner = setters.reduce((a, b) =>
        b.spec > a.spec || (b.spec === a.spec && b.order > a.order) ? b : a
      )

      expect(
        winner.selector.includes('.neighbor-highlighted'),
        `${property} on a collapsed neighbour card is decided by "${winner.selector}", ` +
          `which is not the neighbour highlight. Competing rules: ` +
          setters.map(r => `${r.selector} (${r.spec})`).join(' | ')
      ).toBe(true)
    })
  }
})
