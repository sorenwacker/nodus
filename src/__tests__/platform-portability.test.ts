/**
 * Portability to Windows and Linux
 * (PRODUCT_DESIGN.md > File paths across platforms).
 *
 * The project is developed on macOS and released for three platforms, so the
 * habits that only work on one of them have to fail here rather than in a
 * user's install: paths split on "/" alone, and modifier checks that accept
 * only the Command key.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve, relative } from 'node:path'

const SRC = resolve(__dirname, '..')

function sourceFiles(dir: string): string[] {
  const found: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === '__tests__' || entry.name === 'node_modules') continue
      found.push(...sourceFiles(path))
    } else if (/\.(ts|vue)$/.test(entry.name)) {
      found.push(path)
    }
  }
  return found
}

describe('file paths', () => {
  // A line may split on "/" when the string is not a raw file-system path -
  // a wikilink target, which uses "/" by convention on every platform, or a
  // path already normalised. Saying so at the site is the exemption, so the
  // reason travels with the code instead of living in a list here.
  const EXEMPT = /path-normalised|wikilink-target/

  it('splits raw file-system paths with the platform-aware helper', () => {
    const offenders: string[] = []
    for (const file of sourceFiles(SRC)) {
      const lines = readFileSync(file, 'utf8').split('\n')
      lines.forEach((line, i) => {
        if (!/\.split\(['"]\/['"]\)/.test(line)) return
        if (/https?:\/\//.test(line)) return
        const context = `${lines[i - 1] ?? ''}\n${line}`
        if (EXEMPT.test(context)) return
        offenders.push(`${relative(SRC, file)}:${i + 1}`)
      })
    }

    expect(
      offenders,
      'raw path splits break on Windows; use fileNameFromPath, or mark the line path-normalised or wikilink-target'
    ).toEqual([])
  })
})

describe('keyboard modifiers', () => {
  it('never accepts the Command key without its Control equivalent', () => {
    // Windows and Linux have no Command key
    const offenders: string[] = []
    for (const file of sourceFiles(SRC)) {
      const text = readFileSync(file, 'utf8')
      text.split('\n').forEach((line, i) => {
        if (line.includes('metaKey') && !line.includes('ctrlKey')) {
          offenders.push(`${relative(SRC, file)}:${i + 1}`)
        }
      })
    }

    expect(offenders, 'unreachable on Windows and Linux').toEqual([])
  })
})
