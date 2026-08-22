/**
 * Everything bound with v-html must arrive sanitized.
 *
 * Two components render markup with v-html and suppress the lint rule on the
 * grounds that their source has been through DOMPurify. That claim is only
 * worth anything if it is tested: a note is a file on disk, and an imported
 * vault can contain anything.
 */
import { describe, it, expect } from 'vitest'
import { renderMarkdown } from '../services/MarkdownRenderService'
import { sanitizeHtml, sanitizeSvg, escapeText } from '../lib/sanitize'

const ATTACKS = [
  { name: 'inline script', input: '<script>window.__pwned = 1</script>' },
  { name: 'image error handler', input: '<img src="x" onerror="window.__pwned = 1">' },
  { name: 'javascript: link', input: '<a href="javascript:window.__pwned=1">click</a>' },
  { name: 'iframe', input: '<iframe src="https://example.com"></iframe>' },
  { name: 'svg onload', input: '<svg onload="window.__pwned = 1"></svg>' },
  { name: 'body onload', input: '<body onload="window.__pwned = 1">' },
  { name: 'form action', input: '<form action="https://evil.test"><input name="x"></form>' },
]

describe('markdown reaching v-html is sanitized', () => {
  for (const { name, input } of ATTACKS) {
    it(`strips a ${name} from rendered note content`, () => {
      const html = renderMarkdown(input)

      expect(html).not.toMatch(/<script/i)
      expect(html).not.toMatch(/\son\w+\s*=/i)
      expect(html).not.toMatch(/javascript:/i)
      expect(html).not.toMatch(/<iframe/i)
    })
  }

  it('keeps the markup a note legitimately needs', () => {
    const html = renderMarkdown('# Title\n\nSome **bold** text and a [link](https://example.com).')

    expect(html).toMatch(/<h1/i)
    expect(html).toMatch(/<strong/i)
    expect(html).toContain('https://example.com')
  })
})

describe('sanitize helpers', () => {
  for (const { name, input } of ATTACKS) {
    it(`sanitizeHtml removes a ${name}`, () => {
      const html = sanitizeHtml(input)
      expect(html).not.toMatch(/<script/i)
      expect(html).not.toMatch(/\son\w+\s*=/i)
      expect(html).not.toMatch(/javascript:/i)
      expect(html).not.toMatch(/<iframe/i)
    })
  }

  it('sanitizeSvg keeps drawing elements but drops handlers', () => {
    const svg = sanitizeSvg(
      '<svg viewBox="0 0 10 10" onload="window.__pwned=1"><path d="M0 0 L10 10"/><script>1</script></svg>'
    )
    expect(svg).toMatch(/<path/i)
    expect(svg).not.toMatch(/\son\w+\s*=/i)
    expect(svg).not.toMatch(/<script/i)
  })

  it('escapeText neutralises markup entirely', () => {
    expect(escapeText('<script>x</script>')).not.toMatch(/<script/i)
  })
})
