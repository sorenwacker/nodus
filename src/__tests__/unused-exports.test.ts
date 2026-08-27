/**
 * Nothing is exported that nobody imports.
 *
 * The project rule is to remove dead code, and it had no enforcement: 37
 * exported functions and values were referenced from nowhere at all, and 19
 * more were exported while only their own file used them. Both are how a
 * reader comes to believe an interface exists (PRODUCT_DESIGN.md > Removing
 * dead code).
 *
 * Types are not checked. An exported type describes a module's shape and is
 * worth declaring whether or not another file names it.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'fs'
import { join, relative } from 'path'

const SRC = join(__dirname, '..')
const REPO = join(__dirname, '../..')

/** Functions, classes and values. Not `type` or `interface`. */
const EXPORTED_VALUE = /^export\s+(?:async\s+)?(?:function|const|class)\s+(\w+)/gm

function sourceFiles(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', 'dist'].includes(entry.name)) continue
    const path = join(dir, entry.name)
    if (entry.isDirectory()) {
      sourceFiles(path, found)
    } else if (entry.name.endsWith('.ts') || entry.name.endsWith('.vue')) {
      found.push(path)
    }
  }
  return found
}

describe('exported values are imported somewhere', () => {
  const files = sourceFiles(SRC)
  const texts = new Map(files.map(f => [f, readFileSync(f, 'utf-8')]))
  const isTest = (path: string) => path.includes('__tests__')

  it('scans the source tree', () => {
    expect(files.filter(f => !isTest(f)).length).toBeGreaterThan(100)
  })

  it('has no exported value that no other file names', () => {
    const orphans: string[] = []

    for (const [path, text] of texts) {
      if (isTest(path)) continue
      for (const match of text.matchAll(EXPORTED_VALUE)) {
        const name = match[1]
        const word = new RegExp(`\\b${name}\\b`)
        const namedElsewhere = [...texts.entries()].some(
          ([other, otherText]) => other !== path && word.test(otherText)
        )
        if (namedElsewhere) continue

        // Used inside its own file? Then the export is what is unused.
        const ownUses = (text.match(new RegExp(`\\b${name}\\b`, 'g')) ?? []).length - 1
        const reason = ownUses > 0 ? 'exported but only used here' : 'referenced nowhere'
        orphans.push(`${relative(REPO, path)}::${name} (${reason})`)
      }
    }

    expect(
      orphans,
      `Delete these, or stop exporting them. An export nobody imports reads as ` +
        `an interface that exists:\n  ${orphans.join('\n  ')}`
    ).toEqual([])
  })
})
