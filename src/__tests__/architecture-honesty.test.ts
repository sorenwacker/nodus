/**
 * The description must match the implementation
 * (PRODUCT_DESIGN.md > Canvas rendering).
 *
 * A PixiJS/WebGL renderer was specified, named after in the main canvas
 * component, and referenced throughout the documentation - and never built.
 * Nothing failed, because nothing checked. A codebase that describes an
 * intention as an implementation misleads every later decision made from it:
 * a real zoom optimisation was deleted in the belief that the absent renderer
 * made it unnecessary.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { resolve, join } from 'node:path'

const ROOT = resolve(__dirname, '../..')
const SRC = resolve(__dirname, '..')

function sourceFiles(dir: string): string[] {
  const found: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') continue
      found.push(...sourceFiles(path))
    } else if (/\.(ts|vue|js)$/.test(entry.name)) {
      found.push(path)
    }
  }
  return found
}

describe('declared dependencies are used', () => {
  it('imports every runtime dependency it declares', () => {
    // An unused dependency is either a plan nobody carried out or a removal
    // nobody finished; both mislead anyone reading package.json for the
    // architecture
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
    // Build configuration counts as use: a plugin is imported there, not in src
    const configs = ['vite.config.ts', 'index.html']
      .map(f => {
        try { return readFileSync(join(ROOT, f), 'utf8') } catch { return '' }
      })
      .join('\n')
    const sources = sourceFiles(SRC).map(f => readFileSync(f, 'utf8')).join('\n') + configs

    // Packages a build or runtime pulls in without an explicit import
    const implicit = new Set([
      'vue',
      'vue-router',
      'pinia',
      '@tauri-apps/api',
      // Type declarations are consumed by the compiler, never imported
      '@types/dagre',
    ])

    const unused = Object.keys(pkg.dependencies ?? {}).filter(name => {
      if (implicit.has(name)) return false
      return !sources.includes(`'${name}'`) && !sources.includes(`"${name}"`) &&
        !sources.includes(`'${name}/`) && !sources.includes(`"${name}/`)
    })

    expect(unused, 'declared but never imported').toEqual([])
  })
})

describe('the rendering description matches the renderer', () => {
  // Named renderers the project does not depend on. Discussing why one is not
  // used is honest; naming one as the technology in use is the failure this
  // gate exists for.
  const RENDERER_PACKAGES: Array<{ pkg: string; pattern: RegExp }> = [
    { pkg: 'pixi.js', pattern: /pixi\.?js/i },
    { pkg: 'three', pattern: /\bthree\.js\b/i },
    { pkg: 'regl', pattern: /\bregl\b/i },
  ]

  function declaredDependencies(): string[] {
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
    return Object.keys({ ...pkg.dependencies, ...pkg.devDependencies })
  }

  const absent = RENDERER_PACKAGES.filter(r => !declaredDependencies().includes(r.pkg))

  it('has no source referring to a renderer the project does not depend on', () => {
    // A comment reasoning from an absent renderer is how a real optimisation
    // came to be deleted
    const offenders: string[] = []
    for (const file of sourceFiles(SRC)) {
      if (file.endsWith('architecture-honesty.test.ts')) continue
      const text = readFileSync(file, 'utf8')
      for (const renderer of absent) {
        if (renderer.pattern.test(text)) offenders.push(`${file}: ${renderer.pkg}`)
      }
    }

    expect(offenders).toEqual([])
  })

  it('has no documentation naming one as the technology in use', () => {
    // .claude/CLAUDE.md is developer-local and untracked, so it is checked
    // when present rather than assumed
    const docs = [
      join(ROOT, 'docs/content/PRODUCT_DESIGN.md'),
      join(ROOT, '.claude/CLAUDE.md'),
    ].filter(existsSync)

    const offenders: string[] = []
    for (const doc of docs) {
      const lines = readFileSync(doc, 'utf8').split('\n')
      lines.forEach((line, i) => {
        // The paragraph recording why this gate exists names what it forbids
        if (line.toLowerCase().includes('a gate test fails')) return
        for (const renderer of absent) {
          if (renderer.pattern.test(line)) offenders.push(`${doc}:${i + 1} ${renderer.pkg}`)
        }
      })
    }

    expect(offenders, 'documentation names a renderer the project does not use').toEqual([])
  })
})
