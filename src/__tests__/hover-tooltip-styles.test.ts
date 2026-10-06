/**
 * Gate tests for the hover tooltip's content spacing (PRODUCT_DESIGN.md >
 * Semantic Zooming > Hover tooltip content).
 *
 * A second `.hover-tooltip-content` rule in the shared overlay stylesheet set
 * `white-space: pre-wrap`. The component's own scoped rule did not mention
 * white-space, so the shared one applied to the rendered Markdown and every
 * line break the renderer emits between block elements became an empty line.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

const SRC = resolve(__dirname, '..')
const COMPONENT = join(SRC, 'canvas/components/CanvasHoverTooltip.vue')

interface Rule {
  selectors: string[]
  declarations: string
}

function sourceFiles(dir: string): string[] {
  const found: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === '__tests__' || entry.name === 'node_modules') continue
      found.push(...sourceFiles(path))
    } else if (entry.name.endsWith('.css') || entry.name.endsWith('.vue')) {
      found.push(path)
    }
  }
  return found
}

/** The CSS a file contributes: all of a stylesheet, the style blocks of a component */
function stylesOf(file: string): string {
  const text = readFileSync(file, 'utf8')
  const css = file.endsWith('.vue')
    ? [...text.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(m => m[1]).join('\n')
    : text
  return css.replace(/\/\*[\s\S]*?\*\//g, '')
}

/** Split on a separator that is not inside parentheses, so `:is(a, b)` stays whole */
function splitTopLevel(text: string, isSeparator: (char: string) => boolean): string[] {
  const parts: string[] = []
  let depth = 0
  let current = ''
  for (const char of text) {
    if (char === '(') depth++
    if (char === ')') depth--
    if (depth === 0 && isSeparator(char)) {
      parts.push(current)
      current = ''
    } else {
      current += char
    }
  }
  parts.push(current)
  return parts.map(part => part.trim()).filter(Boolean)
}

function rulesOf(css: string): Rule[] {
  return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(match => ({
    selectors: splitTopLevel(match[1], char => char === ','),
    declarations: match[2],
  }))
}

/** The compound selector naming the element a selector styles: its last one */
function subject(selector: string): string {
  const compounds = splitTopLevel(selector, char => /[\s>+~]/.test(char))
  return compounds[compounds.length - 1] ?? ''
}

const stylesTooltipElement = (selector: string) => /\.hover-tooltip/.test(subject(selector))

describe('hover tooltip styles', () => {
  it('are declared in the tooltip component alone', () => {
    const offenders: string[] = []
    for (const file of sourceFiles(SRC)) {
      if (file === COMPONENT) continue
      for (const rule of rulesOf(stylesOf(file))) {
        for (const selector of rule.selectors.filter(stylesTooltipElement)) {
          offenders.push(`${relative(SRC, file)}: ${selector}`)
        }
      }
    }
    expect(offenders, 'the tooltip is styled from outside its component').toEqual([])
  })

  const componentRules = rulesOf(stylesOf(COMPONENT))
  const declarationsFor = (className: string) =>
    componentRules
      .filter(rule => rule.selectors.some(selector => subject(selector) === `.${className}`))
      .map(rule => rule.declarations)
      .join(';')

  it('take the spacing of rendered Markdown from block margins, not from source whitespace', () => {
    expect(declarationsFor('hover-tooltip-content')).not.toMatch(/white-space\s*:\s*(pre|break-spaces)/)
  })

  it('keep the line breaks of the plain-text fallback, which has no other structure', () => {
    expect(declarationsFor('hover-tooltip-plain')).toMatch(/white-space\s*:\s*pre-wrap/)
  })

  it('mark only the plain-text fallback as plain', () => {
    const template = readFileSync(COMPONENT, 'utf8').split('<style')[0]
    const contentTags = [...template.matchAll(/<div[^>]*class="[^"]*\bhover-tooltip-content\b[^"]*"[^>]*>/g)].map(m => m[0])
    const rendered = contentTags.filter(tag => tag.includes('v-html'))
    const plain = contentTags.filter(tag => !tag.includes('v-html'))

    expect(rendered).toHaveLength(1)
    expect(plain).toHaveLength(1)
    expect(rendered[0]).not.toContain('hover-tooltip-plain')
    expect(plain[0]).toContain('hover-tooltip-plain')
  })
})
