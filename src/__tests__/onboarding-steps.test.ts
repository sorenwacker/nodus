/**
 * The first-run tour covers what distinguishes the product.
 *
 * Creating a node, connecting two, dropping a file and typing maths are all
 * discoverable by trying. Neighbourhood mode, storylines and the agent are not
 * discoverable at all, and a tour that omits them ends the first session with a
 * canvas of notes and no reason to come back
 * (PRODUCT_DESIGN.md > First-run tour).
 */
import { describe, it, expect } from 'vitest'
import { ONBOARDING_STEPS } from '../lib/onboardingSteps'
import en from '../i18n/locales/en.json'
import de from '../i18n/locales/de.json'
import es from '../i18n/locales/es.json'
import fr from '../i18n/locales/fr.json'
import itIT from '../i18n/locales/it.json'

const LOCALES = { en, de, es, fr, it: itIT } as Record<string, { onboarding: Record<string, unknown> }>

describe('the first-run tour', () => {
  it('teaches the features nobody would guess', () => {
    const keys = ONBOARDING_STEPS.map(step => step.key)
    for (const taught of ['neighborhood', 'storylines', 'agent']) {
      expect(keys, `the tour never mentions ${taught}`).toContain(taught)
    }
  })

  it('keeps teaching the basics as well', () => {
    const keys = ONBOARDING_STEPS.map(step => step.key)
    expect(keys.slice(0, 2)).toEqual(['language', 'welcome'])
    for (const basic of ['nodes', 'edges', 'import', 'math']) {
      expect(keys).toContain(basic)
    }
  })

  it('gives every step an icon of its own', () => {
    const icons = ONBOARDING_STEPS.map(step => step.icon)
    expect(new Set(icons).size).toBe(icons.length)
  })

  it.each(Object.keys(LOCALES))('has every step written in %s', locale => {
    const onboarding = LOCALES[locale].onboarding as Record<
      string,
      { title?: string; description?: string }
    >
    for (const { key } of ONBOARDING_STEPS) {
      const step = onboarding[key]
      expect(step, `${locale} is missing the ${key} step`).toBeDefined()
      expect(step.title?.length, `${locale}.${key} has no title`).toBeGreaterThan(0)
      expect(step.description?.length, `${locale}.${key} has no description`).toBeGreaterThan(0)
    }
  })

  it('does not leave a step in English in a translated tour', () => {
    for (const locale of ['de', 'es', 'fr', 'it']) {
      const translated = LOCALES[locale].onboarding as Record<string, { description?: string }>
      const english = LOCALES.en.onboarding as Record<string, { description?: string }>
      for (const { key } of ONBOARDING_STEPS) {
        if (key === 'language') continue // the language step names the languages themselves
        expect(
          translated[key]?.description,
          `${locale}.${key} is the English string`
        ).not.toBe(english[key]?.description)
      }
    }
  })
})
