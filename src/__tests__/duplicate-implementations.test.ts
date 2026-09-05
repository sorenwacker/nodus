/**
 * One rule, one implementation.
 *
 * Almost every defect found late in this codebase had the same shape: a rule
 * written in several places, with the fix landing in only some of them. The
 * frontmatter check existed three times and one copy was blind to CRLF. The
 * availability probe existed four times and three were wrong. The trash logic
 * existed three times and disagreed on failure. A review reads files one at a
 * time and cannot see that two of them should be one.
 *
 * This finds the class rather than the instances: identical bodies, and - more
 * dangerous - the same name over different bodies, which is a copy that has
 * already drifted (PRODUCT_DESIGN.md > One rule, one place).
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'fs'
import { join, relative } from 'path'
import { createHash } from 'crypto'

const SRC = join(__dirname, '..')
const REPO = join(__dirname, '../..')

/** Bodies shorter than this are too small for duplication to mean anything. */
const MIN_BODY_CHARS = 200

interface FunctionBody {
  name: string
  file: string
  normalised: string
  /** Only an exported name is part of an interface others depend on */
  exported: boolean
}

function sourceFiles(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', 'dist', '__tests__'].includes(entry.name)) continue
    const path = join(dir, entry.name)
    if (entry.isDirectory()) {
      sourceFiles(path, found)
    } else if (entry.name.endsWith('.ts') || entry.name.endsWith('.vue')) {
      found.push(path)
    }
  }
  return found
}

/** Comments and whitespace removed, so formatting differences do not hide a copy. */
function normalise(body: string): string {
  return body
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function functionBodies(text: string, file: string): FunctionBody[] {
  const bodies: FunctionBody[] = []
  const declaration = /(export\s+)?(?:async\s+)?function\s+(\w+)\s*[<(]/g

  let match: RegExpExecArray | null
  while ((match = declaration.exec(text)) !== null) {
    const open = text.indexOf('{', match.index + match[0].length - 1)
    if (open < 0) continue

    let depth = 0
    for (let i = open; i < text.length; i++) {
      if (text[i] === '{') depth++
      else if (text[i] === '}') {
        depth--
        if (depth === 0) {
          const normalised = normalise(text.slice(open, i + 1))
          if (normalised.length >= MIN_BODY_CHARS) {
            bodies.push({
              name: match[2],
              file,
              normalised,
              exported: Boolean(match[1]),
            })
          }
          break
        }
      }
    }
  }
  return bodies
}

function allBodies(): FunctionBody[] {
  return sourceFiles(SRC).flatMap(file =>
    functionBodies(readFileSync(file, 'utf-8'), relative(REPO, file))
  )
}

/**
 * Same name, different body, different file. Each entry is either a fork that
 * has drifted or two unrelated things sharing a name - both worth naming.
 *
 * Recorded with the count they had when this gate was added: an entry may
 * shrink, never grow, and no new name may appear. Delete an entry once its
 * copies are consolidated.
 */
const KNOWN_DRIFT: Record<string, number> = {
  // Empty, and worth keeping empty. Every entry here is a place where the next
  // fix lands in one copy and not the other.
}

describe('duplicate implementations', () => {
  const bodies = allBodies()

  it('scans the source tree', () => {
    expect(bodies.length).toBeGreaterThan(100)
  })

  it('has no two functions with an identical body', () => {
    const byBody = new Map<string, FunctionBody[]>()
    for (const body of bodies) {
      const key = createHash('sha256').update(body.normalised).digest('hex')
      const group = byBody.get(key) ?? []
      group.push(body)
      byBody.set(key, group)
    }

    const duplicates = [...byBody.values()]
      .filter(group => group.length > 1)
      .map(group => group.map(b => `${b.file}::${b.name}`).join(' == '))

    expect(
      duplicates,
      `These bodies are identical. Keep one and import it, or the next fix will ` +
        `land in one copy only:\n  ${duplicates.join('\n  ')}`
    ).toEqual([])
  })

  it('adds no new exported name carrying more than one implementation', () => {
    // Local handlers legitimately share ordinary names - `run`, `animate`,
    // `onPointerDown`. An exported name is a contract, and two of them is the
    // shape every drifted copy found in this codebase had.
    const byName = new Map<string, Set<string>>()
    for (const body of bodies.filter(b => b.exported)) {
      const shapes = byName.get(body.name) ?? new Set<string>()
      shapes.add(body.normalised)
      byName.set(body.name, shapes)
    }

    const drifted = [...byName.entries()]
      .filter(([, shapes]) => shapes.size > 1)
      .map(([name, shapes]) => ({ name, count: shapes.size }))

    const unrecorded = drifted
      .filter(d => !(d.name in KNOWN_DRIFT))
      .map(d => `${d.name} (${d.count} implementations)`)

    expect(
      unrecorded,
      `These names carry more than one implementation. One of them will be the ` +
        `one a fix misses:\n  ${unrecorded.join('\n  ')}`
    ).toEqual([])

    const grown = drifted
      .filter(d => d.name in KNOWN_DRIFT && d.count > KNOWN_DRIFT[d.name])
      .map(d => `${d.name}: ${KNOWN_DRIFT[d.name]} -> ${d.count}`)

    expect(grown, `These gained another copy:\n  ${grown.join('\n  ')}`).toEqual([])
  })

  /**
   * A syntax pattern is not a named function, so the body scan above cannot see
   * it. Wikilink syntax had five separate literals - the frontmatter parser, the
   * markdown renderer, the file-rename path, the references sidebar and the
   * fullscreen editor - and they had already drifted over whether an empty
   * alias counts, so the same text was a link in one view and prose in another.
   * Derived by scanning, so a sixth copy fails here rather than being counted
   * by hand.
   */
  it('defines wikilink syntax in one place', () => {
    const owner = join(SRC, 'lib/contentParser.ts')
    const offenders = sourceFiles(SRC)
      .filter((file) => file !== owner)
      .filter((file) => /\\\[\\\[/.test(readFileSync(file, 'utf8')))
      .map((file) => relative(REPO, file))

    expect(
      offenders,
      'These carry their own copy of the wikilink pattern. Use ' +
        `wikilinkPattern() or matchWikilinks() from lib/contentParser:\n  ${offenders.join('\n  ')}`
    ).toEqual([])
  })

  it('drops an entry once its copies are consolidated', () => {
    const names = new Map<string, Set<string>>()
    for (const body of bodies.filter(b => b.exported)) {
      const shapes = names.get(body.name) ?? new Set<string>()
      shapes.add(body.normalised)
      names.set(body.name, shapes)
    }

    const stale = Object.keys(KNOWN_DRIFT).filter(name => (names.get(name)?.size ?? 0) <= 1)

    expect(
      stale,
      `These names now have one implementation. Remove them from KNOWN_DRIFT:\n  ` +
        stale.join('\n  ')
    ).toEqual([])
  })
})
