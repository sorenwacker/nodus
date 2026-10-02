/**
 * Every chip in the preview panel's metadata row has a style.
 *
 * The tag chips and their remove buttons were rendered with class names no
 * stylesheet defined, so tags appeared at body size with the remove button on
 * a line of its own (docs/content/features.md > Tags).
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const SRC = join(__dirname, '..')
const panel = readFileSync(join(SRC, 'canvas/components/CanvasPreviewPanel.vue'), 'utf8')
const styles = readFileSync(join(SRC, 'canvas/styles/canvas-overlays.css'), 'utf8')

/** The declarations of the first rule whose selector list names the class alone */
function rule(className: string): string | null {
  const match = new RegExp(`(?:^|[},])\\s*\\.${className}\\s*(?:,[^{]*)?\\{([^}]*)\\}`, 'm').exec(styles)
  return match ? match[1] : null
}

describe('the preview panel metadata row', () => {
  const metaRow = panel.slice(panel.indexOf('<div class="preview-meta">'), panel.indexOf('<!-- AI toolbar -->'))
  const classes = [...new Set([...metaRow.matchAll(/class="([^"]+)"/g)].flatMap(m => m[1].split(/\s+/)))].filter(c =>
    c.startsWith('preview-')
  )

  it('uses the chip classes this test knows about', () => {
    expect(classes).toContain('preview-tag-chip')
    expect(classes).toContain('preview-tag-remove')
  })

  it.each(classes)('styles .%s', className => {
    expect(rule(className), `no rule for .${className} in canvas-overlays.css`).not.toBeNull()
  })

  it('keeps a tag and its remove button on one line, in a row that wraps', () => {
    expect(rule('preview-tag-chip')).toMatch(/display:\s*inline-flex/)
    expect(rule('preview-tag-chip')).toMatch(/white-space:\s*nowrap/)
    expect(rule('preview-meta')).toMatch(/flex-wrap:\s*wrap/)
  })
})
