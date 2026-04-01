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

export type SupportedLocale = 'en' | 'de' | 'fr' | 'es' | 'it'
const supportedLocales: SupportedLocale[] = ['en', 'de', 'fr', 'es', 'it']

function isValidLocale(locale: string): locale is SupportedLocale {
  return supportedLocales.includes(locale as SupportedLocale)
}

// Detect browser language or use stored preference
function getDefaultLocale(): SupportedLocale {
  const stored = localStorage.getItem('nodus-locale')
  if (stored && isValidLocale(stored)) return stored

  const browserLang = navigator.language.split('-')[0]
  // Return browser language if we have translations, otherwise default to English
  return isValidLocale(browserLang) ? browserLang : 'en'
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

export function setLocale(locale: SupportedLocale) {
  i18n.global.locale.value = locale
  localStorage.setItem('nodus-locale', locale)
  document.documentElement.setAttribute('lang', locale)
}

export function getLocale(): SupportedLocale {
  return i18n.global.locale.value as SupportedLocale
}

// Lazy load additional locales
export async function loadLocale(locale: SupportedLocale): Promise<void> {
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
