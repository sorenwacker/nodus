/**
 * One module makes the research calls.
 *
 * Wikipedia search was written three times over: in the node agent, inline in
 * the marker handlers, and beside the article fetch it belongs with. The
 * timeouts and result shapes differed, so a fix to one left the others as they
 * were (PRODUCT_DESIGN.md > Where research calls live).
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'

const SRC = resolve(__dirname, '..')

function sourceFiles(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '__tests__' || entry.name === 'node_modules') continue
    const path = join(dir, entry.name)
    if (entry.isDirectory()) sourceFiles(path, found)
    else if (entry.name.endsWith('.ts') || entry.name.endsWith('.vue')) found.push(path)
  }
  return found
}

describe('the Wikipedia calls', () => {
  const files = sourceFiles(SRC)

  it('scans the source', () => {
    expect(files.length).toBeGreaterThan(50)
  })

  it('are made in one module', () => {
    const callers = files.filter(f =>
      readFileSync(f, 'utf-8').includes('en.wikipedia.org/w/api.php')
    )

    expect(
      callers.map(f => f.split('/src/')[1]),
      'the same request written in more than one place'
    ).toEqual(['llm/research.ts'])
  })

  it('offer a search the other callers can use', async () => {
    const research = await import('../llm/research')

    expect(typeof (research as { searchWikipedia?: unknown }).searchWikipedia).toBe('function')
  })
})
