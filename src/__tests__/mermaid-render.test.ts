/**
 * A mermaid block always leaves a placeholder to render into.
 *
 * renderMarkdown had a cache fast path that returned the stored SVG inline,
 * but the whole string then passes through sanitizeHtml, whose allowlist has
 * no SVG elements. The cache hit therefore produced an empty wrapper with no
 * `<pre class="mermaid">` for the async pass to fill: every cached diagram
 * rendered blank.
 */
import { describe, it, expect } from 'vitest'
import { renderMarkdown } from '../services/MarkdownRenderService'
import { sanitizeHtml } from '../lib/sanitize'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const DIAGRAM = '```mermaid\ngraph TD\n  A --> B\n```\n'

describe('mermaid rendering', () => {
  it('emits a placeholder the async pass can fill', () => {
    const html = renderMarkdown(DIAGRAM)

    expect(html).toContain('class="mermaid-wrapper"')
    expect(html).toContain('class="mermaid"')
    expect(html).toContain('graph TD')
  })

  it('does the same on a repeat render, when the cache is warm', () => {
    renderMarkdown(DIAGRAM)
    const second = renderMarkdown(DIAGRAM)

    expect(second).toContain('class="mermaid"')
  })

  it('never returns SVG through the sanitizer, which strips it', () => {
    // The reason the fast path could not work
    const stripped = sanitizeHtml('<div class="mermaid-wrapper"><svg id="x"><path d="M0 0"/></svg></div>')
    expect(stripped).not.toContain('svg')

    const service = readFileSync(
      resolve(__dirname, '../services/MarkdownRenderService.ts'),
      'utf-8'
    )
    const sync = service.slice(0, service.indexOf('Phase 2'))
    expect(sync).not.toMatch(/return `<div class="mermaid-wrapper">\$\{mermaidCache/)
  })
})
