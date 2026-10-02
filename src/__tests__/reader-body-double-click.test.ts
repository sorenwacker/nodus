/**
 * Double-clicking a section's text in the reader edits it
 * (PRODUCT_DESIGN.md > Editing in the reader).
 *
 * The gesture had been moved to the title alone, while the body kept the
 * tooltip "Double-click to edit" and did nothing.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { doubleClickEditsSection } from '../lib/readerEditGesture'

function inside(html: string, selector: string): Element {
  const host = document.createElement('div')
  host.className = 'section-content'
  host.innerHTML = html
  return host.querySelector(selector)!
}

describe('a double-click in a section body', () => {
  it('edits the section when it lands on text', () => {
    expect(doubleClickEditsSection(inside('<p>some <strong>bold</strong> text</p>', 'p'))).toBe(true)
    expect(doubleClickEditsSection(inside('<p>some <strong>bold</strong> text</p>', 'strong'))).toBe(true)
  })

  it('keeps its own meaning on a link, a button or a field', () => {
    expect(doubleClickEditsSection(inside('<p><a href="#x">a <em>link</em></a></p>', 'em'))).toBe(false)
    expect(doubleClickEditsSection(inside('<button><span>copy</span></button>', 'span'))).toBe(false)
    expect(doubleClickEditsSection(inside('<input type="checkbox" />', 'input'))).toBe(false)
  })

  it('does nothing without a target', () => {
    expect(doubleClickEditsSection(null)).toBe(false)
  })
})

describe('the reader', () => {
  const reader = readFileSync(join(__dirname, '..', 'components', 'StorylineReader.vue'), 'utf8')

  it('binds the gesture on the section body as well as on the title', () => {
    const body = reader.slice(reader.indexOf('class="section-content"'))
    const tag = body.slice(0, body.indexOf('></div>'))
    expect(tag).toContain('@dblclick="doubleClickEditsSection($event.target) && startSectionEdit(node)"')
    expect(reader).toMatch(/<h2 class="section-title"[^>]*@dblclick="startSectionEdit\(node\)"/)
  })
})
