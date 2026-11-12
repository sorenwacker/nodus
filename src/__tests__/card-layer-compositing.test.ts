/**
 * Each card is composited on its own layer.
 *
 * The nodes layer is otherwise one painted surface whose bounds are the union
 * of its cards, and a card mounting or moving outside the bounds so far
 * re-rasterised every card in it: 180 to 420 ms on 93 collapsed cards while
 * zooming out, against 0 to 18 ms with a layer per card
 * (PRODUCT_DESIGN.md > Zooming a canvas of cards).
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('card compositing', () => {
  it('gives every card a layer of its own', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/canvas/styles/node-card.css'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
    const start = css.indexOf('\n.node-card {')
    const rule = css.slice(start, css.indexOf('}', start))
    expect(rule).toMatch(/will-change:\s*transform/)
  })
})
