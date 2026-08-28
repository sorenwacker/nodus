/**
 * A tool's schema says enough for a model to call it.
 *
 * Eight array parameters declared `type: 'array'` with no `items`, so nothing
 * told the model what an element looks like. It has to guess, and a guess that
 * is wrong arrives as an argument the handler cannot use
 * (PRODUCT_DESIGN.md > Declaring a tool's parameters).
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'

const TOOLS = resolve(__dirname, '../llm/tools')

function toolFiles(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) toolFiles(path, found)
    else if (entry.name.endsWith('.ts')) found.push(path)
  }
  return found
}

describe('tool parameter schemas', () => {
  const files = toolFiles(TOOLS)

  it('scans the tool definitions', () => {
    expect(files.length).toBeGreaterThan(5)
  })

  it('declares an element type for every array parameter', () => {
    const offenders: string[] = []

    for (const file of files) {
      const lines = readFileSync(file, 'utf-8').split('\n')
      lines.forEach((line, index) => {
        if (!line.includes("type: 'array'")) return
        // `items` may sit on the same line or within the same object literal
        const window = lines.slice(index, index + 6).join('\n')
        if (!window.includes('items')) {
          offenders.push(`${file.split('/src/')[1]}:${index + 1}`)
        }
      })
    }

    expect(
      offenders,
      `An array with no item type leaves the model guessing:\n  ${offenders.join('\n  ')}`
    ).toEqual([])
  })
})
