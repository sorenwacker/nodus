/**
 * The neighbour highlight must win the cascade, in every theme and whether the
 * card is expanded or collapsed.
 *
 * The highlight is a border-color and a box-shadow on
 * .node-card.neighbor-highlighted. Several theme rules set those same two
 * properties at a higher specificity, so the class was applied and painted
 * nothing: the selected node still showed its ring, because a .collapsed.selected
 * rule restores it, while its neighbours went dark
 * (docs/content/features.md > Neighbor Highlighting).
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const SHEETS = ['src/assets/main.css', 'src/canvas/styles/node-card.css']
const THEMES = ['light', 'dark', 'pitch-black', 'cyber'] as const
const PROPERTIES = ['border-color', 'box-shadow'] as const

/** a-b-c specificity of one compound selector, as a comparable number. */
function specificity(selector: string): number {
  const ids = (selector.match(/#[\w-]+/g) || []).length
  // :not(...) contributes its argument, not itself
  const classes =
    (selector.match(/\.[\w-]+/g) || []).length +
    (selector.match(/\[[^\]]+\]/g) || []).length +
    (selector.match(/:(?!not\b)(?!:)[\w-]+/g) || []).length
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

/** Does this selector apply to a neighbour-highlighted, unselected card in this theme and state? */
function applies(selector: string, theme: string, collapsed: boolean): boolean {
  if (!selector.includes('.node-card')) return false
  // Scoped to a descendant of the card: styles something else
  if (/\.node-card[^\s,]*\s+\S/.test(selector)) return false

  for (const guard of selector.match(/\[data-theme='[\w-]+'\]/g) || []) {
    const name = guard.match(/'([\w-]+)'/)![1]
    const negated = selector.includes(`:not(${guard})`)
    if (negated && name === theme) return false
    if (!negated && name !== theme) return false
  }
  // A bare :root prefix with no theme guard is the default (light) theme
  if (selector.includes(':root') && theme !== 'light' && !/\[data-theme=/.test(selector)) return false

  if (selector.includes('.collapsed') && !collapsed) return false
  if (selector.includes('.selected') && !selector.includes(':not(.selected)')) return false
  return !/:hover|\.dragging|\.editing|\.resizing|\.neighborhood-|\.tag-node|\.ai-working|\.hover-highlighted|\.text-hidden/.test(
    selector
  )
}

describe('neighbour highlight cascade', () => {
  const all = rules()

  for (const theme of THEMES) {
    for (const collapsed of [false, true]) {
      const state = collapsed ? 'collapsed' : 'expanded'
      for (const property of PROPERTIES) {
        it(`lets the neighbour highlight win ${property} on a ${state} ${theme} card`, () => {
          const setters = all.filter(
            r => applies(r.selector, theme, collapsed) && new RegExp(`(^|[;\\s])${property}\\s*:`).test(r.body)
          )
          expect(setters.length).toBeGreaterThan(0)

          const winner = setters.reduce((a, b) =>
            b.spec > a.spec || (b.spec === a.spec && b.order > a.order) ? b : a
          )

          expect(
            winner.selector.includes('.neighbor-highlighted'),
            `${property} on a ${state} ${theme} neighbour card is decided by "${winner.selector}" ` +
              `(${winner.spec}), not the neighbour highlight. Competing rules: ` +
              setters.map(r => `${r.selector} (${r.spec})`).join(' | ')
          ).toBe(true)
        })
      }
    }
  }
})
