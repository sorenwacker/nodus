/**
 * Diagrams in the docs must parse. A broken mermaid block renders as an error
 * box on the docs site, which is worse than no diagram.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import mermaid from 'mermaid'

const DOCS = resolve(__dirname, '../../docs/content')

function markdownFiles(): string[] {
  return readdirSync(DOCS)
    .filter(name => name.endsWith('.md'))
    .map(name => join(DOCS, name))
}

function diagramsIn(file: string): string[] {
  const text = readFileSync(file, 'utf8')
  return [...text.matchAll(/```mermaid\n([\s\S]*?)```/g)].map(m => m[1])
}

describe('docs mermaid diagrams', () => {
  const found = markdownFiles().flatMap(file =>
    diagramsIn(file).map((code, i) => ({ file: file.replace(DOCS, 'docs/content'), i, code }))
  )

  it('finds the diagrams', () => {
    expect(found.length).toBeGreaterThan(0)
  })

  for (const { file, i, code } of found) {
    it(`parses ${file} diagram ${i + 1}`, async () => {
      mermaid.initialize({ startOnLoad: false })
      await expect(mermaid.parse(code)).resolves.toBeTruthy()
    })
  }
})
