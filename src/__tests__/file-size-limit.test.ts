/**
 * The 1000-line limit, enforced as a ratchet.
 *
 * The rule lived only in the project's prose and seven files had grown past it.
 * The files already over the limit are recorded below with the size they had
 * when this gate was added: they may shrink but not grow, and no other file may
 * cross the limit (PRODUCT_DESIGN.md > Enforcing the file size limit).
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'fs'
import { join, relative } from 'path'

const REPO_ROOT = join(__dirname, '../..')
const LIMIT = 1000

/**
 * Files over the limit when this gate was added, with the line count to beat.
 * Shrink an entry's number when you shrink the file; delete the entry once the
 * file is under the limit. Never raise a number.
 */
const OVER_LIMIT: Record<string, number> = {
  'src/canvas/GraphCanvas.vue': 2549,
  'src/App.vue': 1294,
  'src/lib/templates.ts': 1254,
  'src/components/StorylineReader.vue': 1214,
  'src/__tests__/layoutFrameIntegration.test.ts': 1205,
  'src/__tests__/frameCollision.test.ts': 1201,
  'src-tauri/src/commands/nodes.rs': 1098,
}

const EXTENSIONS = ['.ts', '.vue', '.rs']
const SKIP = new Set(['node_modules', 'target', 'dist', '.git', 'gen'])

function sourceFiles(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (SKIP.has(entry)) continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      sourceFiles(full, found)
    } else if (EXTENSIONS.some(ext => entry.endsWith(ext))) {
      found.push(full)
    }
  }
  return found
}

function lineCount(path: string): number {
  const text = readFileSync(path, 'utf-8')
  // Count newlines, as wc -l does, so a recorded number can be checked by hand
  return text.split('\n').length - (text.endsWith('\n') ? 1 : 0)
}

describe('file size limit', () => {
  const files = [
    ...sourceFiles(join(REPO_ROOT, 'src')),
    ...sourceFiles(join(REPO_ROOT, 'src-tauri/src')),
  ]

  it('scans the source tree', () => {
    expect(files.length).toBeGreaterThan(100)
  })

  it('keeps every unrecorded file under the limit', () => {
    const crossed: string[] = []

    for (const file of files) {
      // repo-relative, '/' separated: the keys above use that form
      const rel = relative(REPO_ROOT, file).split(/[\\/]/).join('/')
      if (rel in OVER_LIMIT) continue
      const lines = lineCount(file)
      if (lines > LIMIT) crossed.push(`${rel} (${lines} lines)`)
    }

    expect(
      crossed,
      `These files crossed the ${LIMIT}-line limit. Split them rather than ` +
        `recording them as exceptions:\n  ${crossed.join('\n  ')}`
    ).toEqual([])
  })

  it('never lets a recorded file grow', () => {
    const grown: string[] = []

    for (const [rel, recorded] of Object.entries(OVER_LIMIT)) {
      const lines = lineCount(join(REPO_ROOT, rel))
      if (lines > recorded) grown.push(`${rel}: ${recorded} -> ${lines} lines`)
    }

    expect(
      grown,
      `These files are already over the ${LIMIT}-line limit and grew further. ` +
        `Split them:\n  ${grown.join('\n  ')}`
    ).toEqual([])
  })

  it('drops an entry once its file is under the limit', () => {
    const stale: string[] = []

    for (const rel of Object.keys(OVER_LIMIT)) {
      const lines = lineCount(join(REPO_ROOT, rel))
      if (lines <= LIMIT) stale.push(`${rel} (${lines} lines)`)
    }

    expect(
      stale,
      `These files are under the limit and no longer need an exception. ` +
        `Remove them from OVER_LIMIT:\n  ${stale.join('\n  ')}`
    ).toEqual([])
  })
})
