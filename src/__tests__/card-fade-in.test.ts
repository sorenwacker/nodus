/**
 * A card that arrives mid-pan fades in rather than popping.
 *
 * Newly visible cards are admitted a few per frame so a column crossing the
 * viewport margin cannot mount at once. They normally arrive in the margin,
 * off screen, and are fully faded by the time they are visible; on a fast drag,
 * when staging falls behind, the fade is what stops them appearing abruptly in
 * the middle of the view (PRODUCT_DESIGN.md > Staging what the viewport mounts).
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const css = readFileSync(resolve(process.cwd(), 'src/canvas/styles/node-card.css'), 'utf8')

describe('card arrival', () => {
  it('fades a card in when it mounts', () => {
    const rule = css.match(/\.node-card\s*\{([^}]*)\}/)
    expect(rule).not.toBeNull()
    expect(rule![1]).toMatch(/animation\s*:/)
  })

  it('defines the animation it names', () => {
    const rule = css.match(/\.node-card\s*\{([^}]*)\}/)![1]
    const name = rule.match(/animation\s*:\s*([\w-]+)/)![1]
    expect(css).toMatch(new RegExp(`@keyframes\\s+${name}\\b`))
  })

  it('is brief enough not to trail behind a pan', () => {
    const rule = css.match(/\.node-card\s*\{([^}]*)\}/)![1]
    const ms = Number(rule.match(/animation\s*:\s*[\w-]+\s+(\d+)ms/)![1])
    expect(ms).toBeGreaterThan(0)
    expect(ms).toBeLessThanOrEqual(200)
  })

  it('animates opacity only, so it composites rather than repaints', () => {
    const rule = css.match(/\.node-card\s*\{([^}]*)\}/)![1]
    const name = rule.match(/animation\s*:\s*([\w-]+)/)![1]
    const frames = css.match(new RegExp(`@keyframes\\s+${name}\\s*\\{([\\s\\S]*?)\\n\\}`))![1]
    expect(frames).toMatch(/opacity/)
    expect(frames).not.toMatch(/width|height|margin|padding|top|left/)
  })

  it('is dropped for anyone who asked for less motion', () => {
    expect(css).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)/)
  })
})
