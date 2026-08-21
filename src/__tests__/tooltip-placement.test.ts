/**
 * Tooltip placement gate.
 *
 * Tooltips default to "below the element, centred on it". That is only safe
 * away from a window edge: on a control anchored to an edge, half the tooltip
 * (or all of it) lands off screen and the label cannot be read. Every
 * container that sits against an edge must therefore state a direction.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'

const SRC = resolve(__dirname, '..')

function sourceFiles(dir: string): string[] {
  const found: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === '__tests__' || entry.name === 'node_modules') continue
      found.push(...sourceFiles(path))
    } else if (entry.name.endsWith('.css') || entry.name.endsWith('.vue')) {
      found.push(path)
    }
  }
  return found
}

function allSource(): string {
  return sourceFiles(SRC)
    .map(f => readFileSync(f, 'utf8'))
    .join('\n')
}

/**
 * Containers whose controls sit against a window edge, and therefore need an
 * explicit tooltip direction rule somewhere in the stylesheets.
 */
const EDGE_ANCHORED_CONTAINERS = [
  '.toolbar-actions', // top-right: a centred tooltip overflows the right edge
  '.zoom-controls', // bottom: must open upward
  '.edge-filters', // bottom-left: must open upward, aligned left
  '.timelines-overlay', // window bottom: must open upward
  '.storyline-reveal', // right edge: must align right
  '.reader-overlay', // right edge: must align right
  '.graph-llm-bar .llm-input-row', // panel bottom: must open upward
]

describe('tooltip placement', () => {
  const source = allSource()

  it('gives every edge-anchored container a tooltip direction', () => {
    for (const container of EDGE_ANCHORED_CONTAINERS) {
      const rule = `${container} [data-tooltip]:hover::after`
      expect(
        source.includes(rule),
        `${container} holds controls against a window edge but has no tooltip direction rule ` +
          `(${rule}), so its tooltips open downward and centred and will be clipped`
      ).toBe(true)
    }
  })

  it('anchors the agent corner toggle tooltip to its left edge', () => {
    // Sits in the canvas's top-left corner: a centred tooltip runs off screen
    expect(source).toContain('button.agent-toggle-corner[data-tooltip]:hover::after')
  })

  it('has no untranslated tooltip text', () => {
    // A literal data-tooltip="..." is an English string the locales cannot reach
    const literals: string[] = []
    for (const file of sourceFiles(SRC)) {
      if (!file.endsWith('.vue')) continue
      const text = readFileSync(file, 'utf8')
      for (const match of text.matchAll(/\sdata-tooltip="([^"{]+)"/g)) {
        literals.push(`${file.replace(SRC, 'src')}: "${match[1]}"`)
      }
    }
    expect(
      literals,
      `hardcoded tooltip text cannot be translated: ${literals.join(', ')}`
    ).toEqual([])
  })
})
