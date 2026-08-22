/**
 * Documentation carries no emoji.
 *
 * Checking for emoji characters alone is not enough: the home page cards hid
 * theirs as HTML numeric entities (`&#x1F512;`), which every character-level
 * scan reported as clean while the published page showed a padlock.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'

const DOCS = resolve(__dirname, '../../docs/content')
const README = resolve(__dirname, '../../README.md')

/** Pictographs and emoji blocks; typographic arrows and maths signs are fine */
const EMOJI_CHAR =
  /[\u{1F300}-\u{1FAFF}]|[\u{1F000}-\u{1F2FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|\u{FE0F}/u

/** The same ranges written as HTML numeric entities, decimal or hex */
const EMOJI_ENTITY = /&#x?([0-9A-Fa-f]+);/g

function isEmojiCodePoint(value: number): boolean {
  return (
    (value >= 0x1f000 && value <= 0x1faff) ||
    (value >= 0x2600 && value <= 0x27bf) ||
    value === 0xfe0f
  )
}

function sources(): string[] {
  const found: string[] = []
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry)
      if (statSync(path).isDirectory()) walk(path)
      else if (path.endsWith('.md')) found.push(path)
    }
  }
  walk(DOCS)
  if (existsSync(README)) found.push(README)
  return found
}

describe('documentation has no emoji', () => {
  const files = sources()

  it('finds the documentation to check', () => {
    expect(files.length).toBeGreaterThan(3)
  })

  it('contains no emoji characters', () => {
    const offenders: string[] = []
    for (const file of files) {
      readFileSync(file, 'utf8')
        .split('\n')
        .forEach((line, i) => {
          if (EMOJI_CHAR.test(line)) offenders.push(`${file}:${i + 1}`)
        })
    }
    expect(offenders, `emoji characters found: ${offenders.join(', ')}`).toEqual([])
  })

  it('contains no emoji hidden as HTML entities', () => {
    const offenders: string[] = []
    for (const file of files) {
      readFileSync(file, 'utf8')
        .split('\n')
        .forEach((line, i) => {
          for (const [entity, digits] of line.matchAll(EMOJI_ENTITY)) {
            const value = entity.includes('x') ? parseInt(digits, 16) : parseInt(digits, 10)
            if (isEmojiCodePoint(value)) offenders.push(`${file}:${i + 1} (${entity})`)
          }
        })
    }
    expect(offenders, `emoji entities found: ${offenders.join(', ')}`).toEqual([])
  })
})
