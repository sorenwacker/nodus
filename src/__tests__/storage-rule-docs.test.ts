/**
 * The documentation states one storage rule for node text
 * (PRODUCT_DESIGN.md > Storage of node text).
 *
 * The design document said text lived only in .md files, while its own schema
 * and sync rules stored it in SQLite, and the code followed the schema. This
 * gate fails if a statement of the abandoned rule returns.
 */
import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const DOCS = resolve(process.cwd(), 'docs/content')

function markdownFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return markdownFiles(path)
    return entry.name.endsWith('.md') ? [path] : []
  })
}

const ABANDONED_RULE = [
  /NOT in SQLite/i,
  /SQLite for metadata\/positions only/i,
  /Keep text in \.md files/i,
  /never store (node )?text content in SQLite/i,
  /\.md files are (the )?source of truth for content/i,
]

describe('the storage rule for node text', () => {
  it('is stated in the design document', () => {
    const design = readFileSync(join(DOCS, 'PRODUCT_DESIGN.md'), 'utf8')
    expect(design).toContain('#### Storage of node text')
    expect(design).toMatch(/SQLite is the primary store for node text/)
  })

  it('is not contradicted anywhere in the documentation', () => {
    const contradictions = markdownFiles(DOCS).flatMap(file => {
      const text = readFileSync(file, 'utf8')
      return ABANDONED_RULE.filter(pattern => pattern.test(text)).map(pattern => `${file}: ${pattern}`)
    })
    expect(contradictions).toEqual([])
  })
})
