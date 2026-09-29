/**
 * The reader's text pane at the full-window step.
 *
 * The pane was a centred column capped at 800-900px even when the reader
 * filled the window, and its vertical scrolling implied horizontal scrolling,
 * so any slightly wide block let a sideways swipe shift the text
 * (features.md > Storyline Panel).
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const sfc = readFileSync(resolve(__dirname, '../components/StorylineReader.vue'), 'utf-8')

function rule(selector: string): string {
  const start = sfc.indexOf(`${selector} {`)
  expect(start, `${selector} rule exists`).toBeGreaterThan(-1)
  return sfc.slice(start, sfc.indexOf('}', start))
}

describe('the reader text pane', () => {
  it('scrolls vertically only', () => {
    const scroller = rule('.reader-scroll')
    expect(scroller).toMatch(/overflow-y:\s*auto/)
    expect(scroller).toMatch(/overflow-x:\s*hidden/)
    // A flex item otherwise grows to its widest child instead of wrapping
    expect(scroller).toMatch(/min-width:\s*0/)
    expect(rule('.reader-content')).toMatch(/min-width:\s*0/)
  })

  it('lets a wide table scroll inside its own box', () => {
    const table = rule('.section-content :deep(table)')
    expect(table).toMatch(/display:\s*block/)
    expect(table).toMatch(/overflow-x:\s*auto/)
    expect(table).toMatch(/max-width:\s*100%/)
  })

  it('spans the whole reader at the full-window step', () => {
    const pane = sfc.slice(sfc.indexOf('class="reader-content"'), sfc.indexOf('role="region"'))
    expect(pane).toMatch(/'fills-window':\s*fullWidth/)
    expect(rule('.reader-content.fills-window')).toMatch(/max-width:\s*none/)
  })
})
