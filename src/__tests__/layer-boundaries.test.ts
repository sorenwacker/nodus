/**
 * The shared layer does not depend on a consumer.
 *
 * `src/llm` is the shared layer and `src/canvas` consumes it. The batch
 * classifier imported its queue interface from a canvas composable, so library
 * code depended on a consumer and could not be used without it. The project
 * rule is that a boundary is held by a gate, not by review discipline.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'

const LLM = resolve(__dirname, '../llm')

function sourceFiles(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) sourceFiles(path, found)
    else if (entry.name.endsWith('.ts')) found.push(path)
  }
  return found
}

describe('the shared LLM layer', () => {
  const files = sourceFiles(LLM)

  it('scans the layer', () => {
    expect(files.length).toBeGreaterThan(10)
  })

  it('imports nothing from the canvas', () => {
    const offenders: string[] = []

    for (const file of files) {
      const text = readFileSync(file, 'utf-8')
      for (const match of text.matchAll(/from '([^']+)'/g)) {
        if (match[1].includes('canvas/')) {
          offenders.push(`${file.split('/src/')[1]} -> ${match[1]}`)
        }
      }
    }

    expect(offenders, 'the shared layer depending on a consumer').toEqual([])
  })
})
