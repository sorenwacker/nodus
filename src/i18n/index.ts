/**
 * Internationalization (i18n) setup
 * Uses vue-i18n for multi-language support
 */
import { createI18n } from 'vue-i18n'
import en from './locales/en.json'
import de from './locales/de.json'
import fr from './locales/fr.json'
import es from './locales/es.json'
import it from './locales/it.json'

// Detect browser language or use stored preference
function getDefaultLocale(): string {
  const stored = localStorage.getItem('nodus-locale')
  if (stored) return stored

  const browserLang = navigator.language.split('-')[0]
  // Return browser language if we have translations, otherwise default to English
  const supportedLocales = ['en', 'de', 'fr', 'es', 'it']
  return supportedLocales.includes(browserLang) ? browserLang : 'en'
}

export const i18n = createI18n({
  legacy: false, // Use Composition API mode
  locale: getDefaultLocale(),
  fallbackLocale: 'en',
  messages: {
    en,
    de,
    fr,
    es,
    it,
  },
})

export function setLocale(locale: string) {
  i18n.global.locale.value = locale
  localStorage.setItem('nodus-locale', locale)
  document.documentElement.setAttribute('lang', locale)
}

export function getLocale(): string {
  return i18n.global.locale.value
}

// Lazy load additional locales
export async function loadLocale(locale: string): Promise<void> {
  if (i18n.global.availableLocales.includes(locale)) {
    return // Already loaded
  }

  try {
    const messages = await import(`./locales/${locale}.json`)
    i18n.global.setLocaleMessage(locale, messages.default)
  } catch {
    console.warn(`Failed to load locale: ${locale}`)
  }
}
