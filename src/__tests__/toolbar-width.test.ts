/**
 * The workspace selector must not size itself to its longest option.
 *
 * A <select> takes the intrinsic width of its widest option, so a workspace
 * named "Lorenz workshop - Beyond Models: Sustainable AI Infrastructure as a
 * Scientific Instrument" stretched the control across the toolbar and pushed
 * the search box and the icons past the right edge of the window. The name is
 * data, so no amount of care in the markup prevents it - only a bound does
 * (PRODUCT_DESIGN.md > Toolbar).
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const css = readFileSync(resolve(process.cwd(), 'src/App.css'), 'utf8')

function ruleFor(selector: string): string {
  const match = css.match(new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`))
  return match ? match[1] : ''
}

describe('workspace selector width', () => {
  it('is bounded, so a long workspace name cannot stretch the toolbar', () => {
    const rule = ruleFor('.workspace-selector select')
    expect(rule).toMatch(/max-width\s*:/)
  })

  it('keeps a minimum so the control stays usable when names are short', () => {
    expect(ruleFor('.workspace-selector select')).toMatch(/min-width\s*:/)
  })

  it('does not let the toolbar itself scroll sideways', () => {
    expect(ruleFor('.toolbar')).not.toMatch(/overflow-x\s*:\s*(auto|scroll)/)
  })
})
