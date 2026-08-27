/**
 * Every locale has every key.
 *
 * 29 keys existed only in `en.json`. vue-i18n falls back to English silently,
 * so the MCP settings panel, three storyline labels and four edge settings
 * appeared in English to a reader using any of the four other locales, with
 * nothing to indicate a translation was missing
 * (PRODUCT_DESIGN.md > Localisation).
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'

const LOCALES = join(__dirname, '../i18n/locales')

type Messages = { [key: string]: string | Messages }

function load(lang: string): Messages {
  return JSON.parse(readFileSync(join(LOCALES, `${lang}.json`), 'utf-8'))
}

/** Dotted key paths, so a nested group is compared key by key. */
function keyPaths(messages: Messages, prefix = ''): string[] {
  return Object.entries(messages).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key
    return typeof value === 'string' ? [path] : keyPaths(value, path)
  })
}

const languages = readdirSync(LOCALES)
  .filter(f => f.endsWith('.json'))
  .map(f => f.replace('.json', ''))

describe('locale parity', () => {
  it('ships more than one locale', () => {
    expect(languages).toContain('en')
    expect(languages.length).toBeGreaterThan(1)
  })

  const english = keyPaths(load('en'))

  it.each(languages.filter(l => l !== 'en'))('%s has every key English has', lang => {
    const theirs = new Set(keyPaths(load(lang)))
    const missing = english.filter(k => !theirs.has(k))

    expect(
      missing,
      `${lang}.json is missing ${missing.length} keys, which fall back to ` +
        `English with nothing shown to say so:\n  ${missing.join('\n  ')}`
    ).toEqual([])
  })

  it.each(languages.filter(l => l !== 'en'))('%s has no key English lacks', lang => {
    const theirs = keyPaths(load(lang))
    const englishKeys = new Set(english)
    const orphans = theirs.filter(k => !englishKeys.has(k))

    expect(
      orphans,
      `${lang}.json has keys no longer in en.json, so nothing reads them:\n  ` +
        orphans.join('\n  ')
    ).toEqual([])
  })

  it('has no empty translation', () => {
    const empty: string[] = []
    for (const lang of languages) {
      const messages = load(lang)
      for (const path of keyPaths(messages)) {
        const value = path
          .split('.')
          .reduce<string | Messages>((acc, part) => (acc as Messages)[part], messages)
        if (typeof value === 'string' && value.trim() === '') empty.push(`${lang}: ${path}`)
      }
    }
    expect(empty, `An empty string is not a translation:\n  ${empty.join('\n  ')}`).toEqual([])
  })
})
