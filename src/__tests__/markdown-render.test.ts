import { describe, it, expect } from 'vitest'
import { parseMarkdown } from '../lib/markdown'

// The custom code renderer previously interpolated code text raw, so angle
// brackets in a fenced block were parsed as HTML (and later stripped) and the
// block became an HTML-injection point into the pre-sanitization pipeline.
describe('parseMarkdown code blocks', () => {
  it('escapes angle brackets so code content is preserved', () => {
    const html = parseMarkdown('```c\n#include <stdio.h>\n```')
    expect(html).toContain('#include &lt;stdio.h&gt;')
    expect(html).not.toContain('<stdio.h>')
  })

  it('escapes HTML injected via a code fence', () => {
    const html = parseMarkdown('```\n<img src=x onerror=alert(1)>\n```')
    expect(html).not.toContain('<img src=x')
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;')
  })

  it('escapes ampersands', () => {
    const html = parseMarkdown('```\na && b\n```')
    expect(html).toContain('a &amp;&amp; b')
  })

  it('escapes a language label used in the class attribute', () => {
    const html = parseMarkdown('```"><script>\ncode\n```')
    expect(html).not.toContain('"><script>')
  })
})
