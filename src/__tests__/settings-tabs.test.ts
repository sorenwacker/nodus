import { describe, it, expect } from 'vitest'
import { SETTINGS_TABS } from '../components/settings/tabs'
import en from '../i18n/locales/en.json'
import de from '../i18n/locales/de.json'
import fr from '../i18n/locales/fr.json'
import es from '../i18n/locales/es.json'
import it_ from '../i18n/locales/it.json'

const locales: Record<string, unknown> = { en, de, fr, es, it: it_ }

function resolveKey(messages: unknown, key: string): unknown {
  return key.split('.').reduce<unknown>(
    (obj, part) => (obj as Record<string, unknown> | undefined)?.[part],
    messages
  )
}

describe('settings tab layout', () => {
  it('has the six merged tabs in the documented order', () => {
    expect(SETTINGS_TABS.map(t => t.id)).toEqual([
      'general',
      'appearance',
      'canvas',
      'ai',
      'citations',
      'integrations',
    ])
  })

  it('has no separate Zotero tab; Zotero lives inside Citations', () => {
    expect(SETTINGS_TABS.some(t => t.id === 'zotero')).toBe(false)
    expect(resolveKey(en, 'settings.tabs.zotero')).toBeUndefined()
  })

  it('resolves every tab label in every locale', () => {
    for (const [name, messages] of Object.entries(locales)) {
      for (const tab of SETTINGS_TABS) {
        expect(
          typeof resolveKey(messages, tab.labelKey),
          `${tab.labelKey} missing in ${name}`
        ).toBe('string')
      }
    }
  })

  it('resolves the About & License section label in every locale', () => {
    for (const [name, messages] of Object.entries(locales)) {
      expect(
        typeof resolveKey(messages, 'settings.aboutAndLicense'),
        `settings.aboutAndLicense missing in ${name}`
      ).toBe('string')
    }
  })
})
