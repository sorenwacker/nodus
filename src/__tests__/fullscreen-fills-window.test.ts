/**
 * The fullscreen view fills the application window.
 *
 * It was a dialog at 90% by 85% of the window over a dimmed canvas, so the
 * toolbar, panels and canvas stayed visible around the note being written
 * (features.md > Fullscreen Editor).
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const sfc = readFileSync(resolve(__dirname, '../components/FullscreenNodeModal.vue'), 'utf-8')

function rule(selector: string): string {
  const start = sfc.indexOf(`${selector} {`)
  expect(start, `${selector} rule exists`).toBeGreaterThan(-1)
  return sfc.slice(start, sfc.indexOf('}', start))
}

describe('the fullscreen view', () => {
  it('covers the window edge to edge with an opaque surface', () => {
    const root = rule('.fullscreen-modal-backdrop')
    expect(root).toMatch(/position:\s*fixed/)
    expect(root).toMatch(/inset:\s*0/)
    expect(root).toMatch(/background:\s*var\(--bg-surface\)/)
  })

  it('is not a box inside the window', () => {
    const content = rule('.fullscreen-modal-content')
    expect(content).not.toMatch(/\d+v[wh]/)
    expect(content).not.toMatch(/max-width/)
    expect(content).not.toMatch(/border-radius/)
    expect(content).not.toMatch(/box-shadow/)
  })

  it('has no outside to click', () => {
    // Nothing of the window lies outside the view, so a click inside it must
    // never be read as a click outside that closes it
    const root = sfc.slice(sfc.indexOf('class="fullscreen-modal-backdrop"'), sfc.indexOf('class="fullscreen-modal-content"'))
    expect(root).not.toMatch(/@click=/)
  })
})
